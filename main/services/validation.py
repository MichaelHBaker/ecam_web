from typing import Dict, List, Optional, Union, Any
from datetime import datetime
import re

from django.core.exceptions import ValidationError
from django.utils.timezone import make_aware
import pandas as pd

class DataValidator:
    """
    Service class for handling data validation operations
    Previously part of ValidationManager in crud.js
    """
    
    TYPE_PATTERNS = {
        'integer': r'^\d+$',
        'float': r'^\d*\.?\d+$',
        'boolean': r'^(true|false|1|0|yes|no)$',
        'date': r'^\d{4}-\d{2}-\d{2}$',
        'datetime': r'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}',
        'time': r'^\d{2}:\d{2}(:\d{2})?$'
    }
    
    def __init__(self):
        self.detected_types = {}
        self.type_confidence = {}
        self.sample_values = {}

    def validate_source_config(self, config: Dict) -> Dict:
        """
        Validate source configuration
        Previously part of ValidationManager.validateSource in crud.js
        """
        errors = []
        warnings = []
        
        # Validate source type
        if not config.get('type'):
            errors.append('Source type not defined')
            return {
                'isValid': False,
                'errors': errors,
                'warnings': warnings
            }
            
        # Source-specific validation
        if config['type'] == 'file':
            if not config.get('file'):
                errors.append('No file selected')
                
        elif config['type'] == 'api':
            if not config.get('endpoint'):
                errors.append('API endpoint not configured')
                
        elif config['type'] == 'database':
            if not config.get('query'):
                errors.append('Database query not configured')
                
        else:
            errors.append(f"Unknown source type: {config['type']}")
            
        return {
            'isValid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    def validate_structure(self, structure: Dict) -> Dict:
        """
        Validate data structure configuration
        Previously part of ValidationManager.validateStructure in crud.js
        """
        errors = []
        warnings = []
        
        # Validate basic structure
        if not structure:
            errors.append('Structure configuration missing')
            return {
                'isValid': False,
                'errors': errors
            }
            
        # Data start validation
        if structure.get('dataStartLine') is None:
            errors.append('Data start line not defined')
            
        # Format-specific validation
        format = structure.get('format')
        if format == 'delimited':
            if not structure.get('delimiter'):
                errors.append('Delimiter not defined')
                
        elif format == 'fixed':
            if not structure.get('columns'):
                errors.append('Fixed width columns not defined')
                
        elif format in ['json', 'xml']:
            if not structure.get('path'):
                warnings.append('No data path specified, will use root')
                
        return {
            'isValid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    def validate_data_types(self, data: pd.DataFrame) -> Dict:
        """
        Validate and detect data types for all columns
        Previously part of DataTypeManager in crud.js
        """
        type_info = {}
        
        for column in data.columns:
            column_values = data[column].dropna()
            if len(column_values) == 0:
                continue
                
            # Get sample values
            samples = column_values.head(5).tolist()
            
            # Detect type and confidence
            detected_type = self.detect_column_type(column_values)
            confidence = self.calculate_type_confidence(column_values, detected_type)
            
            type_info[column] = {
                'detected_type': detected_type,
                'confidence': confidence,
                'samples': samples,
                'null_count': data[column].isna().sum()
            }
            
        return type_info

    def detect_column_type(self, values: pd.Series) -> str:
        """
        Detect the data type of a column
        Previously part of DataTypeManager.detectValueType in crud.js
        """
        # Convert values to strings for pattern matching
        str_values = values.astype(str)
        
        # Try each type pattern
        type_matches = {}
        for type_name, pattern in self.TYPE_PATTERNS.items():
            match_count = sum(1 for v in str_values if re.match(pattern, v.strip().lower()))
            type_matches[type_name] = match_count / len(str_values)
            
        # Get the type with highest match percentage
        if type_matches:
            best_type = max(type_matches.items(), key=lambda x: x[1])
            if best_type[1] > 0.8:  # 80% confidence threshold
                return best_type[0]
                
        # Default to string if no clear type match
        return 'string'

    def calculate_type_confidence(self, values: pd.Series, detected_type: str) -> float:
        """
        Calculate confidence score for detected type
        Previously part of DataTypeManager.analyzeColumnValues in crud.js
        """
        if detected_type == 'string':
            return 1.0  # String type is always valid
            
        pattern = self.TYPE_PATTERNS.get(detected_type)
        if not pattern:
            return 0.0
            
        # Calculate percentage of values matching the type pattern
        str_values = values.astype(str)
        matches = sum(1 for v in str_values if re.match(pattern, v.strip().lower()))
        return matches / len(values)

    def validate_time_config(self, config: Dict) -> Dict:
        """
        Validate time-related configuration
        Previously part of ValidationManager.validateTime in crud.js
        """
        errors = []
        warnings = []
        
        if not config:
            errors.append('Time configuration missing')
            return {
                'isValid': False,
                'errors': errors
            }
            
        # Timezone validation
        if not config.get('timezone'):
            warnings.append('No timezone specified, using UTC')
            
        # Time columns validation
        if not config.get('columns'):
            errors.append('No time columns mapped')
        else:
            if not config.get('format'):
                errors.append('Time format not specified')
                
            # Validate each time column exists
            for col in config['columns']:
                if not isinstance(col, (int, str)):
                    errors.append(f'Invalid time column reference: {col}')
                    
        return {
            'isValid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    def validate_mappings(self, mappings: Dict, column_defs: Dict) -> Dict:
        """
        Validate column mappings configuration
        Previously part of ValidationManager.validateMappings in crud.js
        """
        errors = []
        warnings = []
        
        if not mappings or not column_defs:
            errors.append('Mapping or column definitions missing')
            return {
                'isValid': False,
                'errors': errors
            }
            
        # Check each column has valid mapping or is explicitly unmapped
        for col_idx, col_def in column_defs.items():
            mapping = mappings.get('columnMappings', {}).get(str(col_idx))
            if not mapping and str(col_idx) not in mappings.get('unmappedColumns', []):
                warnings.append(f'Column "{col_def.get("name", col_idx)}" has no mapping')
                
        # Validate data types match measurement requirements
        for col_idx, mapping in mappings.get('columnMappings', {}).items():
            col_type = self.detected_types.get(col_idx)
            if not self.is_type_compatible(col_type, mapping.get('measurementId')):
                errors.append(
                    f'Data type mismatch for column "{column_defs.get(col_idx, {}).get("name", col_idx)}"'
                )
                
        return {
            'isValid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    def is_type_compatible(self, column_type: str, measurement_id: int) -> bool:
        """
        Check if column type is compatible with measurement
        Previously part of ValidationManager.isTypeCompatible in crud.js
        """
        # This would integrate with your measurement models to check compatibility
        # For now, returning True as placeholder
        return True

    def validate_processing_config(self, config: Dict) -> Dict:
        """
        Validate processing configuration
        Previously part of ValidationManager.validateConfig in crud.js
        """
        errors = []
        warnings = []
        
        # Validate batch size
        batch_size = config.get('batchSize', 1000)
        if batch_size < 100:
            warnings.append('Small batch size may impact performance')
        elif batch_size > 10000:
            warnings.append('Large batch size may cause memory issues')
            
        # Validate skip invalid setting
        if config.get('skipInvalid'):
            warnings.append('Invalid records will be skipped during processing')
            
        return {
            'isValid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    def can_quick_import(self, source_info: Dict, import_config: Dict) -> Dict:
        """
        Check if data can be imported without full configuration
        Previously part of ValidationManager.canQuickImport in crud.js
        """
        # Basic requirements for all sources
        if not source_info.get('type') or import_config.get('structure', {}).get('dataStartLine') is None:
            return {
                'canProceed': False,
                'reason': 'Missing basic configuration'
            }
            
        # Source-specific requirements
        source_type = source_info['type']
        if source_type == 'file':
            if import_config['source']['format'] == 'delimited' and not import_config['structure'].get('delimiter'):
                return {
                    'canProceed': False,
                    'reason': 'Delimiter not detected or specified'
                }
                
        elif source_type == 'api':
            if not import_config['source']['config'].get('endpoint'):
                return {
                    'canProceed': False,
                    'reason': 'API endpoint not configured'
                }
                
        elif source_type == 'database':
            if not import_config['source']['config'].get('query'):
                return {
                    'canProceed': False,
                    'reason': 'Database query not configured'
                }
                
        else:
            return {
                'canProceed': False,
                'reason': f'Unknown source type: {source_type}'
            }
            
        return {
            'canProceed': True,
            'isUpdate': False
        }