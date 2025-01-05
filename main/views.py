# views.py
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.contrib.auth import authenticate, login
from django.template.loader import render_to_string
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.permissions import IsAuthenticated

from .models import Project, Location, Measurement, MeasurementType
from .serializers import (
    ProjectSerializer, LocationSerializer, 
    MeasurementSerializer, ModelFieldsSerializer,
    MeasurementTypeSerializer
)

import chardet
import csv
from io import StringIO
import os
from openpyxl import Workbook

class TreeItemMixin:
    """Mixin for tree item viewsets that handles template rendering and parent/child relationships"""
    level_type = None  # Must be set by child class
    parent_field = None  # Only for middle and bottom levels
    has_children = True  # False for bottom level (Measurement)
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            try:
                serializer.is_valid(raise_exception=True)
            except serializers.ValidationError as e:
                return Response(
                    {'detail': self.format_validation_errors(e.detail)},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                self.perform_create(serializer)
            except ValidationError as e:
                return Response(
                    {'detail': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            # Get parent if this isn't top level
            parent = None
            if self.parent_field:
                parent = getattr(serializer.instance, self.parent_field)

            # Create serializer instance for model fields
            fields_serializer = ModelFieldsSerializer(instance=None)
            model_fields = fields_serializer.to_representation(None)
            
            # Get type info for current level
            type_info = model_fields.get(self.level_type, {})
            
            # Get the fields for this type
            fields = type_info.get('fields', [])
            if isinstance(fields, dict):
                fields = [{'name': k, 'type': v.get('type', 'string')} for k, v in fields.items()]
            elif isinstance(fields, list) and fields and isinstance(fields[0], str):
                fields = [{'name': f, 'type': 'string'} for f in fields]
            
            # Get next level type
            next_level_type = type_info.get('child_type')
            children_attr = f"{next_level_type}s" if next_level_type else None

            # Create context
            context = {
                'item': serializer.instance,
                'level_type': self.level_type,
                'model_fields': model_fields,
                'parent': parent,
                'fields': fields,
                'next_level_type': next_level_type,
                'children_attr': children_attr,
                'measurement_types': MeasurementType.objects.all() if self.level_type == 'measurement' else None
            }

            html = render_to_string('main/tree_item.html', context, request=request)
            
            return Response({
                'data': serializer.data,
                'html': html
            }, status=status.HTTP_201_CREATED)
            
        except serializers.ValidationError as e:
            return Response(
                {'detail': self.format_validation_errors(e.detail)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            import traceback
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST  # Changed from 500 to 400
            )
        
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        try:
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
        except serializers.ValidationError as e:
            return Response(
                {'detail': self.format_validation_errors(e.detail)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except Exception as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_destroy(self, instance):
        """Let the database handle cascading deletes"""
        instance.delete()

    def format_validation_errors(self, errors):
        """Format validation errors into a readable string"""
        if isinstance(errors, dict):
            return '\n'.join(f"{field}: {', '.join(msgs if isinstance(msgs, (list, tuple)) else [str(msgs)])}" 
                           for field, msgs in errors.items())
        return str(errors)

class ProjectViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    level_type = 'project'
    queryset = Project.objects.all()

class LocationViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = LocationSerializer
    level_type = 'location'
    parent_field = 'project'
    child_attr = 'measurements'

    def get_queryset(self):
        queryset = Location.objects.all()
        project_id = self.request.query_params.get('project')
        parent_id = self.request.query_params.get('parent')
        
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        return queryset
    
    @action(detail=False, methods=['get'])
    def root_locations(self, request):
        """Get only root locations (those without parents)"""
        locations = Location.objects.filter(parent=None)
        serializer = self.get_serializer(locations, many=True)
        return Response(serializer.data)

class MeasurementTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for MeasurementType model - read-only to prevent modifications"""
    serializer_class = MeasurementTypeSerializer
    queryset = MeasurementType.objects.all()
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

class MeasurementViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = MeasurementSerializer
    level_type = 'measurement'
    parent_field = 'location'
    has_children = False
    child_attr = None

    def get_queryset(self):
        queryset = Measurement.objects.select_related('measurement_type').all()
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    def perform_create(self, serializer):
        try:
            # Ensure measurement type exists
            if 'measurement_type_id' in self.request.data:
                measurement_type = MeasurementType.objects.get(
                    id=self.request.data['measurement_type_id']
                )
            super().perform_create(serializer)
        except MeasurementType.DoesNotExist:
            raise serializers.ValidationError('Invalid measurement type')
        except Exception as e:
            raise serializers.ValidationError(str(e))

class ModelFieldsViewSet(viewsets.ViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def list(self, request):
        serializer = ModelFieldsSerializer()
        data = serializer.to_representation(None)
        return Response(data)

@login_required(login_url='/')
def dashboard(request):
    # Prefetch related data to optimize database queries
    projects = Project.objects.prefetch_related(
        'locations',
        'locations__measurements',
        'locations__measurements__measurement_type',
        'locations__children'
    ).all()

    # Get measurement types for the form
    measurement_types = MeasurementType.objects.all()

    # Use serializer to get model fields
    serializer = ModelFieldsSerializer(instance=None)
    model_fields = serializer.to_representation(None)
    
    context = {
        'projects': projects,
        'model_fields': model_fields,
        'measurement_types': measurement_types
    }
    
    return render(request, 'main/dashboard.html', context)

def excel_upload(request):
    if 'csv_file' not in request.FILES:
        return JsonResponse({'error': 'CSV file is required'}, status=400)

    csv_file = request.FILES['csv_file']
    folder_path = request.POST.get('folder_path')
    workbook_name = request.POST.get('workbook_name')
    sheet_name = request.POST.get('sheet_name')

    if not all([folder_path, workbook_name, sheet_name]):
        return JsonResponse({'error': 'All fields are required'}, status=400)

    try:
        # Read and validate CSV content
        raw_content = csv_file.read()
        detected_encoding = chardet.detect(raw_content)['encoding']
        file_content = raw_content.decode(detected_encoding)
        csv_reader = csv.reader(StringIO(file_content))
        rows = list(csv_reader)

        # Validate headers and look for measurement_type column
        headers = rows[0]
        try:
            type_index = headers.index('measurement_type')
        except ValueError:
            return JsonResponse({
                'error': 'CSV must contain a measurement_type column'
            }, status=400)

        # Get valid measurement types, converting to lowercase for case-insensitive comparison
        valid_types = {t.lower(): t for t in MeasurementType.objects.values_list('name', flat=True)}

        # Validate all measurement types before processing
        invalid_types = []
        for row_num, row in enumerate(rows[1:], start=2):
            if row and len(row) > type_index:  # Check if row has enough columns
                measurement_type = row[type_index].strip().lower()
                if measurement_type and measurement_type not in valid_types:
                    invalid_types.append((row_num, row[type_index]))

        if invalid_types:
            error_msg = {
                'error': 'Invalid measurement types found',
                'measurement_type': [
                    f'Invalid measurement type "{t}" in row {r}' 
                    for r, t in invalid_types
                ]
            }
            return JsonResponse(error_msg, status=400)

        # Create Excel workbook and save
        workbook_name = workbook_name if workbook_name.endswith('.xlsx') else f"{workbook_name}.xlsx"
        wb = Workbook()
        ws = wb.active
        ws.title = sheet_name
        
        for row in rows:
            ws.append(row)
            
        full_path = os.path.join(folder_path, workbook_name)
        wb.save(full_path)

        return JsonResponse({
            'status': 'success',
            'message': 'File uploaded successfully',
            'valid_types': list(valid_types.values())
        })

    except UnicodeDecodeError:
        return JsonResponse({
            'error': 'Unable to decode file content'
        }, status=400)
    except Exception as e:
        # Log the error for debugging
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