import pandas as pd
import chardet
import json
from typing import Dict, Optional, Tuple, List, Any
from datetime import datetime

from django.core.files.base import ContentFile
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction

from .models import (
    DataImport, Dataset, DataSource, ImportBatch,
    DataSourceLocation, SourceColumn, TimeSeriesData,
    Measurement
)

class ImportService:
    """Service class to handle all data import operations."""

    def process_upload(self, file, location_id: int, created_by) -> Tuple[DataImport, Dict]:
        """
        Process an uploaded file and create initial import record.
        
        Args:
            file: The uploaded file object
            location_id: ID of the location for this import
            created_by: User creating the import
            
        Returns:
            Tuple containing:
                - DataImport object
                - Dict with preview info and metadata
        """
        data_import = None
        try:
            # Read and analyze file content
            raw_content = file.read()
            encoding_info = self._detect_file_encoding(raw_content)
            
            # Start transaction for related objects
            with transaction.atomic():
                # Create data source
                data_source = DataSource.objects.create(
                    name=f'File Upload - {file.name}',
                    source_type='file',
                    description=f'File upload for location {location_id}',
                    created_by=created_by
                )

                # Link data source to location
                DataSourceLocation.objects.create(
                    data_source=data_source,
                    location_id=location_id
                )

                # Create dataset
                dataset = Dataset.objects.create(
                    data_source=data_source,
                    name=f'Dataset - {file.name}',
                    description='Auto-created for file import',
                    created_by=created_by
                )

                # Create import record
                data_import = DataImport.objects.create(
                    dataset=dataset,
                    status='analyzing',
                    file_encoding=encoding_info['encoding'],
                    original_filename=file.name,
                    created_by=created_by,
                    import_config={
                        'encoding': encoding_info['encoding'],
                        'file_size': file.size,
                        'content_type': file.content_type,
                        'encoding_confidence': encoding_info['confidence']
                    }
                )

                # Save file content
                data_import.import_file.save(
                    file.name,
                    ContentFile(raw_content),
                    save=True
                )

            # Generate preview
            preview_content, was_truncated = self.generate_preview(
                raw_content,
                encoding=encoding_info['encoding']
            )

            # Initial column analysis
            column_info = self._analyze_columns(
                raw_content,
                encoding_info['encoding']
            )

            return data_import, {
                'preview_content': preview_content,
                'preview_truncated': was_truncated,
                'encoding': encoding_info['encoding'],
                'encoding_confidence': encoding_info['confidence'],
                'file_size': file.size,
                'column_info': column_info
            }

        except Exception as e:
            if data_import:
                data_import.status = 'failed'
                data_import.error_log = {'error': str(e)}
                data_import.save()
            raise

    def _detect_file_encoding(self, content: bytes) -> Dict[str, Any]:
        """
        Detect file encoding with fallback options.
        
        Returns:
            Dict containing:
                - encoding: str
                - confidence: float
                - raw_detect: dict (original chardet results)
        """
        # Try chardet detection first
        detected = chardet.detect(content)
        
        if not detected['encoding'] or detected['confidence'] < 0.5:
            # Try common encodings
            encodings = ['utf-8', 'latin1', 'iso-8859-1', 'cp1252']
            for encoding in encodings:
                try:
                    content.decode(encoding)
                    return {
                        'encoding': encoding,
                        'confidence': 1.0,
                        'raw_detect': detected
                    }
                except UnicodeDecodeError:
                    continue

            # Fallback to latin1 if nothing else works
            return {
                'encoding': 'latin1',
                'confidence': 0.5,
                'raw_detect': detected
            }

        return {
            'encoding': detected['encoding'],
            'confidence': detected['confidence'],
            'raw_detect': detected
        }

    def generate_preview(
        self, 
        content: bytes, 
        encoding: str = 'utf-8', 
        max_size: int = 5000,
        max_rows: int = 50
    ) -> Tuple[str, bool]:
        """
        Generate a preview of the file content.
        
        Args:
            content: Raw file content
            encoding: File encoding
            max_size: Maximum preview size in characters
            max_rows: Maximum number of rows to include
            
        Returns:
            Tuple containing:
                - preview content (str)
                - whether content was truncated (bool)
        """
        try:
            # Try to decode with specified encoding
            decoded = content.decode(encoding)
            
            # Split into lines and limit rows
            lines = decoded.splitlines()[:max_rows]
            preview = '\n'.join(lines)
            
            # Check if content was truncated
            was_truncated = (
                len(decoded) > max_size or 
                len(decoded.splitlines()) > max_rows
            )
            
            # Truncate by size if needed
            if len(preview) > max_size:
                preview = preview[:max_size] + "\n... (content truncated)"
                was_truncated = True

            return preview, was_truncated

        except UnicodeDecodeError as e:
            # Fallback to latin1 if specified encoding fails
            decoded = content.decode('latin1')
            lines = decoded.splitlines()[:max_rows]
            preview = '\n'.join(lines)
            
            was_truncated = (
                len(decoded) > max_size or 
                len(decoded.splitlines()) > max_rows
            )
            
            if len(preview) > max_size:
                preview = preview[:max_size] + "\n... (content truncated)"
                was_truncated = True

            return preview, was_truncated

    def _analyze_columns(
        self, 
        content: bytes, 
        encoding: str,
        sample_size: int = 1000
    ) -> List[Dict]:
        """
        Analyze column structure and data types from file content.
        
        Args:
            content: Raw file content
            encoding: File encoding
            sample_size: Number of rows to analyze
            
        Returns:
            List of column info dictionaries
        """
        try:
            # Read sample data
            df = pd.read_csv(
                pd.io.common.BytesIO(content),
                encoding=encoding,
                nrows=sample_size
            )

            columns = []
            for idx, col_name in enumerate(df.columns):
                col_data = df[col_name].dropna()
                
                # Detect data type and sample values
                detected_type = self._detect_column_type(col_data)
                
                columns.append({
                    'index': idx,
                    'name': col_name,
                    'data_type': detected_type,
                    'sample_values': col_data.head().tolist(),
                    'null_count': df[col_name].isna().sum(),
                    'unique_count': df[col_name].nunique(),
                    'metadata': self._get_column_metadata(col_data, detected_type)
                })

            return columns

        except Exception as e:
            raise ValidationError(f"Column analysis failed: {str(e)}")

    def _detect_column_type(self, series: pd.Series) -> str:
        """
        Detect the data type of a column based on its content.
        
        Returns:
            String indicating the detected type
        """
        # Try datetime first
        try:
            pd.to_datetime(series)
            return 'datetime'
        except (ValueError, TypeError):
            pass

        # Check other types
        if series.dtype == 'bool':
            return 'boolean'
        elif series.dtype in ['int64', 'int32']:
            return 'integer'
        elif series.dtype in ['float64', 'float32']:
            return 'float'
        else:
            # Check if string column might be categorical
            unique_ratio = series.nunique() / len(series)
            if unique_ratio < 0.1:  # Less than 10% unique values
                return 'categorical'
            return 'string'

    def _get_column_metadata(
        self, 
        series: pd.Series, 
        data_type: str
    ) -> Dict[str, Any]:
        """Get additional metadata based on column type."""
        metadata = {}
        
        if data_type in ['integer', 'float']:
            metadata.update({
                'min': float(series.min()),
                'max': float(series.max()),
                'mean': float(series.mean()),
                'std': float(series.std())
            })
        elif data_type == 'datetime':
            metadata.update({
                'min_date': series.min().isoformat(),
                'max_date': series.max().isoformat(),
                'inferred_format': self._infer_datetime_format(series)
            })
        elif data_type == 'categorical':
            metadata.update({
                'categories': series.value_counts().head(10).to_dict()
            })
        elif data_type == 'string':
            metadata.update({
                'max_length': int(series.str.len().max()),
                'min_length': int(series.str.len().min())
            })

        return metadata

    def _infer_datetime_format(self, series: pd.Series) -> str:
        """Infer the datetime format from a series."""
        sample = series.dropna().iloc[0]
        if isinstance(sample, str):
            # Try common formats
            formats = [
                '%Y-%m-%d',
                '%Y-%m-%d %H:%M:%S',
                '%d/%m/%Y',
                '%m/%d/%Y',
                '%Y/%m/%d',
                '%d-%m-%Y',
                '%m-%d-%Y'
            ]
            
            for fmt in formats:
                try:
                    datetime.strptime(sample, fmt)
                    return fmt
                except ValueError:
                    continue
                    
        return 'unknown'

    def validate_import(self, import_id: int) -> Dict[str, Any]:
        """
        Validate import configuration and data.
        
        Args:
            import_id: ID of the DataImport to validate
            
        Returns:
            Dict containing validation results and metadata
        """
        data_import = DataImport.objects.get(id=import_id)
        
        try:
            # Update status
            data_import.status = 'validating'
            data_import.save()

            # Read sample data
            df = pd.read_csv(
                data_import.import_file.path,
                encoding=data_import.file_encoding,
                nrows=100  # Validate first 100 rows
            )

            # Basic validation checks
            validation_results = {
                'file_info': {
                    'filename': data_import.original_filename,
                    'encoding': data_import.file_encoding,
                    'size': data_import.import_file.size
                },
                'structure': {
                    'total_columns': len(df.columns),
                    'total_rows': len(df),
                    'empty_columns': df.columns[df.isna().all()].tolist()
                },
                'data_types': {
                    col: str(df[col].dtype) for col in df.columns
                },
                'sample_data': {
                    'head': df.head().to_dict('records'),
                    'column_samples': {
                        col: df[col].dropna().head().tolist() 
                        for col in df.columns
                    }
                },
                'validation_checks': self._perform_validation_checks(df)
            }

            # Update import status
            data_import.status = 'validated'
            data_import.validation_results = validation_results
            data_import.save()

            return validation_results

        except Exception as e:
            data_import.status = 'failed'
            data_import.error_log = {'error': str(e)}
            data_import.save()
            raise

    def _perform_validation_checks(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Perform detailed validation checks on the data."""
        checks = {
            'missing_values': {},
            'data_quality': {},
            'warnings': []
        }

        for column in df.columns:
            # Check missing values
            missing_count = df[column].isna().sum()
            missing_percent = (missing_count / len(df)) * 100
            
            if missing_percent > 0:
                checks['missing_values'][column] = {
                    'count': int(missing_count),
                    'percentage': float(missing_percent)
                }
                
                if missing_percent > 50:
                    checks['warnings'].append(
                        f"Column '{column}' has {missing_percent:.1f}% missing values"
                    )

            # Check data quality based on type
            dtype = df[column].dtype
            if dtype in ['int64', 'float64']:
                # Check for outliers using IQR
                Q1 = df[column].quantile(0.25)
                Q3 = df[column].quantile(0.75)
                IQR = Q3 - Q1
                outliers = df[
                    (df[column] < (Q1 - 1.5 * IQR)) | 
                    (df[column] > (Q3 + 1.5 * IQR))
                ]
                
                if len(outliers) > 0:
                    checks['data_quality'][column] = {
                        'outliers_count': len(outliers),
                        'outliers_percent': (len(outliers) / len(df)) * 100
                    }

            elif dtype == 'object':
                # Check string lengths
                lengths = df[column].str.len()
                if lengths.std() > lengths.mean():
                    checks['warnings'].append(
                        f"Column '{column}' has high variance in string lengths"
                    )

        return checks