import pandas as pd
from typing import Dict, List, Optional, Union
import chardet
from io import BytesIO
import json
from datetime import datetime

from django.core.files.base import File
from django.utils import timezone
from django.core.exceptions import ValidationError

class DataProcessor:
    """
    Service class for handling data processing operations that were previously in crud.js
    """
    
    SUPPORTED_FORMATS = ['csv', 'json', 'xml', 'excel']
    
    def __init__(self):
        self.detected_encoding = None
        self.preview_size = 5000  # Default preview size in bytes
        
    def analyze_file(self, file_obj: File) -> Dict:
        """
        Analyze a file to determine its format, structure, and content preview
        Previously part of FileManager.detectFileProperties in crud.js
        """
        try:
            # Read initial bytes for analysis
            sample = file_obj.read(min(file_obj.size, self.preview_size))
            file_obj.seek(0)  # Reset file pointer
            
            # Detect encoding
            self.detected_encoding = self.detect_encoding(sample)
            
            # Detect format and get appropriate parser
            file_format = self.detect_format(file_obj.name, sample)
            
            # Get structure based on format
            structure = self.analyze_structure(
                file_obj, 
                file_format,
                encoding=self.detected_encoding
            )
            
            # Generate preview
            preview_content = self.generate_preview(
                sample,
                file_format,
                encoding=self.detected_encoding
            )
            
            return {
                'format': file_format,
                'encoding': self.detected_encoding,
                'structure': structure,
                'preview': preview_content,
                'metadata': {
                    'filename': file_obj.name,
                    'size': file_obj.size,
                    'type': getattr(file_obj, 'content_type', None)
                }
            }
            
        except Exception as e:
            raise ValidationError(f"File analysis failed: {str(e)}")

    def detect_encoding(self, sample: bytes) -> str:
        """
        Detect file encoding using chardet
        """
        if not sample:
            return 'utf-8'
            
        result = chardet.detect(sample)
        return result.get('encoding', 'utf-8')

    def detect_format(self, filename: str, sample: bytes) -> str:
        """
        Detect file format based on extension and content
        Previously part of FileManager.detectFileFormat in crud.js
        """
        # Check extension first
        ext = filename.lower().split('.')[-1]
        if ext in self.SUPPORTED_FORMATS:
            return ext
            
        # Check content if extension not conclusive
        try:
            content = sample.decode(self.detected_encoding).strip()
            if content.startswith('{') or content.startswith('['):
                return 'json'
            elif content.startswith('<?xml') or content.startswith('<'):
                return 'xml'
        except:
            pass
            
        # Default to CSV for text files
        return 'csv'

    def analyze_structure(self, file_obj: File, format: str, encoding: str) -> Dict:
        """
        Analyze file structure based on format
        Maps to various detection methods from crud.js
        """
        if format == 'csv':
            return self.analyze_csv_structure(file_obj, encoding)
        elif format == 'json':
            return self.analyze_json_structure(file_obj, encoding)
        elif format == 'xml':
            return self.analyze_xml_structure(file_obj, encoding)
        else:
            raise ValidationError(f"Unsupported format: {format}")

    def analyze_csv_structure(self, file_obj: File, encoding: str) -> Dict:
        """
        Analyze CSV file structure
        Previously part of FileManager.detectFileProperties in crud.js
        """
        try:
            # Read sample lines
            df = pd.read_csv(file_obj, encoding=encoding, nrows=10)
            file_obj.seek(0)  # Reset file pointer
            
            # Detect delimiter
            delimiter = self.detect_delimiter(df)
            
            # Analyze headers
            has_headers = self.detect_headers(df)
            
            # Find data start line
            data_start = self.detect_data_start(df)
            
            return {
                'delimiter': delimiter,
                'has_headers': has_headers,
                'data_start_line': data_start,
                'columns': [
                    {
                        'name': str(col),
                        'index': idx,
                        'sample_values': df[col].head(3).tolist()
                    }
                    for idx, col in enumerate(df.columns)
                ]
            }
        except Exception as e:
            raise ValidationError(f"CSV analysis failed: {str(e)}")

    def detect_delimiter(self, df: pd.DataFrame) -> str:
        """
        Detect CSV delimiter
        Previously part of FileManager.detectDelimiter in crud.js
        """
        # pandas already detected the delimiter, we can get it from the CSV parser
        if hasattr(df, 'delimiter'):
            return df.delimiter
        return ','  # Default to comma if not detectable

    def detect_headers(self, df: pd.DataFrame) -> bool:
        """
        Detect if CSV has headers
        Previously part of FileManager.detectHeaders in crud.js
        """
        if df.empty:
            return False
            
        # Check if column names are string-like and not primarily numeric
        header_row = df.columns.tolist()
        numeric_count = sum(1 for h in header_row if str(h).replace('.', '').isdigit())
        
        return numeric_count < len(header_row) / 2

    def detect_data_start(self, df: pd.DataFrame) -> int:
        """
        Detect where data starts in the file
        Previously part of FileManager.detectDataStart in crud.js
        """
        # If we have headers, data starts on line 1
        if self.detect_headers(df):
            return 1
            
        # Otherwise, look for first row with numeric data
        for idx, row in df.iterrows():
            if any(str(val).replace('.', '').isdigit() for val in row):
                return idx
                
        return 0  # Default to start if no clear data row found

    def generate_preview(self, sample: bytes, format: str, encoding: str) -> str:
        """
        Generate a preview of the file content
        """
        try:
            content = sample.decode(encoding)
            if len(content) > self.preview_size:
                content = content[:self.preview_size] + "\n... (truncated)"
            return content
        except Exception as e:
            raise ValidationError(f"Preview generation failed: {str(e)}")

    def process_chunk(self, chunk: bytes, format: str, config: Dict) -> Dict:
        """
        Process a chunk of data according to format and configuration
        """
        if format == 'csv':
            return self.process_csv_chunk(chunk, config)
        elif format == 'json':
            return self.process_json_chunk(chunk, config)
        elif format == 'xml':
            return self.process_xml_chunk(chunk, config)
        else:
            raise ValidationError(f"Unsupported format for chunk processing: {format}")

    def process_csv_chunk(self, chunk: bytes, config: Dict) -> Dict:
        """
        Process a chunk of CSV data
        """
        try:
            # Create DataFrame from chunk
            df = pd.read_csv(BytesIO(chunk), encoding=self.detected_encoding)
            
            # Apply configuration
            if config.get('skip_rows'):
                df = df.iloc[config['skip_rows']:]
            
            if config.get('selected_columns'):
                df = df[config['selected_columns']]
            
            # Convert to list of dictionaries
            records = df.to_dict('records')
            
            return {
                'records': records,
                'count': len(records)
            }
            
        except Exception as e:
            raise ValidationError(f"CSV chunk processing failed: {str(e)}")

    def validate_chunk_data(self, data: List[Dict], validations: Dict) -> Dict:
        """
        Validate processed chunk data against provided validation rules
        """
        errors = []
        valid_records = []
        
        for idx, record in enumerate(data):
            record_errors = []
            
            # Apply each validation rule
            for field, rules in validations.items():
                if field in record:
                    value = record[field]
                    for rule in rules:
                        if not self._check_validation_rule(value, rule):
                            record_errors.append(f"Field '{field}' failed validation: {rule['type']}")
            
            if record_errors:
                errors.append({
                    'row': idx,
                    'errors': record_errors
                })
            else:
                valid_records.append(record)
        
        return {
            'valid_records': valid_records,
            'errors': errors,
            'total_processed': len(data),
            'valid_count': len(valid_records),
            'error_count': len(errors)
        }

    def _check_validation_rule(self, value: any, rule: Dict) -> bool:
        """
        Check a single validation rule against a value
        """
        rule_type = rule.get('type')
        
        if rule_type == 'required':
            return value is not None and str(value).strip() != ''
            
        elif rule_type == 'type':
            expected_type = rule.get('value')
            if expected_type == 'number':
                try:
                    float(value)
                    return True
                except:
                    return False
            elif expected_type == 'date':
                try:
                    datetime.strptime(str(value), rule.get('format', '%Y-%m-%d'))
                    return True
                except:
                    return False
                    
        elif rule_type == 'range':
            try:
                num_value = float(value)
                return rule.get('min', float('-inf')) <= num_value <= rule.get('max', float('inf'))
            except:
                return False
                
        return True  # Unknown rule types pass by default