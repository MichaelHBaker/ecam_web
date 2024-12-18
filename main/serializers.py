from rest_framework import serializers
from .models import Client, Project, Location, Measurement

class MeasurementSerializer(serializers.ModelSerializer):
    measurement_type_display = serializers.CharField(source='get_measurement_type_display', read_only=True)
    
    class Meta:
        model = Measurement
        fields = ['id', 'name', 'description', 'measurement_type', 'measurement_type_display', 'unit']

class LocationSerializer(serializers.ModelSerializer):
    measurements = MeasurementSerializer(many=True, read_only=True)
    children = serializers.SerializerMethodField()
    
    class Meta:
        model = Location
        fields = ['id', 'name', 'address', 'latitude', 'longitude', 'children', 'measurements']

    def get_children(self, obj):
        return LocationSerializer(obj.children.all(), many=True).data

class ProjectSerializer(serializers.ModelSerializer):
    locations = LocationSerializer(many=True, read_only=True)
    project_type_display = serializers.CharField(source='get_project_type_display', read_only=True)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'project_type', 'project_type_display', 'start_date', 'end_date', 'locations']

class ClientSerializer(serializers.ModelSerializer):
    projects = ProjectSerializer(many=True, read_only=True)
    
    class Meta:
        model = Client
        fields = ['id', 'name', 'contact_email', 'phone_number', 'projects']