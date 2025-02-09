import pandas as pd
from typing import Dict, List, Optional, Union

from django.core.files.base import File
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.utils.timezone import make_aware
from datetime import datetime

from io import BytesIO

from .models import (
    DataSourceMapping, DataImport, TimeSeriesData,
    MeasurementCategory, MeasurementType, MeasurementUnit,
    Measurement, APIDataSource
)
from .sources.clients import get_source_client

def validate_measurement_columns(df: pd.DataFrame) -> Dict:
    """
    Validate measurement-related columns in DataFrame, ensuring compliance with new model structure.
    """
    required_cols = ['category', 'name']
    optional_cols = ['type', 'unit', 'multiplier', 'source_timezone']
    
    missing_required = [col for col in required_cols if col not in df.columns]
    if missing_required:
        raise ValueError(f"Required columns missing: {', '.join(missing_required)}")
    
    categories = MeasurementCategory.objects.prefetch_related('types', 'types__units').all()
    valid_categories = {cat.name.lower(): cat for cat in categories}
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
    
    validation_errors = []
    for idx, row in df.iterrows():
        row_num = idx + 2  # Account for 0-based index and header row
        category = row.get('category', '').strip().lower()
        name = row.get('name', '').strip()
        
        if not category:
            validation_errors.append(f'Row {row_num}: Empty category')
            continue
        
        if not name:
            validation_errors.append(f'Row {row_num}: Empty name')
            continue
        
        if category not in valid_categories:
            validation_errors.append(f'Row {row_num}: Invalid category "{row["category"]}"')
            continue
        
        if 'type' in df.columns:
            meas_type = row['type'].strip().lower()
            if meas_type not in valid_types.get(category, {}):
                validation_errors.append(f'Row {row_num}: Invalid type "{row["type"]}" for category "{row["category"]}"')
                continue
                
            if 'unit' in df.columns:
                unit = row['unit'].strip().lower()
                if unit not in valid_units.get(meas_type, {}):
                    validation_errors.append(f'Row {row_num}: Invalid unit "{row["unit"]}" for type "{row["type"]}"')
                    continue
            
            if 'multiplier' in df.columns and pd.notna(row['multiplier']):
                multiplier = row['multiplier'].strip()
                if not type_multiplier_support.get(meas_type, False):
                    validation_errors.append(f'Row {row_num}: Type "{row["type"]}" does not support multipliers')
                    continue
                
                valid_multipliers = dict(MeasurementType.MULTIPLIER_CHOICES).keys()
                if multiplier not in valid_multipliers:
                    validation_errors.append(f'Row {row_num}: Invalid multiplier "{multiplier}"')
        
    return {
        'valid_categories': valid_categories,
        'category_types': valid_types,
        'type_units': valid_units,
        'validation_errors': validation_errors
    }

def convert_measurement_value(value: float, from_unit: MeasurementUnit, to_unit: MeasurementUnit) -> float:
    """
    Convert a measurement value between units, using the updated MeasurementUnit structure.
    """
    if from_unit.type != to_unit.type:
        raise ValidationError(f"Cannot convert between different measurement types: {from_unit.type} and {to_unit.type}")
    
    base_value = value * from_unit.conversion_factor
    return base_value / to_unit.conversion_factor

def process_csv_import(import_id: int) -> DataImport:
    """
    Process a CSV file import, ensuring compliance with the new measurement models.
    """
    import_job = DataImport.objects.get(id=import_id)
    
    try:
        import_job.status = 'in_progress'
        import_job.save()
        
        df = pd.read_csv(import_job.import_file.path)
        validation_results = validate_measurement_columns(df)
        if validation_results.get('validation_errors'):
            raise ValidationError({'validation': validation_results['validation_errors']})
        
        mapping = import_job.data_source.datasourcemapping_set.first()
        if not mapping:
            raise ValidationError("No data source mapping found")
        
        config = mapping.mapping_config
        timestamp_col = config.get('timestamp_column')
        value_col = config.get('value_column')
        
        if not (timestamp_col in df.columns and value_col in df.columns):
            raise ValidationError(f"Required columns not found: {timestamp_col}, {value_col}")
        
        # Convert to datetime (ensuring errors are handled gracefully)
        df[timestamp_col] = pd.to_datetime(df[timestamp_col], errors='coerce')

        # Apply timezone awareness only to naive timestamps
        df[timestamp_col] = df[timestamp_col].map(lambda x: make_aware(x) if x is not pd.NaT and x.tzinfo is None else x)

        time_series_data = []
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
                error_log.append({'row': idx + 2, 'error': str(e), 'timestamp': str(row[timestamp_col]), 'value': str(row[value_col])})
        
        if time_series_data:
            TimeSeriesData.objects.bulk_create(time_series_data, ignore_conflicts=True, batch_size=1000)
        
        import_job.status = 'completed'
        import_job.completed_at = timezone.now()
        import_job.error_log = {'errors': error_log}
        import_job.save()
    
    except Exception as e:
        import_job.status = 'failed'
        import_job.error_log = {'error': str(e)}
        import_job.completed_at = timezone.now()
        import_job.save()
        raise
    
    return import_job
