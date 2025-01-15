# services.py
import pandas as pd
from typing import Dict, List, Optional, Union
from django.core.files.base import File
from django.utils import timezone
from django.core.exceptions import ValidationError
from io import BytesIO
import pytz

from .models import (
    DataSourceMapping, DataImport, TimeSeriesData,
    MeasurementCategory, MeasurementType, MeasurementUnit,
    Measurement, APIDataSource
)
from .sources.clients import get_source_client

def get_measurement_value(mapping: DataSourceMapping) -> float:
    """Get current value for a measurement via its source mapping"""
    client = get_source_client(mapping.data_source)
    return client.get_point_value(mapping.source_identifiers)

def validate_measurement_columns(df: pd.DataFrame) -> Dict:
    """
    Validate measurement-related columns in DataFrame with enhanced validation
    including timezone and multiplier support.
    """
    required_cols = ['category', 'name']
    optional_cols = ['type', 'unit', 'multiplier', 'source_timezone']
    
    missing_required = [col for col in required_cols if col not in df.columns]
    if missing_required:
        raise ValueError(f"Required columns missing: {', '.join(missing_required)}")
    
    # Get available categories with prefetched relationships
    categories = MeasurementCategory.objects.prefetch_related(
        'types',
        'types__units'
    ).all()
    valid_categories = {cat.name.lower(): cat for cat in categories}
    
    # Build validation lookup dictionaries
    valid_types = {}
    valid_units = {}
    type_multiplier_support = {}
    
    for category in categories:
        category_types = {t.name.lower(): t for t in category.types.all()}
        valid_types[category.name.lower()] = category_types
        
        for type_obj in category.types.all():
            type_units = {u.name.lower(): u for u in type_obj.units.all()}
            valid_units[type_obj.name.lower()] = type_units
            type_multiplier_support[type_obj.name.lower()] = type_obj.supports_multipliers
    
    # Validate rows
    validation_errors = []
    for idx, row in df.iterrows():
        row_num = idx + 2  # Account for 0-based index and header row
        
        # Required field validations
        category = row.get('category', '').strip().lower()
        name = row.get('name', '').strip()
        
        if not category:
            validation_errors.append(f'Row {row_num}: Empty category')
            continue
            
        if not name:
            validation_errors.append(f'Row {row_num}: Empty name')
            continue
        
        if category not in valid_categories:
            validation_errors.append(
                f'Row {row_num}: Invalid category "{row["category"]}"'
            )
            continue
        
        # Type validation if present
        if 'type' in df.columns:
            meas_type = row['type'].strip().lower()
            if not meas_type:
                validation_errors.append(f'Row {row_num}: Empty type')
                continue
                
            if meas_type not in valid_types.get(category, {}):
                validation_errors.append(
                    f'Row {row_num}: Invalid type "{row["type"]}" for category "{row["category"]}"'
                )
                continue
                
            # Unit validation if present
            if 'unit' in df.columns:
                unit = row['unit'].strip().lower()
                if not unit:
                    validation_errors.append(f'Row {row_num}: Empty unit')
                    continue
                    
                if unit not in valid_units.get(meas_type, {}):
                    validation_errors.append(
                        f'Row {row_num}: Invalid unit "{row["unit"]}" for type "{row["type"]}"'
                    )
                    continue
            
            # Multiplier validation if present
            if 'multiplier' in df.columns and pd.notna(row['multiplier']):
                multiplier = row['multiplier'].strip()
                if not type_multiplier_support.get(meas_type, False):
                    validation_errors.append(
                        f'Row {row_num}: Type "{row["type"]}" does not support multipliers'
                    )
                    continue
                
                valid_multipliers = dict(MeasurementType.MULTIPLIER_CHOICES).keys()
                if multiplier not in valid_multipliers:
                    validation_errors.append(
                        f'Row {row_num}: Invalid multiplier "{multiplier}"'
                    )
        
        # Timezone validation if present
        if 'source_timezone' in df.columns and pd.notna(row['source_timezone']):
            try:
                pytz.timezone(row['source_timezone'])
            except pytz.exceptions.UnknownTimeZoneError:
                validation_errors.append(
                    f'Row {row_num}: Invalid timezone "{row["source_timezone"]}"'
                )
    
    return {
        'valid_categories': valid_categories,
        'category_types': valid_types,
        'type_units': valid_units,
        'validation_errors': validation_errors
    }

