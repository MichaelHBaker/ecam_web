# serializers.py
from rest_framework import serializers
from django.utils import timezone
from .models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataSource, APIDataSource,
    DataSourceMapping, TimeSeriesData, DataImport
)
from .utils import get_field_metadata

class MeasurementUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementUnit
        fields = ['id', 'type', 'multiplier']

class MeasurementTypeSerializer(serializers.ModelSerializer):
    units = MeasurementUnitSerializer(many=True, read_only=True)
    
    class Meta:
        model = MeasurementType
        fields = ['id', 'name', 'symbol', 'category', 'description', 
                 'is_base_unit', 'supports_multipliers', 'units']

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
            'symbol': obj.type.symbol
        }

    def validate(self, data):
        """Custom validation to ensure all required fields are present and valid"""
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
            'location'
        ]

class LocationSerializer(serializers.ModelSerializer):
    measurements = MeasurementSerializer(many=True, read_only=True)
    children = serializers.SerializerMethodField()
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())

    def validate(self, data):
        """Custom validation for Location data"""
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
        """Custom validation for Project data"""
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

class DataSourceMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSourceMapping
        fields = ['id', 'measurement', 'data_source', 'source_identifiers', 
                 'mapping_config', 'last_sync', 'last_error']
        read_only_fields = ['last_sync', 'last_error']

class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ['id', 'name', 'source_type', 'description', 'configuration', 
                 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

class APIDataSourceSerializer(DataSourceSerializer):
    class Meta(DataSourceSerializer.Meta):
        model = APIDataSource
        fields = DataSourceSerializer.Meta.fields + [
            'url_base', 'middleware_type', 'auth_type'
        ]

class TimeSeriesDataSerializer(serializers.ModelSerializer):
    local_time = serializers.SerializerMethodField()

    def get_local_time(self, obj):
        return timezone.localtime(obj.timestamp)

    class Meta:
        model = TimeSeriesData
        fields = ['id', 'timestamp', 'local_time', 'measurement', 'value']

class DataImportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataImport
        fields = ['id', 'data_source', 'status', 'started_at', 'completed_at',
                 'import_file', 'row_count', 'error_count', 'error_log',
                 'created_by', 'approved_by']
        read_only_fields = ['started_at', 'completed_at', 'row_count', 
                           'error_count', 'error_log']

class ModelFieldsSerializer(serializers.Serializer):
    """Serializer for model field metadata"""
    def get_fields(self):
        """Override get_fields to avoid field inference"""
        return {}

    def to_representation(self, instance):
        """Return the field definitions for all models"""
        categories = MeasurementCategory.objects.all()
        types = MeasurementType.objects.all()
        units = MeasurementUnit.objects.all()

        measurement_choices = {
            'categories': [
                {'id': cat.id, 'display_name': cat.display_name}
                for cat in categories
            ],
            'types': [
                {'id': type.id, 'display_name': f"{type.name} ({type.symbol})"}
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