from django import template
from django.template.loader import render_to_string
from django.utils.html import format_html
from typing import Dict, Any, Optional, Union
import pytz

register = template.Library()

@register.filter
def get_field_value(obj: Any, field: Union[Dict, str]) -> str:
    """
    Get field value, handling choice fields, related fields, measurement units,
    and new features like multipliers and timezones.
    """
    field_name = field['name'] if isinstance(field, dict) else str(field)
    
    try:
        # Special handling for measurement-related fields
        if field_name == 'unit':
            unit = getattr(obj, 'unit', None)
            if unit:
                if hasattr(obj, 'multiplier') and obj.multiplier:
                    return format_html(
                        '{}<span class="text-sm text-gray-500">{}</span>{}',
                        obj.multiplier,
                        '·',
                        str(unit)
                    )
                return str(unit)
            return ''
            
        if field_name == 'unit_id':
            unit = getattr(obj, 'unit', None)
            if unit:
                return unit.id
            return ''
            
        if field_name == 'category':
            category = getattr(obj, 'category', None)
            if category:
                return format_html(
                    '<span title="{}">{}</span>',
                    category.description or '',
                    category.display_name
                )
            return ''
            
        if field_name == 'type':
            type_obj = getattr(obj, 'type', None)
            if type_obj:
                multiplier_support = ' (SI)' if type_obj.supports_multipliers else ''
                return format_html(
                    '<span title="{}">{}{}</span>',
                    type_obj.description or '',
                    type_obj.name,
                    multiplier_support
                )
            return ''
        
        # Handle timezone display
        if field_name == 'source_timezone':
            timezone = getattr(obj, 'source_timezone', None)
            if timezone:
                try:
                    tz = pytz.timezone(timezone)
                    return format_html(
                        '<span title="UTC{}">{}</span>',
                        tz.utcoffset(None),
                        timezone
                    )
                except pytz.exceptions.UnknownTimeZoneError:
                    return timezone
            return 'UTC'
        
        # Handle choice fields with get_FOO_display
        if hasattr(obj, f'get_{field_name}_display'):
            return getattr(obj, f'get_{field_name}_display')()
        
        # Handle multiplier choices
        if field_name == 'multiplier' and hasattr(obj, 'MULTIPLIER_CHOICES'):
            value = getattr(obj, field_name, '')
            choices_dict = dict(obj.MULTIPLIER_CHOICES)
            return choices_dict.get(value, value)
        
        # Handle boolean fields
        value = getattr(obj, field_name, '')
        if isinstance(value, bool):
            return 'Yes' if value else 'No'
            
        return value
        
    except (AttributeError, TypeError):
        return ''

@register.filter
def get_attr(obj: Any, attr: str) -> Any:
    """
    Get nested attributes using dot notation, with enhanced error handling.
    Example: get_attr(obj, "field.name.id") will traverse the object tree.
    """
    try:
        # Handle nested attributes
        for part in attr.split('.'):
            if hasattr(obj, part):
                obj = getattr(obj, part)
                # Handle callable
                if callable(obj):
                    obj = obj()
            elif hasattr(obj, 'all') and part == 'all':
                obj = obj.select_related(
                    'type',
                    'unit',
                    'type__category'
                ).all()
            else:
                return None
        return obj
    except (AttributeError, TypeError):
        return None

@register.filter
def get_item(dictionary: Dict, key: str) -> Dict:
    """
    Get item from dictionary with type safety.
    """
    if not isinstance(dictionary, dict):
        return {}
    return dictionary.get(key, {})

@register.filter
def get_display_value(obj: Any, field_name: Optional[str]) -> str:
    """
    Get the display value for an object using the specified field,
    with support for new model features.
    """
    if not field_name:
        return str(obj)
        
    try:
        if hasattr(obj, field_name):
            value = getattr(obj, field_name)
            
            # Handle boolean values
            if isinstance(value, bool):
                return 'Yes' if value else 'No'
                
            # Handle choice fields
            if hasattr(obj, f'get_{field_name}_display'):
                return getattr(obj, f'get_{field_name}_display')()
                
            return str(value)
            
        return str(obj)
        
    except Exception:
        return str(obj)