def process_csv_import(import_id: int) -> DataImport:
    """Process a CSV file import with enhanced validation and error handling"""
    import_job = DataImport.objects.get(id=import_id)
    
    try:
        # Mark as in progress
        import_job.status = 'in_progress'
        import_job.save()

        # Read CSV file
        df = pd.read_csv(import_job.import_file.path)

        # Validate measurement columns
        validation_results = validate_measurement_columns(df)
        if validation_results.get('validation_errors'):
            raise ValidationError({
                'validation': validation_results['validation_errors']
            })

        # Get mapping for this source
        mapping = import_job.data_source.datasourcemapping_set.first()
        if not mapping:
            raise ValidationError("No data source mapping found")
        
        # Get configuration from mapping
        config = mapping.mapping_config
        timestamp_col = config.get('timestamp_column')
        value_col = config.get('value_column')

        # Validate required columns exist
        if not (timestamp_col in df.columns and value_col in df.columns):
            raise ValidationError(
                f"Required columns not found: {timestamp_col}, {value_col}"
            )

        # Convert timestamps and handle timezone
        df[timestamp_col] = pd.to_datetime(df[timestamp_col])
        source_tz = pytz.timezone(mapping.measurement.source_timezone)
        df[timestamp_col] = df[timestamp_col].apply(
            lambda x: source_tz.localize(x) if x.tzinfo is None else x
        )
        
        # Track category stats
        category_stats = df['category'].value_counts().to_dict()
        
        # Create TimeSeriesData records with error tracking
        time_series_data = []
        error_count = 0
        error_log = []
        
        for idx, row in df.iterrows():
            try:
                time_series_data.append(
                    TimeSeriesData(
                        timestamp=row[timestamp_col],
                        measurement=mapping.measurement,
                        value=float(row[value_col])
                    )
                )
            except (ValueError, TypeError) as e:
                error_count += 1
                error_log.append({
                    'row': idx + 2,
                    'error': f"Invalid value: {str(e)}",
                    'timestamp': str(row[timestamp_col]),
                    'value': str(row[value_col])
                })
        
        # Bulk create with conflict handling
        if time_series_data:
            TimeSeriesData.objects.bulk_create(
                time_series_data,
                ignore_conflicts=True,
                batch_size=1000
            )
        
        # Update import record
        import_job.status = 'completed'
        import_job.completed_at = timezone.now()
        import_job.row_count = len(df)
        import_job.error_count = error_count
        import_job.error_log = {
            'categories': category_stats,
            'errors': error_log
        }
        import_job.save()

    except Exception as e:
        import_job.status = 'failed'
        import_job.error_count = getattr(e, 'error_dict', {}).get('count', 1)
        import_job.error_log = getattr(e, 'error_dict', {'error': str(e)})
        import_job.completed_at = timezone.now()
        import_job.save()
        raise

    return import_job

def create_csv_import(
    file: File,
    data_source,
    user,
    config: Optional[Dict] = None
) -> DataImport:
    """Create a new import job for a CSV file with optional configuration"""
    import_job = DataImport.objects.create(
        data_source=data_source,
        import_file=file,
        created_by=user,
        status='pending',
        configuration=config or {}
    )
    return import_job

