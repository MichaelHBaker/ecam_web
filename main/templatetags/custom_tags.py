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
    level_info = model_fields[level_type]
    next_level_type = level_info.get('child_type')
    children_attr = f"{next_level_type}s" if next_level_type else None
    
    # Ensure fields is a list of strings, not a dict
    fields = level_info['fields']
    if isinstance(fields, dict):
        fields = list(fields.keys())
    
    return {
        'item': item,
        'level_type': level_type,
        'model_fields': model_fields,
        'next_level_type': next_level_type,
        'children_attr': children_attr,
        'parent': parent,
        'fields': fields,  # Now guaranteed to be a list
        'level': level_info['level']
    }