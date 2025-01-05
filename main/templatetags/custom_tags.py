from django import template
from django.template.loader import render_to_string

register = template.Library()

@register.filter
def get_field_value(obj, field):
    """
    Get field value, handling choice fields, related fields, and measurement types appropriately
    """
    # Extract field name if field is a dictionary
    field_name = field['name'] if isinstance(field, dict) else str(field)
    
    try:
        # Special handling for measurement_type
        if field_name == 'measurement_type':
            measurement_type = getattr(obj, 'measurement_type', None)
            if measurement_type:
                return measurement_type.display_name
            return ''
        
        # Special handling for measurement_type_id
        if field_name == 'measurement_type_id':
            measurement_type = getattr(obj, 'measurement_type', None)
            if measurement_type:
                return measurement_type.id
            return ''
            
        # Check for choice field display method
        if hasattr(obj, f'get_{field_name}_display'):
            return getattr(obj, f'get_{field_name}_display')()
        
        # Get regular attribute value
        return getattr(obj, field_name, '')
    except (AttributeError, TypeError):
        return ''

@register.filter
def get_attr(obj, attr):
    """
    Get attribute or manager's all() if it's a related manager
    """
    if hasattr(obj, attr):
        attr_value = getattr(obj, attr)
        if hasattr(attr_value, 'all'):
            return attr_value.all()
        return attr_value
    return None

@register.filter
def get_item(dictionary, key):
    """
    Get item from dictionary, returns empty dict if key not found
    """
    return dictionary.get(key, {})

@register.inclusion_tag('main/tree_item.html')
def render_tree_item(item, level_type, model_fields, parent=None):
    """
    Recursively renders tree items
    """
    try:
        # Debug before access
        if not isinstance(model_fields, dict):
            raise ValueError(f"model_fields is not a dict. Got {type(model_fields)}")
            
        if level_type not in model_fields:
            # Provide default structure if key missing
            level_info = {
                'level': 1,
                'fields': [{'name': 'name', 'type': 'string'}],
                'child_type': None
            }
        else:
            level_info = model_fields[level_type]

        next_level_type = level_info.get('child_type')
        children_attr = f"{next_level_type}s" if next_level_type else None
        
        # Handle fields
        fields = level_info.get('fields', [])
        if isinstance(fields, dict):
            fields = [{'name': k, 'type': v.get('type', 'string')} for k, v in fields.items()]
        elif isinstance(fields, list) and fields and isinstance(fields[0], str):
            fields = [{'name': f, 'type': 'string'} for f in fields]
            
        # Add measurement type information if needed
        measurement_types = None
        if level_type == 'measurement':
            from ..models import MeasurementType  # Local import to avoid circular dependency
            measurement_types = MeasurementType.objects.all()
            
        context = {
            'item': item,
            'level_type': level_type,
            'model_fields': model_fields,
            'next_level_type': next_level_type,
            'children_attr': children_attr,
            'parent': parent,
            'fields': fields,
            'level': level_info.get('level', 1),
            'measurement_types': measurement_types
        }
        
        return context
        
    except Exception as e:
        # Return a minimal valid context in case of error
        return {
            'item': item,
            'level_type': level_type,
            'model_fields': model_fields,
            'next_level_type': None,
            'children_attr': None,
            'parent': parent,
            'fields': [{'name': 'name', 'type': 'string'}],
            'level': 1,
            'measurement_types': None
        }