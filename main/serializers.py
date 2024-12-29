from rest_framework import serializers
from .models import Client, Project, Location, Measurement
from .utils import get_field_metadata

class MeasurementSerializer(serializers.ModelSerializer):
    measurement_type_display = serializers.CharField(source='get_measurement_type_display', read_only=True)
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())

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
        fields = ['id', 'name', 'description', 'measurement_type', 
                 'measurement_type_display', 'unit', 'location']

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
                 'longitude', 'children', 'measurements']

class ProjectSerializer(serializers.ModelSerializer):
    locations = LocationSerializer(many=True, read_only=True)
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all())

    def validate(self, data):
        """
        Custom validation for Project data
        """
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
            
        if not data.get('project_type'):
            raise serializers.ValidationError({'project_type': 'Project type is required'})
            
        if not data.get('client'):
            raise serializers.ValidationError({'client': 'Client is required'})
            
        if data.get('end_date') and data.get('start_date') and data['end_date'] < data['start_date']:
            raise serializers.ValidationError({
                'end_date': 'End date must be after start date'
            })
            
        return data

    class Meta:
        model = Project
        fields = ['id', 'name', 'project_type', 'project_type_display', 
                 'start_date', 'end_date', 'locations', 'client']

class ClientSerializer(serializers.ModelSerializer):
    projects = ProjectSerializer(many=True, read_only=True)

    def validate(self, data):
        """
        Custom validation for Client data
        """
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})
            
        if not data.get('contact_email'):
            raise serializers.ValidationError({'contact_email': 'Contact email is required'})
            
        return data

    class Meta:
        model = Client
        fields = ['id', 'name', 'contact_email', 'phone_number', 'projects']

class ModelFieldsSerializer(serializers.Serializer):
    def to_representation(self, instance):
        result = {
            'client': {
                'level': 1,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True},
                    {'name': 'contact_email', 'type': 'email', 'required': True},
                    {'name': 'phone_number', 'type': 'string', 'required': False}
                ],
                'child_type': 'project'
            },
            'project': {
                'level': 2,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True},
                    {'name': 'project_type', 'type': 'choice', 'required': True},
                ],
                'child_type': 'location',
                'parent_type': 'client'
            },
            'location': {
                'level': 3,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True},
                    {'name': 'address', 'type': 'string', 'required': True},
                ],
                'child_type': 'measurement',
                'parent_type': 'project'
            },
            'measurement': {
                'level': 4,
                'fields': [
                    {'name': 'name', 'type': 'string', 'required': True},
                    {'name': 'description', 'type': 'string', 'required': False},
                    {'name': 'measurement_type', 'type': 'choice', 'required': True}
                ],
                'parent_type': 'location'
            }
        }
        return result