def convert_measurement_value(
    value: float,
    from_unit: MeasurementUnit,
    to_unit: MeasurementUnit,
    multiplier: Optional[str] = None
) -> float:
    """
    Convert a measurement value between units, accounting for multipliers
    """
    if from_unit.type != to_unit.type:
        raise ValidationError(
            f"Cannot convert between different measurement types: {from_unit.type} and {to_unit.type}"
        )
    
    # Apply source multiplier if present
    if multiplier:
        multiplier_values = {
            'p': 1e-12,  # pico
            'n': 1e-9,   # nano
            'µ': 1e-6,   # micro
            'm': 1e-3,   # milli
            '': 1,       # base
            'k': 1e3,    # kilo
            'M': 1e6,    # mega
            'G': 1e9,    # giga
            'T': 1e12,   # tera
        }
        value = value * multiplier_values[multiplier]
    
    # Convert to base unit
    base_value = value * from_unit.conversion_factor
    
    # Convert from base unit to target unit
    return base_value / to_unit.conversion_factor

def get_api_data(mapping: DataSourceMapping) -> Dict:
    """
    Get data from API source with proper error handling and validation
    """
    client = get_source_client(mapping.data_source)
    
    try:
        raw_data = client.get_point_data(mapping.source_identifiers)
        
        # Validate response format
        if not isinstance(raw_data, dict):
            raise ValidationError("Invalid API response format")
        
        # Convert timestamp to measurement's timezone
        timestamp = raw_data.get('timestamp')
        if timestamp:
            source_tz = pytz.timezone(mapping.measurement.source_timezone)
            if timestamp.tzinfo is None:
                timestamp = source_tz.localize(timestamp)
            else:
                timestamp = timestamp.astimezone(source_tz)
            raw_data['timestamp'] = timestamp
        
        return raw_data
        
    except Exception as e:
        mapping.last_error = str(e)
        mapping.save()
        raise

def process_api_data(mapping: DataSourceMapping, data: Dict) -> TimeSeriesData:
    """
    Process and validate API data, creating TimeSeriesData record
    """
    config = mapping.mapping_config
    value_key = config.get('value_field', 'value')
    timestamp_key = config.get('timestamp_field', 'timestamp')
    
    if not all(k in data for k in [value_key, timestamp_key]):
        raise ValidationError(f"Missing required fields: {value_key}, {timestamp_key}")
    
    try:
        value = float(data[value_key])
        
        # Apply any configured scaling
        if 'scaling_factor' in config:
            value = value * float(config['scaling_factor'])
        
        return TimeSeriesData.objects.create(
            measurement=mapping.measurement,
            timestamp=data[timestamp_key],
            value=value
        )
    
    except (ValueError, TypeError) as e:
        raise ValidationError(f"Invalid value format: {str(e)}")

def aggregate_timeseries_data(
    measurement: Measurement,
    start_time: timezone.datetime,
    end_time: timezone.datetime,
    interval: str = 'hour',
    agg_func: str = 'mean'
) -> List[Dict]:
    """
    Aggregate time series data for a measurement over specified interval
    """
    valid_intervals = ['minute', 'hour', 'day', 'week', 'month']
    if interval not in valid_intervals:
        raise ValidationError(f"Invalid interval. Must be one of: {', '.join(valid_intervals)}")
    
    valid_funcs = ['mean', 'min', 'max', 'sum', 'count']
    if agg_func not in valid_funcs:
        raise ValidationError(f"Invalid aggregate function. Must be one of: {', '.join(valid_funcs)}")
    
    # Get data within time range
    data = TimeSeriesData.objects.filter(
        measurement=measurement,
        timestamp__gte=start_time,
        timestamp__lte=end_time
    )
    
    # Convert to pandas for aggregation
    df = pd.DataFrame(data.values())
    
    if df.empty:
        return []
    
    # Set timestamp as index
    df.set_index('timestamp', inplace=True)
    
    # Resample and aggregate
    if agg_func == 'mean':
        resampled = df.resample(interval[0]).mean()
    elif agg_func == 'min':
        resampled = df.resample(interval[0]).min()
    elif agg_func == 'max':
        resampled = df.resample(interval[0]).max()
    elif agg_func == 'sum':
        resampled = df.resample(interval[0]).sum()
    else:  # count
        resampled = df.resample(interval[0]).count()
    
    # Convert back to list of dicts
    return [
        {
            'timestamp': timestamp,
            'value': row['value'],
            'count': row.get('count', None)
        }
        for timestamp, row in resampled.iterrows()
    ]

