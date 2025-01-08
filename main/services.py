# services.py
import pandas as pd
from typing import Dict, List
from django.core.files.base import File
from django.utils import timezone
from .models import DataSourceMapping, DataImport, TimeSeriesData

from .sources.clients import get_source_client

def get_measurement_value(mapping: DataSourceMapping) -> float:
    """Get current value for a measurement via its source mapping"""
    client = get_source_client(mapping.data_source)
    return client.get_point_value(mapping.source_identifiers)

def process_csv_import(import_id: int) -> DataImport:
    """Process a CSV file import"""
    import_job = DataImport.objects.get(id=import_id)
    
    try:
        # Mark as in progress
        import_job.status = 'in_progress'
        import_job.save()

        # Read CSV file
        df = pd.read_csv(import_job.import_file.path)

        # Get mapping for this source
        mapping = import_job.data_source.datasourcemapping_set.first()
        
        # Get configuration from mapping
        config = mapping.mapping_config
        timestamp_col = config.get('timestamp_column')
        value_col = config.get('value_column')

        # Validate required columns exist
        if not (timestamp_col in df.columns and value_col in df.columns):
            raise ValueError(f"Required columns not found: {timestamp_col}, {value_col}")

        # Convert timestamps
        df[timestamp_col] = pd.to_datetime(df[timestamp_col], utc=True)
        
        # Create TimeSeriesData records
        time_series_data = [
            TimeSeriesData(
                timestamp=row[timestamp_col],
                measurement=mapping.measurement,
                value=row[value_col]
            )
            for _, row in df.iterrows()
        ]
        
        # Bulk create with conflict handling
        TimeSeriesData.objects.bulk_create(
            time_series_data,
            ignore_conflicts=True,
            batch_size=1000
        )
        
        # Update import record
        import_job.status = 'completed'
        import_job.completed_at = timezone.now()
        import_job.row_count = len(time_series_data)
        import_job.save()

    except Exception as e:
        import_job.status = 'failed'
        import_job.error_count = 1
        import_job.error_log = [{'error': str(e)}]
        import_job.completed_at = timezone.now()
        import_job.save()
        raise

    return import_job

def create_csv_import(file: File, data_source, user) -> DataImport:
    """Create a new import job for a CSV file"""
    import_job = DataImport.objects.create(
        data_source=data_source,
        import_file=file,
        created_by=user,
        status='pending'
    )
    return import_job