# serializers.py
from rest_framework import serializers
from .models import Project, Location, Measurement, MeasurementType
from .utils import get_field_metadata

class MeasurementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementType
        fields = ['id', 'name', 'display_name', 'unit', 'description']

class MeasurementSerializer(serializers.ModelSerializer):
    measurement_type = MeasurementTypeSerializer(read_only=True)
    measurement_type_id = serializers.PrimaryKeyRelatedField(
        source='measurement_type',
        queryset=MeasurementType.objects.all(),
        write_only=True
    )
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    unit = serializers.CharField(read_only=True)

    def validate(self, data):
        """
        Custom validation to ensure all required fields are present and valid
        """
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
        
        if not data.get('measurement_type'):
            raise serializers.ValidationError({'measurement_type': 'Measurement type is required'})
            
        if not data.get('location'):
            raise serializers.ValidationError({'location': 'Location is required'})
            
        return data

    class Meta:
        model = Measurement
        fields = [
            'id', 'name', 'description', 
            'measurement_type', 'measurement_type_id',
            'unit', 'location'
        ]

class LocationSerializer(serializers.ModelSerializer):
    measurements = MeasurementSerializer(many=True, read_only=True)
    children = serializers.SerializerMethodField()
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())

    def validate(self, data):
        """
        Custom validation for Location data
        """
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
            
        if not data.get('project'):
            raise serializers.ValidationError({'project': 'Project is required'})
            
        # Validate parent is from same project if specified
        parent = data.get('parent')
        if parent and parent.project != data['project']:
            raise serializers.ValidationError({
                'parent': 'Parent location must be from the same project'
            })
            
        return data

    def get_children(self, obj):
        return LocationSerializer(obj.children.all(), many=True).data

    class Meta:
        model = Location
        fields = ['id', 'project', 'name', 'address', 'latitude', 
                 'longitude', 'children', 'measurements', 'parent']

class ProjectSerializer(serializers.ModelSerializer):
    locations = LocationSerializer(many=True, read_only=True)
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)

    def validate(self, data):
        """
        Custom validation for Project data
        """
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
    """Serializer for model field metadata"""
    def get_fields(self):
        """Override get_fields to avoid field inference"""
        return {}

    def to_representation(self, instance):
        """Return the field definitions for all models"""
        measurement_types = MeasurementType.objects.all()
        measurement_type_choices = [
            {'id': mt.id, 'display_name': mt.display_name}
            for mt in measurement_types
        ]

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
                    {'name': 'measurement_type_id', 'type': 'choice', 'required': True,
                     'choices': measurement_type_choices}
                ],
                'parent_type': 'location',
                'display_field': 'name'
            }
        }