def summarize_measurement_data(
    measurement: Measurement,
    start_time: Optional[timezone.datetime] = None,
    end_time: Optional[timezone.datetime] = None
) -> Dict:
    """
    Generate summary statistics for measurement data
    """
    queryset = measurement.timeseries.all()
    
    if start_time:
        queryset = queryset.filter(timestamp__gte=start_time)
    if end_time:
        queryset = queryset.filter(timestamp__lte=end_time)
    
    values = queryset.values_list('value', flat=True)
    if not values:
        return {
            'count': 0,
            'range': None,
            'stats': None
        }
    
    df = pd.DataFrame(values, columns=['value'])
    
    return {
        'count': len(values),
        'range': {
            'start': queryset.earliest('timestamp').timestamp,
            'end': queryset.latest('timestamp').timestamp
        },
        'stats': {
            'min': df['value'].min(),
            'max': df['value'].max(),
            'mean': df['value'].mean(),
            'median': df['value'].median(),
            'std': df['value'].std(),
        }
    }

def sync_api_data_source(data_source: 'APIDataSource') -> Dict[str, Union[int, List[str]]]:
    """
    Synchronize data from an API data source for all associated measurements
    """
    if not data_source.is_active:
        raise ValidationError("Cannot sync inactive data source")

    success_count = 0
    error_messages = []
    
    mappings = data_source.datasourcemapping_set.select_related(
        'measurement',
        'measurement__type',
        'measurement__unit'
    ).all()
    
    for mapping in mappings:
        try:
            data = get_api_data(mapping)
            process_api_data(mapping, data)
            success_count += 1
            
            # Update last sync time
            mapping.last_sync = timezone.now()
            mapping.last_error = ''
            mapping.save()
            
        except Exception as e:
            error_messages.append(f"Error syncing {mapping.measurement}: {str(e)}")
            mapping.last_error = str(e)
            mapping.save()
    
    return {
        'success_count': success_count,
        'error_count': len(error_messages),
        'errors': error_messages
    }

def bulk_measurement_import(
    location,
    data: List[Dict],
    validate_only: bool = False
) -> Dict[str, Union[int, List[str]]]:
    """
    Bulk import measurements for a location with validation
    """
    required_fields = {'name', 'type', 'unit'}
    errors = []
    created_count = 0
    
    # Prefetch related data for validation
    measurement_types = {
        t.name: t for t in MeasurementType.objects.select_related('category').all()
    }
    measurement_units = {
        u.name: u for u in MeasurementUnit.objects.select_related('type').all()
    }
    
    measurements_to_create = []
    
    for item in data:
        try:
            # Validate required fields
            missing_fields = required_fields - set(item.keys())
            if missing_fields:
                raise ValidationError(f"Missing required fields: {missing_fields}")
            
            # Validate and get type
            mtype = measurement_types.get(item['type'])
            if not mtype:
                raise ValidationError(f"Invalid measurement type: {item['type']}")
            
            # Validate and get unit
            unit = measurement_units.get(item['unit'])
            if not unit:
                raise ValidationError(f"Invalid unit: {item['unit']}")
            
            if unit.type != mtype:
                raise ValidationError(
                    f"Unit {unit} does not belong to type {mtype}"
                )
            
            # Validate multiplier if present
            multiplier = item.get('multiplier')
            if multiplier and not mtype.supports_multipliers:
                raise ValidationError(
                    f"Type {mtype} does not support multipliers"
                )
            
            # Create measurement object (don't save if validate_only)
            measurement = Measurement(
                location=location,
                name=item['name'],
                description=item.get('description', ''),
                type=mtype,
                unit=unit,
                multiplier=multiplier,
                source_timezone=item.get('source_timezone', 'UTC')
            )
            
            if not validate_only:
                measurements_to_create.append(measurement)
            created_count += 1
            
        except Exception as e:
            errors.append(f"Error with measurement {item.get('name')}: {str(e)}")
    
    if not validate_only and not errors:
        try:
            Measurement.objects.bulk_create(measurements_to_create)
        except Exception as e:
            errors.append(f"Bulk creation error: {str(e)}")
            created_count = 0
    
    return {
        'created_count': created_count if not validate_only else 0,
        'error_count': len(errors),
        'errors': errors,
        'would_create_count': created_count if validate_only else 0
    }

