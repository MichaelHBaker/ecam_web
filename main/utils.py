# utils.py

def get_field_metadata(model, field_names):
    fields = {}
    for name in field_names:
        field = model._meta.get_field(name)
        field_info = {
            'name': name,
            'type': 'select' if hasattr(field, 'choices') and field.choices else field.get_internal_type()
        }
        if field_info['type'] == 'select':
            field_info['choices'] = field.choices
        fields[name] = field_info
    return fields
