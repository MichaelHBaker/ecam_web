from django import template
from django.template.loader import render_to_string

register = template.Library()

@register.filter
def get_field_value(obj, field):
    """
    Get field value, handling choice fields and related fields appropriately
    """
    # Extract field name if field is a dictionary
    field_name = field['name'] if isinstance(field, dict) else str(field)
    
    try:
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
        print(f"Debug - level_type: {level_type}")
        print(f"Debug - model_fields keys: {list(model_fields.keys())}")
        
        if not isinstance(model_fields, dict):
            raise ValueError(f"model_fields is not a dict. Got {type(model_fields)}")
            
        if level_type not in model_fields:
            print(f"KeyError - '{level_type}' not in {list(model_fields.keys())}")
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
            
        context = {
            'item': item,
            'level_type': level_type,
            'model_fields': model_fields,
            'next_level_type': next_level_type,
            'children_attr': children_attr,
            'parent': parent,
            'fields': fields,
            'level': level_info.get('level', 1)
        }
        
        # Debug the output context
        print(f"Debug - output context: {context}")
        
        return context
        
    except Exception as e:
        print(f"Error in render_tree_item: {str(e)}")
        print(f"model_fields type: {type(model_fields)}")
        print(f"model_fields content: {model_fields}")
        # Return a minimal valid context in case of error
        return {
            'item': item,
            'level_type': level_type,
            'model_fields': model_fields,
            'next_level_type': None,
            'children_attr': None,
            'parent': parent,
            'fields': [{'name': 'name', 'type': 'string'}],
            'level': 1
        }