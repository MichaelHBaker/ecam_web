# serializers.py
from rest_framework import serializers
from .models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit
)

class MeasurementUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementUnit
        fields = ['id', 'type', 'name', 'description', 'conversion_factor', 'is_base_unit']

class MeasurementTypeSerializer(serializers.ModelSerializer):
    units = MeasurementUnitSerializer(many=True, read_only=True)
    
    class Meta:
        model = MeasurementType
        fields = ['id', 'name', 'category', 'description', 'supports_multipliers', 'units']

class MeasurementCategorySerializer(serializers.ModelSerializer):
    types = MeasurementTypeSerializer(many=True, read_only=True)
    
    class Meta:
        model = MeasurementCategory
        fields = ['id', 'name', 'display_name', 'description', 'types']

class MeasurementSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField(read_only=True)
    type = serializers.SerializerMethodField(read_only=True)
    unit = MeasurementUnitSerializer(read_only=True)
    unit_id = serializers.PrimaryKeyRelatedField(
        source='unit',
        queryset=MeasurementUnit.objects.all(),
        write_only=True
    )
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())

    def get_category(self, obj):
        return {
            'id': obj.category.id,
            'name': obj.category.name,
            'display_name': obj.category.display_name
        }

    def get_type(self, obj):
        return {
            'id': obj.type.id,
            'name': obj.type.name,
            'description': obj.type.description
        }

    def validate(self, data):
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
        
        if not data.get('unit'):
            raise serializers.ValidationError({'unit': 'Unit is required'})
            
        if not data.get('location'):
            raise serializers.ValidationError({'location': 'Location is required'})
            
        return data

    class Meta:
        model = Measurement
        fields = [
            'id', 'name', 'description', 
            'category', 'type', 'unit', 'unit_id',
            'location', 'multiplier', 'source_timezone'
        ]

class LocationSerializer(serializers.ModelSerializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())

    def validate(self, data):
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
            
        if not data.get('project'):
            raise serializers.ValidationError({'project': 'Project is required'})
            
        return data

    class Meta:
        model = Location
        fields = ['id', 'project', 'name', 'address', 'latitude', 'longitude']

class ProjectSerializer(serializers.ModelSerializer):
    locations = LocationSerializer(many=True, read_only=True)
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)

    def validate(self, data):
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
            
        if not data.get('project_type'):
            raise serializers.ValidationError({'project_type': 'Project type is required'})
            
        if data.get('end_date') and data.get('start_date') and data['end_date'] < data['start_date']:
            raise serializers.ValidationError({
                'end_date': 'End date must be after start date'
            })
            
        return data

    class Meta:
        model = Project
        fields = ['id', 'name', 'project_type', 'project_type_display', 
                 'start_date', 'end_date', 'locations']

class ModelFieldsSerializer(serializers.Serializer):
    def get_fields(self):
        return {}

    def to_representation(self, instance):
        categories = MeasurementCategory.objects.all()
        types = MeasurementType.objects.all()
        units = MeasurementUnit.objects.all()

        measurement_choices = {
            'categories': [
                {'id': cat.id, 'display_name': cat.display_name}
                for cat in categories
            ],
            'types': [
                {'id': type.id, 'display_name': type.name}
                for type in types
            ],
            'units': [
                {'id': unit.id, 'display_name': str(unit)}
                for unit in units
            ]
        }

        return {
            'project': {
                'level': 1,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True},
                    {'name': 'project_type', 'type': 'choice', 'required': True, 
                     'choices': [{'id': c[0], 'display_name': c[1]} for c in Project.PROJECT_TYPES]},
                ],
                'child_type': 'location'
            },
            'location': {
                'level': 2,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True, 'display_field': True},
                    {'name': 'address', 'type': 'string', 'required': True},
                ],
                'child_type': 'measurement',
                'parent_type': 'project',
                'display_field': 'name'
            },
            'measurement': {
                'level': 3,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True, 'display_field': True},
                    {'name': 'description', 'type': 'string', 'required': False},
                    {'name': 'unit_id', 'type': 'choice', 'required': True,
                     'choices': measurement_choices}
                ],
                'parent_type': 'location',
                'display_field': 'name'
            }
        }