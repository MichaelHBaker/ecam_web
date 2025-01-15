# utils.py
from typing import Dict, Any

def get_field_metadata(model, field_names) -> Dict[str, Any]:
    fields = {}
    for name in field_names:
        field = model._meta.get_field(name)
        field_info = {
            'name': name,
            'type': 'select' if hasattr(field, 'choices') and field.choices else field.get_internal_type()
        }
        
        # Special handling for measurement fields
        if name == 'unit':
            field_info['type'] = 'measurement_unit'
            field_info['category_required'] = True
        elif name in ['type', 'category']:
            field_info['type'] = 'measurement_' + name
            
        # Handle normal choices
        if field_info['type'] == 'select':
            field_info['choices'] = field.choices
            
        fields[name] = field_info
    return fields