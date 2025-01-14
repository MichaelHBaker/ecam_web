from django import template
from django.template.loader import render_to_string

register = template.Library()

@register.filter
def get_field_value(obj, field):
    """
    Get field value, handling choice fields, related fields, and measurement units appropriately
    """
    # Extract field name if field is a dictionary
    field_name = field['name'] if isinstance(field, dict) else str(field)
    
    try:
        # Special handling for unit relationships
        if field_name == 'unit':
            unit = getattr(obj, 'unit', None)
            if unit:
                return str(unit)
            return ''
            
        if field_name == 'unit_id':
            unit = getattr(obj, 'unit', None)
            if unit:
                return str(unit)
            return ''
            
        # Handle category and type relationships
        if field_name == 'category':
            return obj.category.display_name if obj.category else ''
            
        if field_name == 'type':
            return f"{obj.type.name} ({obj.type.symbol})" if obj.type else ''
        
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

@register.filter
def get_display_value(obj, field_name):
    """Get the display value for an object using the specified field"""
    if field_name and hasattr(obj, field_name):
        return getattr(obj, field_name)
    return str(obj)

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
            
        # Add measurement options if needed
        measurement_choices = None
        if level_type == 'measurement':
            from ..models import MeasurementCategory  # Local import to avoid circular dependency
            categories = MeasurementCategory.objects.prefetch_related(
                'types',
                'types__units'
            ).all()
            
            measurement_choices = {
                'categories': [
                    {'id': cat.id, 'display_name': cat.display_name}
                    for cat in categories
                ],
                'units': [
                    {
                        'id': unit.id,
                        'display_name': str(unit),
                        'type_id': unit.type_id,
                        'category_id': unit.type.category_id
                    }
                    for cat in categories
                    for type in cat.types.all()
                    for unit in type.units.all()
                ]
            }
            
        context = {
            'item': item,
            'level_type': level_type,
            'model_fields': model_fields,
            'next_level_type': next_level_type,
            'children_attr': children_attr,
            'parent': parent,
            'fields': fields,
            'level': level_info.get('level', 1),
            'measurement_choices': measurement_choices
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
            'measurement_choices': None
        }