def export_project_data(
    project,
    format: str = 'excel',
    start_time: Optional[timezone.datetime] = None,
    end_time: Optional[timezone.datetime] = None
) -> Union[bytes, str]:
    """
    Export project data to Excel or CSV format
    """
    if format not in ['excel', 'csv']:
        raise ValidationError("Format must be 'excel' or 'csv'")
    
    # Get all measurements for project
    measurements = Measurement.objects.filter(
        location__project=project
    ).select_related(
        'location',
        'type',
        'unit',
        'type__category'
    )
    
    # Get time series data
    data_frames = []
    
    for measurement in measurements:
        queryset = measurement.timeseries.all()
        
        if start_time:
            queryset = queryset.filter(timestamp__gte=start_time)
        if end_time:
            queryset = queryset.filter(timestamp__lte=end_time)
        
        if queryset.exists():
            df = pd.DataFrame(queryset.values('timestamp', 'value'))
            df['measurement'] = measurement.name
            df['location'] = measurement.location.name
            df['category'] = measurement.type.category.name
            df['type'] = measurement.type.name
            df['unit'] = measurement.unit.name
            data_frames.append(df)
    
    if not data_frames:
        raise ValidationError("No data available for export")
    
    # Combine all data
    combined_df = pd.concat(data_frames, ignore_index=True)
    
    # Export based on format
    if format == 'excel':
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            combined_df.to_excel(writer, index=False)
        return output.getvalue()
    else:
        return combined_df.to_csv(index=False)

def generate_project_summary(project) -> Dict:
    """
    Generate comprehensive project summary including all measurements and statistics
    """
    locations = project.locations.prefetch_related(
        'measurements',
        'measurements__type',
        'measurements__unit',
        'measurements__type__category'
    ).all()
    
    summary = {
        'project_info': {
            'name': project.name,
            'type': project.get_project_type_display(),
            'start_date': project.start_date,
            'end_date': project.end_date,
            'location_count': len(locations)
        },
        'locations': [],
        'measurement_counts': {
            'total': 0,
            'by_category': {},
            'by_type': {}
        }
    }
    
    for location in locations:
        loc_summary = {
            'name': location.name,
            'address': location.address,
            'coordinates': None if not (location.latitude and location.longitude) else {
                'latitude': float(location.latitude),
                'longitude': float(location.longitude)
            },
            'measurements': []
        }
        
        for measurement in location.measurements.all():
            category = measurement.type.category.name
            mtype = measurement.type.name
            
            # Update counts
            summary['measurement_counts']['total'] += 1
            summary['measurement_counts']['by_category'][category] = \
                summary['measurement_counts']['by_category'].get(category, 0) + 1
            summary['measurement_counts']['by_type'][mtype] = \
                summary['measurement_counts']['by_type'].get(mtype, 0) + 1
            
            # Get measurement summary
            measurement_summary = summarize_measurement_data(measurement)
            
            loc_summary['measurements'].append({
                'name': measurement.name,
                'category': category,
                'type': mtype,
                'unit': str(measurement.unit),
                'multiplier': measurement.multiplier,
                'data_summary': measurement_summary
            })
        
        summary['locations'].append(loc_summary)
    
    return summary