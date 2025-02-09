# serializers.py
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator
from django.contrib.auth.models import User

from .models import (
    ProjectAccess, Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataSource, DataSourceLocation,
    Dataset, SourceColumn, DataImport, DataCopyGrant, ImportBatch
)

class ProjectAccessSerializer(serializers.ModelSerializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    granted_by = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    
    class Meta:
        model = ProjectAccess
        fields = ['id', 'project', 'user', 'granted_by', 'granted_at', 'revoked_at']
        read_only_fields = ['granted_at', 'revoked_at']

    def validate(self, data):
        """Ensure the user is not the project owner and access is not already granted."""
        project = data.get('project')
        user = data.get('user')

        if project.owner == user:
            raise serializers.ValidationError({'user': 'Cannot grant access to project owner'})

        if ProjectAccess.objects.filter(project=project, user=user, revoked_at__isnull=True).exists():
            raise serializers.ValidationError({'user': 'User already has active access to this project'})

        return data

class MeasurementUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementUnit
        fields = ['id', 'type', 'name', 'description', 'conversion_factor', 'is_base_unit']

class MeasurementTypeSerializer(serializers.ModelSerializer):
    units = MeasurementUnitSerializer(many=True, read_only=True)
    
    class Meta:
        model = MeasurementType
        fields = ['id', 'category', 'name', 'description', 'supports_multipliers', 'units']


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
            'id': obj.type.category.id,
            'name': obj.type.category.name,
            'display_name': obj.type.category.display_name
        }

    def get_type(self, obj):
        return {
            'id': obj.type.id,
            'name': obj.type.name,
            'description': obj.type.description,
            'supports_multipliers': obj.type.supports_multipliers
        }

    class Meta:
        model = Measurement
        fields = [
            'id', 'name', 'description', 
            'category', 'type', 'unit', 'unit_id',
            'location', 'multiplier', 'source_timezone'
        ]

    def validate(self, data):
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})

        if not data.get('unit'):
            raise serializers.ValidationError({'unit': 'Unit is required'})

        if not data.get('location'):
            raise serializers.ValidationError({'location': 'Location is required'})

        unit = data.get('unit')
        if unit and 'multiplier' in data and data['multiplier']:
            if not unit.type.supports_multipliers:
                raise serializers.ValidationError({
                    'multiplier': f'Type {unit.type.name} does not support multipliers'
                })

        return data


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
    access = ProjectAccessSerializer(many=True, read_only=True, source='user_access')

    def validate(self, data):
        if not data.get('name'):
            raise serializers.ValidationError({'name': 'Name is required'})

        if not data.get('project_type'):
            raise serializers.ValidationError({'project_type': 'Project type is required'})

        if data.get('end_date') and data.get('start_date') and data['end_date'] < data['start_date']:
            raise serializers.ValidationError({'end_date': 'End date must be after start date'})

        return data

    class Meta:
        model = Project
        fields = [
            'id', 'name', 'project_type', 'project_type_display', 
            'start_date', 'end_date', 'locations', 'access'
        ]


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
                     'choices': [{'id': c[0], 'display_name': c[1]} for c in Project.ProjectType]},
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
    
# Add to serializers.py

class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = [
            'id', 'name', 'description', 'source_type', 
            'middleware_type', 'auth_type', 'url_base',
            'connection_config', 'created_at', 'updated_at',
            'is_active'
        ]

class DataSourceLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSourceLocation
        fields = ['id', 'data_source', 'location']
        validators = [
            UniqueTogetherValidator(
                queryset=DataSourceLocation.objects.all(),
                fields=['data_source', 'location']
            )
        ]

    def validate(self, data):
        """Ensure data source links to a location in the same project."""
        if data['data_source'].project != data['location'].project:
            raise serializers.ValidationError({'location': 'Data source must be in the same project as the location.'})
        return data


class SourceColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = SourceColumn
        fields = [
            'id', 'dataset', 'name', 'position', 'data_type',
            'timestamp_role', 'sample_data', 'header_rows'
        ]

class DatasetSerializer(serializers.ModelSerializer):
    columns = SourceColumnSerializer(many=True, read_only=True)

    class Meta:
        model = Dataset
        fields = [
            'id', 'data_source', 'name', 'description',
            'import_config', 'created_at', 'updated_at', 'columns'
        ]

    def validate(self, data):
        """Ensure dataset belongs to an accessible project."""
        if data['data_source'].project.owner != self.context['request'].user:
            raise serializers.ValidationError({'data_source': 'You do not have access to this project.'})
        return data


class DataImportSerializer(serializers.ModelSerializer):
    dataset = DatasetSerializer(read_only=True)
    dataset_id = serializers.PrimaryKeyRelatedField(
        write_only=True,
        queryset=Dataset.objects.all(),
        source='dataset'
    )
    created_by = serializers.PrimaryKeyRelatedField(
        read_only=True,
        default=serializers.CurrentUserDefault()
    )
    approved_by = serializers.PrimaryKeyRelatedField(
        read_only=True,
        allow_null=True
    )
    progress_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = DataImport
        fields = [
            'id', 'dataset', 'dataset_id', 'status',
            'started_at', 'completed_at', 'total_rows',
            'processed_rows', 'error_count', 'success_count',
            'start_time', 'end_time', 'statistics', 'error_log',
            'processing_log', 'created_by', 'approved_by',
            'progress_percentage'
        ]
        read_only_fields = [
            'started_at', 'completed_at', 'total_rows',
            'processed_rows', 'error_count', 'success_count',
            'statistics', 'error_log', 'processing_log',
            'progress_percentage'
        ]

    def validate(self, data):
        """Ensure valid transitions between import statuses."""
        valid_transitions = {
            'pending': ['analyzing', 'failed'],
            'analyzing': ['configuring', 'failed'],
            'configuring': ['validated', 'failed'],
            'validated': ['in_progress', 'failed'],
            'in_progress': ['completed', 'partially_completed', 'failed'],
            'completed': [],
            'failed': [],
            'partially_completed': []
        }

        instance = getattr(self, 'instance', None)
        if instance and data['status'] not in valid_transitions.get(instance.status, []):
            raise serializers.ValidationError(
                f"Invalid status transition from {instance.status} to {data['status']}"
            )
        return data


class DataCopyGrantSerializer(serializers.ModelSerializer):
    from_user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    to_user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    measurement = serializers.PrimaryKeyRelatedField(queryset=Measurement.objects.all())
    granted_by = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)

    class Meta:
        model = DataCopyGrant
        fields = [
            'id', 'from_user', 'to_user', 'measurement',
            'granted_at', 'start_time', 'end_time', 'granted_by', 'revoked_at'
        ]
        read_only_fields = ['granted_at', 'revoked_at']

    def validate(self, data):
        """Ensure valid permissions for granting data access."""
        if data['from_user'] == data['to_user']:
            raise serializers.ValidationError({'to_user': 'Cannot grant copy permission to yourself'})

        if data['measurement'].location.project.owner != data['from_user']:
            raise serializers.ValidationError({'from_user': 'Must be the measurement owner'})

        if data['end_time'] and data['start_time'] and data['end_time'] < data['start_time']:
            raise serializers.ValidationError({'end_time': 'End time cannot be before start time'})

        return data

class ImportBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportBatch
        fields = [
            'id', 'data_import', 'batch_number', 'start_row',
            'end_row', 'status', 'error_count', 'success_count',
            'processing_time', 'error_details', 'retry_count',
            'last_error'
        ]
        read_only_fields = [
            'error_count', 'success_count', 'processing_time',
            'error_details', 'retry_count', 'last_error'
        ]