@register.inclusion_tag('main/tree_item.html')
def render_tree_item(item: Any, level_type: str, model_fields: Dict) -> Dict:
    """
    Recursively renders tree items with enhanced support for measurement
    features and improved error handling.
    """
    try:
        if not isinstance(model_fields, dict):
            raise ValueError(f"model_fields is not a dict. Got {type(model_fields)}")
            
        # Get level info with defaults
        level_info = model_fields.get(level_type, {
            'level': 1,
            'fields': [{'name': 'name', 'type': 'string'}],
            'child_type': None,
            'display_field': 'name'
        })

        next_level_type = level_info.get('child_type')
        children_attr = f"{next_level_type}s" if next_level_type else None
        
        # Process fields
        fields = level_info.get('fields', [])
        if isinstance(fields, dict):
            fields = [
                {
                    'name': k,
                    'type': v.get('type', 'string'),
                    'required': v.get('required', False),
                    'display_field': v.get('display_field', False)
                }
                for k, v in fields.items()
            ]
        elif isinstance(fields, list) and fields and isinstance(fields[0], str):
            fields = [
                {
                    'name': f,
                    'type': 'string',
                    'required': False,
                    'display_field': False
                }
                for f in fields
            ]
            
        # Handle measurement-specific options
        measurement_choices = None
        if level_type == 'measurement':
            from ..models import MeasurementCategory
            categories = MeasurementCategory.objects.prefetch_related(
                'types',
                'types__units'
            ).all()
            
            measurement_choices = {
                'categories': [
                    {
                        'id': cat.id,
                        'display_name': cat.display_name,
                        'description': cat.description
                    }
                    for cat in categories
                ],
                'types': [
                    {
                        'id': type_obj.id,
                        'display_name': type_obj.name,
                        'description': type_obj.description,
                        'category_id': type_obj.category_id,
                        'supports_multipliers': type_obj.supports_multipliers
                    }
                    for cat in categories
                    for type_obj in cat.types.all()
                ],
                'units': [
                    {
                        'id': unit.id,
                        'display_name': str(unit),
                        'description': unit.description,
                        'type_id': unit.type_id,
                        'category_id': unit.type.category_id,
                        'is_base_unit': unit.is_base_unit,
                        'conversion_factor': unit.conversion_factor
                    }
                    for cat in categories
                    for type_obj in cat.types.all()
                    for unit in type_obj.units.all()
                ],
                'multipliers': [
                    {
                        'value': choice[0],
                        'display_name': choice[1]
                    }
                    for choice in item.MULTIPLIER_CHOICES
                ] if hasattr(item, 'MULTIPLIER_CHOICES') else [],
                'timezones': [
                    {
                        'value': tz,
                        'display_name': tz
                    }
                    for tz in pytz.all_timezones
                ]
            }
        
        return {
            'item': item,
            'level_type': level_type,
            'model_fields': model_fields,
            'next_level_type': next_level_type,
            'children_attr': children_attr,
            'fields': fields,
            'level': level_info.get('level', 1),
            'display_field': level_info.get('display_field', 'name'),
            'measurement_choices': measurement_choices,
            'parent_type': level_info.get('parent_type'),
            'validation_rules': level_info.get('validation_rules', {})
        }
        
    except Exception as e:
        # Return minimal valid context with error indication
        return {
            'item': item,
            'level_type': level_type,
            'model_fields': {},
            'next_level_type': None,
            'children_attr': None,
            'fields': [{'name': 'name', 'type': 'string'}],
            'level': 1,
            'display_field': 'name',
            'measurement_choices': None,
            'error': str(e)
        }