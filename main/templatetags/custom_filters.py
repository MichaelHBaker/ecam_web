from django import template

register = template.Library()

@register.filter
def filter_type(locations, location_type):
    """Filter locations by type"""
    return [loc for loc in locations if loc.get('type') == location_type]