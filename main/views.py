# views.py
from django.shortcuts import render, redirect
from django.db import models
from django.db.models import Prefetch
from django.http import JsonResponse
from django.contrib.auth import authenticate, login
from django.template.loader import render_to_string
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.utils.timezone import get_fixed_timezone 
from django.views.decorators.http import require_http_methods

from zoneinfo import available_timezones

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.permissions import IsAuthenticated

from .models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataImport, DataSource,
    Dataset, DataSourceLocation, ProjectAccess, DataCopyGrant
)
from .serializers import (
    ProjectSerializer, LocationSerializer, MeasurementSerializer,
    MeasurementCategorySerializer, MeasurementTypeSerializer,
    MeasurementUnitSerializer, ModelFieldsSerializer,
    DataSourceSerializer, DataSourceLocationSerializer,
    DatasetSerializer, SourceColumnSerializer, DataImportSerializer,
    ImportBatchSerializer, ProjectAccessSerializer, DataCopyGrantSerializer
)

from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

import chardet
import csv
from io import StringIO
import os


class TreeItemMixin:
    """
    Mixin for tree item viewsets that handles template rendering and hierarchical relationships.
    """
    level_type = None  # Must be set by child class
    has_children = True  # False for bottom level (e.g., Measurement)
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_field_metadata(self, model_class):
        """
        Get enhanced field metadata, including foreign key information and choice fields.
        """
        fields = []
        for field in model_class._meta.fields:
            if field.name in ('id', 'created_at', 'updated_at'):
                continue

            field_info = {
                'name': field.name,
                'type': field.get_internal_type(),
                'required': not field.blank,
                'verbose_name': field.verbose_name,
                'is_foreign_key': isinstance(field, models.ForeignKey),
                'display_field': hasattr(field, 'display_field') and field.display_field,
            }

            # Handle foreign key relationships
            if field_info['is_foreign_key']:
                related_model = field.related_model
                if hasattr(related_model, 'objects'):
                    related_objects = related_model.objects.all()
                    field_info.update({
                        'related_model': related_model._meta.model_name,
                        'choices': [
                            {
                                'id': obj.id,
                                'display_name': (
                                    getattr(obj, 'display_name', None) or 
                                    getattr(obj, 'name', str(obj))
                                ),
                            }
                            for obj in related_objects
                        ],
                    })

            # Handle choice fields (including multiplier choices)
            elif hasattr(field, 'choices') and field.choices:
                field_info.update({
                    'type': 'choice',
                    'choices': [
                        {'id': choice[0], 'display_name': choice[1]}
                        for choice in field.choices
                    ],
                })

            # Special handling for source_timezone field
            if field.name == 'source_timezone':
                field_info.update({
                    'type': 'choice',
                    'choices': [
                        {'id': tz, 'display_name': tz}
                        for tz in sorted(available_timezones())
                    ],
                })

            fields.append(field_info)

        return fields

    def get_context_for_item(self, instance):
        """
        Prepare context for rendering a tree item, including measurement-specific data.
        """
        fields_serializer = ModelFieldsSerializer()
        model_fields = fields_serializer.to_representation(None)
        type_info = model_fields.get(self.level_type, {})

        configured_fields = type_info.get('fields', [])
        fields = []
        all_field_metadata = self.get_field_metadata(self.get_serializer().Meta.model)

        # Merge configured fields with metadata
        for configured_field in configured_fields:
            field_name = configured_field['name']
            field_metadata = next(
                (f for f in all_field_metadata if f['name'] == field_name), 
                None
            )
            if field_metadata:
                merged_field = {**field_metadata, **configured_field}
                # Special handling for measurement unit choices
                if field_name == 'unit_id':
                    merged_field['choices'] = configured_field.get('choices', {})
                fields.append(merged_field)

        next_level_type = type_info.get('child_type')
        children_attr = f"{next_level_type}s" if next_level_type else None

        context = {
            'item': instance,
            'level_type': self.level_type,
            'model_fields': model_fields,
            'fields': fields,
            'next_level_type': next_level_type,
            'children_attr': children_attr,
            'has_children': self.has_children and bool(next_level_type),
        }

        # Add measurement-specific context if applicable
        if self.level_type == 'measurement':
            context.update({
                'category': instance.category,
                'type': instance.type,
                'unit': instance.unit,
                'multiplier_choices': dict(MeasurementType.MULTIPLIER_CHOICES),
            })

        return context

    def create(self, request, *args, **kwargs):
        """
        Create a new item with enhanced validation and relationship handling.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            instance = self.perform_create(serializer)
            # If perform_create returns None, get the instance from serializer
            if instance is None:
                instance = serializer.instance
                
            # Ensure proper related field prefetching for template context
            if hasattr(instance, 'refresh_from_db'):
                instance.refresh_from_db()
                
            context = self.get_context_for_item(instance)
            html = render_to_string('main/tree_item.html', context, request=request)
            
            return Response({
                'data': serializer.data,
                'html': html
            }, status=status.HTTP_201_CREATED)
            
        except ValidationError as e:
            return Response({
                'error': str(e),
                'fields': getattr(e, 'error_dict', {})
            }, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        """
        Update an existing item with enhanced validation and relationship handling.
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        try:
            self.perform_update(serializer)
            
            # Refresh instance to ensure we have latest data with all relations
            instance = self.get_object()
            
            # Get updated context and render template
            context = self.get_context_for_item(instance)
            html = render_to_string('main/tree_item.html', context, request=request)
            
            return Response({
                'data': serializer.data,
                'html': html
            })
            
        except ValidationError as e:
            return Response({
                'error': str(e),
                'fields': getattr(e, 'error_dict', {})
            }, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        """
        Delete an item with proper cleanup of related objects.
        """
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValidationError as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        """
        Perform creation with additional validation and relationship setup.
        """
        instance = serializer.save()
        return self.get_queryset().get(pk=instance.pk)

    def perform_update(self, serializer):
        """
        Perform update with additional validation and relationship maintenance.
        """
        instance = serializer.save()
        return instance

    def perform_destroy(self, instance):
        """
        Perform deletion with proper cleanup.
        """
        instance.delete()

class ProjectAccessViewSet(viewsets.ModelViewSet):
    queryset = ProjectAccess.objects.all()
    serializer_class = ProjectAccessSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Only return project access records for projects the user owns.
        """
        return ProjectAccess.objects.filter(project__owner=self.request.user)


class ProjectViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    level_type = 'project'
    queryset = Project.objects.all()

    def get_queryset(self):
        """
        Get queryset with optimized prefetching and optional filtering.
        """
        queryset = Project.objects.prefetch_related(
            'locations',
            'user_access',  # New: Include project access
            Prefetch(
                'locations__measurements',
                queryset=Measurement.objects.select_related(
                    'type',
                    'unit',
                    'unit__type',
                    'unit__type__category'
                )
            )
        )

        return queryset

    @action(detail=True, methods=['get'])
    def access(self, request, pk=None):
        """
        Get user access for a project.
        """
        project = self.get_object()
        access_records = ProjectAccess.objects.filter(project=project)
        serializer = ProjectAccessSerializer(access_records, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def grant_access(self, request, pk=None):
        """
        Grant user access to a project.
        """
        project = self.get_object()
        user_id = request.data.get('user_id')
        granted_by = request.user

        if not user_id:
            return Response({'error': 'User ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=user_id)
            project.grant_access(user, granted_by)
            return Response({'status': 'Access granted'}, status=status.HTTP_201_CREATED)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def revoke_access(self, request, pk=None):
        """
        Revoke user access to a project.
        """
        project = self.get_object()
        user_id = request.data.get('user_id')

        if not user_id:
            return Response({'error': 'User ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=user_id)
            project.revoke_access(user)
            return Response({'status': 'Access revoked'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class LocationViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = LocationSerializer
    level_type = 'location'
    parent_field = 'project'
    queryset = Location.objects.all()

    def get_queryset(self):
        """
        Get queryset with optimized prefetching and optional filtering.
        """
        queryset = Location.objects.select_related(
            'project'
        ).prefetch_related(
            Prefetch(
                'measurements',
                queryset=Measurement.objects.select_related(
                    'type',
                    'unit',
                    'unit__type',
                    'unit__type__category'
                )
            )
        )
        
        # Filter by project if provided
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        # Filter by name if provided
        name = self.request.query_params.get('name')
        if name:
            queryset = queryset.filter(name__icontains=name)

        # Filter by coordinates if provided
        latitude = self.request.query_params.get('latitude')
        longitude = self.request.query_params.get('longitude')
        if latitude and longitude:
            queryset = queryset.filter(
                latitude__isnull=False,
                longitude__isnull=False
            )
            
        return queryset

    def perform_create(self, serializer):
        """
        Create location with validation.
        """
        try:
            instance = serializer.save()
            return self.get_queryset().get(pk=instance.pk)
        except Exception as e:
            raise ValidationError(str(e))

    def perform_update(self, serializer):
        """
        Update location with validation.
        """
        try:
            instance = serializer.save()
            instance.refresh_from_db()
            return instance
        except Exception as e:
            raise ValidationError(str(e))

    @action(detail=True, methods=['get'])
    def measurements(self, request, pk=None):
        """
        Get measurements for a specific location.
        """
        location = self.get_object()
        measurements = location.measurements.select_related(
            'type',
            'unit',
            'unit__type',
            'unit__type__category'
        ).all()

        # Filter by category if provided
        category_id = request.query_params.get('category')
        if category_id:
            measurements = measurements.filter(type__category_id=category_id)

        # Filter by measurement type if provided
        type_id = request.query_params.get('type')
        if type_id:
            measurements = measurements.filter(type_id=type_id)

        serializer = MeasurementSerializer(measurements, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Get statistics about the location.
        """
        location = self.get_object()
        
        stats = {
            'measurement_count': location.measurements.count(),
            'categories': {},
            'latest_measurement': location.measurements.order_by(
                '-timeseries__timestamp'
            ).first(),
        }

        # Get measurement counts by category
        measurements = location.measurements.select_related(
            'type__category'
        ).all()
        
        for measurement in measurements:
            category = measurement.type.category
            if category.name not in stats['categories']:
                stats['categories'][category.name] = {
                    'count': 0,
                    'types': set()
                }
            stats['categories'][category.name]['count'] += 1
            stats['categories'][category.name]['types'].add(measurement.type.name)

        # Convert sets to lists for JSON serialization
        for category in stats['categories'].values():
            category['types'] = list(category['types'])
        
        return Response(stats)

    @action(detail=True, methods=['get'])
    def timeseries_summary(self, request, pk=None):
        """
        Get a summary of time series data availability for all measurements.
        """
        location = self.get_object()
        
        summary = []
        measurements = location.measurements.prefetch_related('timeseries').all()
        
        for measurement in measurements:
            timeseries = measurement.timeseries.order_by('timestamp')
            first = timeseries.first()
            last = timeseries.last()
            
            if first and last:
                summary.append({
                    'measurement_id': measurement.id,
                    'name': measurement.name,
                    'first_timestamp': first.timestamp,
                    'last_timestamp': last.timestamp,
                    'point_count': timeseries.count()
                })
        
        return Response(summary)

class DataCopyGrantViewSet(viewsets.ModelViewSet):
    queryset = DataCopyGrant.objects.all()
    serializer_class = DataCopyGrantSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Only return grants where the user is involved.
        """
        user = self.request.user
        return DataCopyGrant.objects.filter(models.Q(from_user=user) | models.Q(to_user=user))

class DataImportViewSet(viewsets.ModelViewSet):
    serializer_class = DataImportSerializer
    queryset = DataImport.objects.all()

    def get_queryset(self):
        """
        Restrict access to the project owner or users with granted access.
        """
        user = self.request.user
        return DataImport.objects.filter(
            models.Q(dataset__data_source__project__owner=user) |
            models.Q(dataset__data_source__project__user_access__user=user, dataset__data_source__project__user_access__revoked_at__isnull=True)
        )


class DatasetViewSet(viewsets.ModelViewSet):
    serializer_class = DatasetSerializer
    queryset = Dataset.objects.all()

    def get_queryset(self):
        """
        Restrict dataset access to the project owner or users with granted access.
        """
        user = self.request.user
        return Dataset.objects.filter(
            models.Q(data_source__project__owner=user) |
            models.Q(data_source__project__user_access__user=user, data_source__project__user_access__revoked_at__isnull=True)
        )

class MeasurementCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MeasurementCategorySerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Get queryset with optimized prefetching and optional filtering.
        """
        queryset = MeasurementCategory.objects.prefetch_related(
            'types',
            'types__units',
            Prefetch(
                'types__measurements',
                queryset=Measurement.objects.select_related('location', 'unit')
            )
        )

        # Filter by name if provided
        name = self.request.query_params.get('name')
        if name:
            queryset = queryset.filter(name__icontains=name)

        return queryset

    @action(detail=True, methods=['get'])
    def types(self, request, pk=None):
        """
        Get measurement types for a specific category.
        """
        category = self.get_object()
        types = category.types.prefetch_related('units').all()
        serializer = MeasurementTypeSerializer(types, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def measurements(self, request, pk=None):
        """
        Get all measurements in this category.
        """
        category = self.get_object()
        measurements = Measurement.objects.filter(
            type__category=category
        ).select_related(
            'type',
            'unit',
            'location',
            'location__project'
        )

        # Optional location filter
        location_id = request.query_params.get('location')
        if location_id:
            measurements = measurements.filter(location_id=location_id)

        serializer = MeasurementSerializer(measurements, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Get statistics about the category.
        """
        category = self.get_object()
        
        stats = {
            'type_count': category.types.count(),
            'measurement_count': Measurement.objects.filter(
                type__category=category
            ).count(),
            'unit_count': MeasurementUnit.objects.filter(
                type__category=category
            ).count(),
            'types': [{
                'name': t.name,
                'measurement_count': t.measurements.count(),
                'unit_count': t.units.count(),
            } for t in category.types.all()]
        }
        
        return Response(stats)


class MeasurementTypeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MeasurementTypeSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Get queryset with optimized prefetching and optional filtering.
        """
        queryset = MeasurementType.objects.select_related(
            'category'
        ).prefetch_related(
            'units',
            Prefetch(
                'measurements',
                queryset=Measurement.objects.select_related('location', 'unit')
            )
        )

        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category_id=category)

        # Filter by name if provided
        name = self.request.query_params.get('name')
        if name:
            queryset = queryset.filter(name__icontains=name)

        # Filter by supports_multipliers if provided
        supports_multipliers = self.request.query_params.get('supports_multipliers')
        if supports_multipliers is not None:
            queryset = queryset.filter(supports_multipliers=supports_multipliers)

        return queryset

    @action(detail=True, methods=['get'])
    def units(self, request, pk=None):
        """
        Get units for a specific measurement type.
        """
        measurement_type = self.get_object()
        units = measurement_type.units.all()
        serializer = MeasurementUnitSerializer(units, many=True)
        
        # Include base unit information
        base_unit = next((unit for unit in units if unit.is_base_unit), None)
        response_data = {
            'units': serializer.data,
            'base_unit': MeasurementUnitSerializer(base_unit).data if base_unit else None
        }
        return Response(response_data)

    @action(detail=True, methods=['get'])
    def measurements(self, request, pk=None):
        """
        Get all measurements of this type.
        """
        measurement_type = self.get_object()
        measurements = measurement_type.measurements.select_related(
            'unit',
            'location',
            'location__project'
        ).all()

        # Optional location filter
        location_id = request.query_params.get('location')
        if location_id:
            measurements = measurements.filter(location_id=location_id)

        serializer = MeasurementSerializer(measurements, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Get statistics about the measurement type.
        """
        measurement_type = self.get_object()
        
        stats = {
            'measurement_count': measurement_type.measurements.count(),
            'unit_count': measurement_type.units.count(),
            'base_unit': next(
                (str(unit) for unit in measurement_type.units.all() if unit.is_base_unit),
                None
            ),
            'locations_count': measurement_type.measurements.values(
                'location'
            ).distinct().count(),
            'projects_count': measurement_type.measurements.values(
                'location__project'
            ).distinct().count()
        }
        
        return Response(stats)    

class MeasurementViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = MeasurementSerializer
    level_type = 'measurement'
    parent_field = 'location'
    has_children = False
    child_attr = None

    def get_queryset(self):
        """
        Get queryset with optimized prefetching of related fields and optional filtering.
        """
        queryset = Measurement.objects.select_related(
            'type',
            'unit',
            'unit__type',
            'unit__type__category',
            'location',
            'location__project'
        )

        # Filter by location if provided
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        # Filter by type if provided
        measurement_type = self.request.query_params.get('type')
        if measurement_type:
            queryset = queryset.filter(type_id=measurement_type)

        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(type__category_id=category)

        return queryset

    def perform_create(self, serializer):
        """
        Create measurement with additional validation and relationship setup.
        """
        try:
            # Get the unit and validate it belongs to the correct type
            unit = serializer.validated_data.get('unit')
            if unit:
                measurement_type = unit.type
                
                # Validate multiplier if provided
                multiplier = serializer.validated_data.get('multiplier')
                if multiplier and not measurement_type.supports_multipliers:
                    raise ValidationError({
                        'multiplier': f'Type {measurement_type} does not support multipliers'
                    })

            # Validate timezone
            timezone = serializer.validated_data.get('source_timezone')
            if timezone and timezone not in available_timezones():
                raise ValidationError({'source_timezone': f'Invalid timezone: {timezone}'})
           
            instance = serializer.save()
            
            # Refresh to get all related fields
            return type(instance).objects.select_related(
                'type',
                'unit',
                'unit__type',
                'unit__type__category',
                'location',
                'location__project'
            ).get(pk=instance.pk)

        except ValidationError as e:
            raise e
        except Exception as e:
            raise ValidationError(str(e))

    def perform_update(self, serializer):
        """
        Update measurement with validation of relationships and constraints.
        """
        try:
            # Validate unit and type relationships
            unit = serializer.validated_data.get('unit')
            if unit:
                measurement_type = unit.type
                
                # Validate multiplier if being updated
                multiplier = serializer.validated_data.get('multiplier')
                if multiplier is not None and not measurement_type.supports_multipliers:
                    raise ValidationError({
                        'multiplier': f'Type {measurement_type} does not support multipliers'
                    })

            # Validate timezone if being updated
            timezone = serializer.validated_data.get('source_timezone')
            if timezone:
                try:
                    get_fixed_timezone(timezone)
                except Exception:
                    raise ValidationError({'source_timezone': f'Invalid timezone: {timezone}'})

            instance = serializer.save()
            
            # Refresh to get updated related fields
            instance.refresh_from_db()
            return instance

        except ValidationError as e:
            raise e
        except Exception as e:
            raise ValidationError(str(e))

    @action(detail=True, methods=['get'])
    def timeseries(self, request, pk=None):
        """
        Get time series data for a measurement.
        """
        measurement = self.get_object()
        
        # Get query parameters for time range
        start_time = request.query_params.get('start')
        end_time = request.query_params.get('end')
        
        # Base queryset
        queryset = measurement.timeseries.all()
        
        # Apply time filters if provided
        if start_time:
            queryset = queryset.filter(timestamp__gte=start_time)
        if end_time:
            queryset = queryset.filter(timestamp__lte=end_time)
        
        # Limit to recent data if no time range specified
        if not (start_time or end_time):
            queryset = queryset.order_by('-timestamp')[:1000]
        
        data = [{
            'timestamp': entry.timestamp,
            'value': entry.value,
        } for entry in queryset]
        
        return Response({
            'measurement_id': measurement.id,
            'name': measurement.name,
            'unit': str(measurement.unit),
            'data': data
        })

    @action(detail=False, methods=['get'])
    def choices(self, request):
        """
        Get available choices for measurement creation/updating.
        """
        # Get categories with their types and units
        categories = MeasurementCategory.objects.prefetch_related(
            'types',
            'types__units'
        ).all()
        
        choices = {
            'categories': [
                {
                    'id': cat.id,
                    'name': cat.name,
                    'display_name': cat.display_name,
                    'types': [
                        {
                            'id': type.id,
                            'name': type.name,
                            'supports_multipliers': type.supports_multipliers,
                            'units': [
                                {
                                    'id': unit.id,
                                    'name': unit.name,
                                    'is_base_unit': unit.is_base_unit
                                }
                                for unit in type.units.all()
                            ]
                        }
                        for type in cat.types.all()
                    ]
                }
                for cat in categories
            ],
            'multipliers': [
                {'value': choice[0], 'display': choice[1]}
                for choice in MeasurementType.MULTIPLIER_CHOICES
            ],

            'timezones': [
                {'value': tz, 'display': tz}
                for tz in sorted(available_timezones())
            ]
        }
        
        return Response(choices)

class ModelFieldsViewSet(viewsets.ViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def list(self, request):
        """
        Get all field definitions and relationships for frontend form building.
        """
        # Get all measurement-related choices first
        categories = MeasurementCategory.objects.prefetch_related(
            'types',
            'types__units'
        ).all()

        measurement_choices = {
            'categories': [
                {
                    'id': cat.id,
                    'name': cat.name,
                    'display_name': cat.display_name,
                    'types': [
                        {
                            'id': type.id,
                            'name': type.name,
                            'description': type.description,
                            'supports_multipliers': type.supports_multipliers,
                            'units': [
                                {
                                    'id': unit.id,
                                    'name': unit.name,
                                    'is_base_unit': unit.is_base_unit,
                                    'conversion_factor': unit.conversion_factor
                                }
                                for unit in type.units.all()
                            ]
                        }
                        for type in cat.types.all()
                    ]
                }
                for cat in categories
            ],
            'multipliers': [
                {'id': choice[0], 'display_name': choice[1]}
                for choice in MeasurementType.MULTIPLIER_CHOICES
            ]
        }

        return Response({
            'project': {
                'level': 1,
                'model_name': 'project',
                'display_field': 'name',
                'fields': [
                    {
                        'name': 'name',
                        'type': 'string',
                        'required': True,
                        'display_field': True
                    },
                    {
                        'name': 'project_type',
                        'type': 'choice',
                        'required': True,
                        'choices': [
                            {'id': c[0], 'display_name': c[1]}
                            for c in Project.ProjectType
                        ]
                    },
                    {
                        'name': 'start_date',
                        'type': 'date',
                        'required': False
                    },
                    {
                        'name': 'end_date',
                        'type': 'date',
                        'required': False
                    }
                ],
                'child_type': 'location',
                'validation_rules': {
                    'end_date': ['after_start_date']
                }
            },
            'location': {
                'level': 2,
                'model_name': 'location',
                'display_field': 'name',
                'fields': [
                    {
                        'name': 'name',
                        'type': 'string',
                        'required': True,
                        'display_field': True
                    },
                    {
                        'name': 'address',
                        'type': 'text',
                        'required': True
                    },
                    {
                        'name': 'latitude',
                        'type': 'decimal',
                        'required': False,
                        'decimal_places': 6,
                        'max_digits': 9
                    },
                    {
                        'name': 'longitude',
                        'type': 'decimal',
                        'required': False,
                        'decimal_places': 6,
                        'max_digits': 9
                    }
                ],
                'parent_type': 'project',
                'child_type': 'measurement',
                'validation_rules': {
                    'latitude': ['valid_latitude'],
                    'longitude': ['valid_longitude']
                }
            },
            'measurement': {
                'level': 3,
                'model_name': 'measurement',
                'display_field': 'name',
                'fields': [
                    {
                        'name': 'name',
                        'type': 'string',
                        'required': True,
                        'display_field': True
                    },
                    {
                        'name': 'description',
                        'type': 'text',
                        'required': False
                    },
                    {
                        'name': 'category',
                        'type': 'foreign_key',
                        'required': True,
                        'choices': measurement_choices['categories']
                    },
                    {
                        'name': 'type',
                        'type': 'foreign_key',
                        'required': True,
                        'depends_on': 'category'
                    },
                    {
                        'name': 'unit',
                        'type': 'foreign_key',
                        'required': True,
                        'depends_on': 'type'
                    },
                    {
                        'name': 'multiplier',
                        'type': 'choice',
                        'required': False,
                        'choices': measurement_choices['multipliers'],
                        'conditional': 'type.supports_multipliers'
                    },
                    {
                        'name': 'source_timezone',
                        'type': 'choice',
                        'required': True,
                        'choices': [
                            {'id': tz, 'display_name': tz}
                            for tz in sorted(available_timezones())
                        ],
                        'default': 'UTC'
                    }
                ],
                'parent_type': 'location',
                'validation_rules': {
                    'unit': ['belongs_to_type'],
                    'multiplier': ['supported_by_type'],
                    'source_timezone': ['valid_timezone']
                }
            }
        })

    @action(detail=False, methods=['get'])
    def validation_rules(self, request):
        """
        Get all validation rules that can be applied to fields.
        """
        return Response({
            'after_start_date': {
                'type': 'date_comparison',
                'compare_to': 'start_date',
                'operator': 'gt'
            },
            'valid_latitude': {
                'type': 'range',
                'min': -90,
                'max': 90
            },
            'valid_longitude': {
                'type': 'range',
                'min': -180,
                'max': 180
            },
            'belongs_to_type': {
                'type': 'relationship',
                'check': 'unit.type_id === type_id'
            },
            'supported_by_type': {
                'type': 'conditional',
                'condition': 'type.supports_multipliers'
            },
            'valid_timezone': {
                'type': 'timezone'
            }
        })

    @action(detail=False, methods=['get'])
    def dependencies(self, request):
        """
        Get field dependencies for dynamic form updates.
        """
        return Response({
            'measurement': {
                'type': ['category'],
                'unit': ['type'],
                'multiplier': ['type.supports_multipliers']
            }
        })

@login_required(login_url='/')
def dashboard(request):
    """
    Dashboard view to prefetch related data and render the main dashboard.
    """
    try:
        # Prefetch all project-related data in an optimized way
        projects = Project.objects.prefetch_related(
            'locations',
            Prefetch(
                'locations__measurements',
                queryset=Measurement.objects.select_related(
                    'type',
                    'unit',
                    'unit__type',
                    'unit__type__category'
                )
            )
        ).all()

        # Get categories with their types and units
        categories = MeasurementCategory.objects.prefetch_related(
            'types',
            'types__units',
            Prefetch(
                'types__measurements',
                queryset=Measurement.objects.select_related('location', 'unit')
            )
        ).all()

        # Prepare category statistics
        category_stats = {}
        for category in categories:
            type_stats = {}
            for mtype in category.types.all():
                type_stats[mtype.name] = {
                    'id': mtype.id,
                    'measurement_count': mtype.measurements.count(),
                    'units': [{'id': u.id, 'name': u.name, 'is_base_unit': u.is_base_unit}
                             for u in mtype.units.all()]
                }
            
            category_stats[category.name] = {
                'id': category.id,
                'display_name': category.display_name,
                'description': category.description,
                'types': type_stats,
                'total_measurements': sum(s['measurement_count'] for s in type_stats.values())
            }

        # Get model fields for dynamic form rendering
        serializer = ModelFieldsSerializer(instance=None)
        model_fields = serializer.to_representation(None)

        # Prepare project statistics
        project_stats = {}
        for project in projects:
            measurement_count = sum(
                location.measurements.count() 
                for location in project.locations.all()
            )
            project_stats[project.id] = {
                'location_count': project.locations.count(),
                'measurement_count': measurement_count,
                'start_date': project.start_date,
                'end_date': project.end_date,
                'project_type': project.get_project_type_display()
            }

        context = {
            'projects': projects,
            'project_stats': project_stats,
            'categories': categories,
            'category_stats': category_stats,
            'model_fields': model_fields,
            'measurement_types': MeasurementType.objects.select_related('category').all(),
            'multiplier_choices': dict(MeasurementType.MULTIPLIER_CHOICES),
            'project_types': dict(Project.ProjectType.choices)
        }

        return render(request, 'main/dashboard.html', context)

    except Exception as e:
        import traceback
        print(f"Error in dashboard view: {str(e)}")
        print(traceback.format_exc())
        return render(request, 'main/dashboard.html', {
            'error': 'An error occurred while loading the dashboard',
            'details': str(e)
        })

def excel_upload(request):
    """
    Handle upload of CSV files and convert to Excel with validation.
    """
    if 'csv_file' not in request.FILES:
        return JsonResponse({'error': 'CSV file is required'}, status=400)

    csv_file = request.FILES['csv_file']
    folder_path = request.POST.get('folder_path')
    workbook_name = request.POST.get('workbook_name')
    sheet_name = request.POST.get('sheet_name')

    if not all([folder_path, workbook_name, sheet_name]):
        return JsonResponse({'error': 'All fields are required'}, status=400)

    try:
        # Read and detect encoding
        raw_content = csv_file.read()
        detected_encoding = chardet.detect(raw_content)['encoding']
        file_content = raw_content.decode(detected_encoding)
        csv_reader = csv.reader(StringIO(file_content))
        rows = list(csv_reader)

        if not rows:
            return JsonResponse({'error': 'CSV file is empty'}, status=400)

        headers = rows[0]
        required_columns = ['category', 'type', 'unit']
        missing_columns = [col for col in required_columns if col not in headers]
        
        if missing_columns:
            return JsonResponse({
                'error': 'Missing required columns',
                'missing': missing_columns
            }, status=400)

        # Get column indices
        category_index = headers.index('category')
        type_index = headers.index('type')
        unit_index = headers.index('unit')

        # Validate against database
        categories = MeasurementCategory.objects.prefetch_related(
            'types__units'
        ).all()
        
        # Build validation lookup dictionaries
        valid_categories = {c.name.lower(): c for c in categories}
        valid_types = {}
        valid_units = {}
        
        for category in categories:
            category_types = {t.name.lower(): t for t in category.types.all()}
            valid_types[category.name.lower()] = category_types
            
            for type_obj in category.types.all():
                type_units = {u.name.lower(): u for u in type_obj.units.all()}
                valid_units[type_obj.name.lower()] = type_units

        # Validate rows
        validation_errors = []
        for row_num, row in enumerate(rows[1:], start=2):
            if not row or len(row) < max(category_index, type_index, unit_index) + 1:
                validation_errors.append(f'Row {row_num}: Invalid row length')
                continue

            category = row[category_index].strip().lower()
            meas_type = row[type_index].strip().lower()
            unit = row[unit_index].strip().lower()

            if not category:
                validation_errors.append(f'Row {row_num}: Empty category')
                continue

            if category not in valid_categories:
                validation_errors.append(
                    f'Row {row_num}: Invalid category "{row[category_index]}"'
                )
                continue

            if not meas_type:
                validation_errors.append(f'Row {row_num}: Empty type')
                continue

            if meas_type not in valid_types.get(category, {}):
                validation_errors.append(
                    f'Row {row_num}: Invalid type "{row[type_index]}" for category "{row[category_index]}"'
                )
                continue

            if not unit:
                validation_errors.append(f'Row {row_num}: Empty unit')
                continue

            if unit not in valid_units.get(meas_type, {}):
                validation_errors.append(
                    f'Row {row_num}: Invalid unit "{row[unit_index]}" for type "{row[type_index]}"'
                )

        if validation_errors:
            return JsonResponse({
                'error': 'Validation errors found',
                'errors': validation_errors
            }, status=400)

        # Create Excel workbook
        wb = Workbook()
        ws = wb.active
        ws.title = sheet_name

        # Add headers with validation lists
        for col, header in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col, value=header)
            
            # Add data validation for known columns
            if header == 'category':
                dv = DataValidation(
                    type="list",
                    formula1=f'"{",".join(valid_categories.keys())}"',
                    allow_blank=False
                )
                ws.add_data_validation(dv)
                dv.add(f'{get_column_letter(col)}2:{get_column_letter(col)}1048576')
                
            elif header == 'type':
                # Type validation will be handled by custom Excel formulas
                pass
                
            elif header == 'unit':
                # Unit validation will be handled by custom Excel formulas
                pass

        # Add data rows
        for row in rows[1:]:
            ws.append(row)

        # Add dynamic validation formulas for types and units
        type_col = get_column_letter(type_index + 1)
        category_col = get_column_letter(category_index + 1)
        unit_col = get_column_letter(unit_index + 1)

        # Add helper sheets for lookups
        lookup_sheet = wb.create_sheet(title="Lookups")
        current_row = 1

        # Write category-type mappings
        for category, types in valid_types.items():
            lookup_sheet.cell(row=current_row, column=1, value=category)
            for col, type_name in enumerate(types.keys(), start=2):
                lookup_sheet.cell(row=current_row, column=col, value=type_name)
            current_row += 1

        # Write type-unit mappings
        unit_start_row = current_row + 1
        for type_name, units in valid_units.items():
            lookup_sheet.cell(row=current_row, column=1, value=type_name)
            for col, unit_name in enumerate(units.keys(), start=2):
                lookup_sheet.cell(row=current_row, column=col, value=unit_name)
            current_row += 1

        # Save workbook
        workbook_name = workbook_name if workbook_name.endswith('.xlsx') else f"{workbook_name}.xlsx"
        full_path = os.path.join(folder_path, workbook_name)
        wb.save(full_path)

        return JsonResponse({
            'status': 'success',
            'message': 'File processed successfully',
            'path': full_path,
            'stats': {
                'total_rows': len(rows) - 1,
                'categories': len(valid_categories),
                'types': sum(len(types) for types in valid_types.values()),
                'units': sum(len(units) for units in valid_units.values())
            }
        })

    except Exception as e:
        import traceback
        print(f"Error in excel_upload: {str(e)}")
        print(traceback.format_exc())
        return JsonResponse({
            'error': 'An error occurred while processing the file',
            'details': str(e)
        }, status=500)

def index(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('dashboard')
        else:
            return render(request, 'main/index.html', {'error': 'Invalid credentials'})
    return render(request, 'main/index.html')

def project(request):
    return render(request, 'main/project.html')

def measurement(request):
    return render(request, 'main/measurement.html')

def data(request):
    return render(request, 'main/data.html')

def model(request):
    return render(request, 'main/model.html')


def get_preview_content(file_like_object, max_size=5000):
    """
    Get preview content from any file-like object
    Returns preview content and whether it was truncated
    """
    try:
        file_like_object.seek(0)
        # Read raw bytes first
        raw_content = file_like_object.read()
        if not raw_content:
            return "Empty file", False

        # Try UTF-8 first
        try:
            content = raw_content.decode('utf-8')
        except UnicodeDecodeError:
            # If UTF-8 fails, try to detect encoding
            import chardet
            detected = chardet.detect(raw_content)
            if detected and detected['encoding']:
                try:
                    content = raw_content.decode(detected['encoding'])
                except UnicodeDecodeError:
                    # If all else fails, try with 'latin1' (which always works but might be incorrect)
                    content = raw_content.decode('latin1')
            else:
                content = raw_content.decode('latin1')

        # Truncate if needed
        if len(content) > max_size:
            content = content[:max_size] + "\n... (content truncated for preview)"
            was_truncated = True
        else:
            was_truncated = False

        # Reset file pointer for future reads
        file_like_object.seek(0)
        return content, was_truncated

    except Exception as e:
        print(f"Error in get_preview_content: {str(e)}")
        raise ValueError(f'Error reading file content: {str(e)}')
    
@login_required
@require_http_methods(["POST"])
def create_data_import(request):
    """Create a new data import from a file upload"""
    try:
        # Validate inputs
        location_id = request.POST.get('location_id')
        if not location_id:
            return JsonResponse({'error': 'No location ID provided'}, status=400)

        # Get location and verify access
        try:
            location = Location.objects.select_related('project').get(id=location_id)
            project = location.project
            
            # Verify user has access to project
            if not (request.user == project.owner or 
                    ProjectAccess.objects.filter(
                        project=project,
                        user=request.user,
                        revoked_at__isnull=True
                    ).exists()):
                return JsonResponse({'error': 'No access to this location'}, status=403)
                
        except Location.DoesNotExist:
            return JsonResponse({'error': 'Invalid location ID'}, status=400)

        # Validate file
        if 'file' not in request.FILES:
            return JsonResponse({'error': 'No file provided'}, status=400)
        
        file = request.FILES['file']
        if not file.name.lower().endswith('.csv'):
            return JsonResponse({'error': 'Only CSV files are supported'}, status=400)

        # Create data source
        try:
            data_source = DataSource.objects.create(
                name=f'File Upload - {file.name}',
                source_type='file',
                description=f'File upload for location {location.name}',
                project=project,
                created_by=request.user
            )
        except Exception as e:
            return JsonResponse({'error': f'Failed to create data source: {str(e)}'}, status=500)

        # Link data source to location
        try:
            DataSourceLocation.objects.create(
                data_source=data_source,
                location=location
            )
        except Exception as e:
            data_source.delete()  # Cleanup on failure
            return JsonResponse({'error': f'Failed to link data source to location: {str(e)}'}, status=500)

        # Create dataset
        try:
            dataset = Dataset.objects.create(
                data_source=data_source,
                name=f'Dataset - {file.name}',
                created_by=request.user
            )
        except Exception as e:
            data_source.delete()  # Cleanup on failure
            return JsonResponse({'error': f'Failed to create dataset: {str(e)}'}, status=500)

        # Create import record
        try:
            data_import = DataImport.objects.create(
                dataset=dataset,
                status='analyzing',
                created_by=request.user
            )
        except Exception as e:
            dataset.delete()  # Cleanup on failure
            return JsonResponse({'error': f'Failed to create import record: {str(e)}'}, status=500)

        # Generate preview
        try:
            preview_content, was_truncated = get_preview_content(file)
        except ValueError as e:
            # Clean up created objects on preview failure
            data_import.delete()
            dataset.delete()
            data_source.delete()
            return JsonResponse({'error': f'Failed to generate preview: {str(e)}'}, status=500)

        return JsonResponse({
            'import_id': data_import.id,
            'dataset_id': dataset.id,
            'preview_content': preview_content,
            'preview_truncated': was_truncated,
            'status': 'success'
        })

    except Exception as e:
        print(f"Error in create_data_import: {str(e)}")
        return JsonResponse({
            'error': str(e),
            'status': 'error'
        }, status=500)       


@login_required
@require_http_methods(["GET"])
def get_data_import(request, import_id):
    try:
        data_import = DataImport.objects.get(id=import_id)
        
        return JsonResponse({
            'id': data_import.id,
            'status': data_import.status,
            'created_at': data_import.started_at.isoformat(),
            'file_name': data_import.import_file.name if data_import.import_file else None,
        })
        
    except DataImport.DoesNotExist:
        return JsonResponse({'error': 'Import not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)