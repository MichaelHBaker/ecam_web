# views.py
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.contrib.auth import authenticate, login
from django.template.loader import render_to_string
from django.contrib.auth.decorators import login_required

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.permissions import IsAuthenticated

from .models import Project, Location, Measurement
from .serializers import (
    ProjectSerializer, LocationSerializer, 
    MeasurementSerializer, ModelFieldsSerializer
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
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            
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
            }

            html = render_to_string('main/tree_item.html', context, request=request)
            
            return Response({
                'data': serializer.data,
                'html': html
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            import traceback
            return Response(
                {'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        try:
            serializer.is_valid(raise_exception=True)
        except serializers.ValidationError as e:
            return Response(
                {'detail': self.format_validation_errors(e.detail)},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
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

    def perform_create(self, serializer):
        try:
            # Validate parent-project relationship
            parent = serializer.validated_data.get('parent')
            project = serializer.validated_data.get('project')
            if parent and parent.project != project:
                raise serializers.ValidationError({
                    'parent': 'Parent location must belong to the same project'
                })
            super().perform_create(serializer)
        except Exception as e:
            raise serializers.ValidationError(str(e))

class MeasurementViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = MeasurementSerializer
    level_type = 'measurement'
    parent_field = 'location'
    has_children = False
    child_attr = None

    def get_queryset(self):
        queryset = Measurement.objects.all()
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    def perform_create(self, serializer):
        try:
            super().perform_create(serializer)
        except Exception as e:
            raise serializers.ValidationError(str(e))

class ModelFieldsViewSet(viewsets.ViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def list(self, request):
        serializer = ModelFieldsSerializer()
        data = serializer.to_representation(None)  # Explicitly call to_representation
        return Response(data)

# View Functions
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

@login_required(login_url='/')
def dashboard(request):
    # Prefetch related data to optimize database queries
    projects = Project.objects.prefetch_related(
        'locations',
        'locations__measurements',
        'locations__children'
    ).all()

    # Use serializer to get model fields
    serializer = ModelFieldsSerializer(instance=None)
    model_fields = serializer.to_representation(None)
    
    context = {
        'projects': projects,
        'model_fields': model_fields
    }
    
    return render(request, 'main/dashboard.html', context)

# CSV and utility view functions remain unchanged...
def excel_upload(request):
    if 'csv_file' not in request.FILES:
        return JsonResponse({'error': 'CSV file is required'}, status=400)

    csv_file = request.FILES['csv_file']
    folder_path = request.POST.get('folder_path')
    workbook_name = request.POST.get('workbook_name')
    sheet_name = request.POST.get('sheet_name')

    if not all([folder_path, workbook_name, sheet_name]):
        return JsonResponse({'error': 'All fields are required'}, status=400)

    if not workbook_name.endswith('.xlsx'):
        workbook_name += '.xlsx'

    if not os.path.exists(folder_path):
        return JsonResponse({'error': 'Folder path does not exist'}, status=400)

    if csv_file.size == 0:
        return JsonResponse({'error': 'The selected CSV file is empty'}, status=400)

    try:
        # Read and validate CSV content
        raw_content = csv_file.read()
        detected_encoding = chardet.detect(raw_content)['encoding']
        file_content = raw_content.decode(detected_encoding)
        csv_reader = csv.reader(StringIO(file_content))
        rows = list(csv_reader)

        if len(rows) == 1:
            return JsonResponse({'error': 'The CSV file contains only headers'}, status=400)

        # Check for inconsistent columns
        column_count = len(rows[0])
        if any(len(row) != column_count for row in rows[1:]):
            return JsonResponse({'error': 'Inconsistent number of columns in CSV'}, status=400)

        # Check for duplicate headers
        headers = rows[0]
        if len(headers) != len(set(headers)):
            return JsonResponse({'error': 'Duplicate headers found in CSV'}, status=400)

        # Create Excel workbook
        wb = Workbook()
        ws = wb.active
        ws.title = sheet_name

        for row in rows:
            ws.append(row)

        full_path = os.path.join(folder_path, workbook_name)
        wb.save(full_path)

        return JsonResponse({
            'status': 'success',
            'message': 'Valid CSV File'
        })
    except UnicodeDecodeError:
        return JsonResponse({'error': 'Unable to decode file content'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

# Simple view functions remain unchanged...
def project(request):
    return render(request, 'main/project.html')

def measurement(request):
    return render(request, 'main/measurement.html')

def data(request):
    return render(request, 'main/data.html')

def model(request):
    return render(request, 'main/model.html')