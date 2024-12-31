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

from .models import Client, Project, Location, Measurement
from .serializers import (
    ClientSerializer, ProjectSerializer, LocationSerializer, 
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
        except serializers.ValidationError as e:
            return Response(
                {'detail': self.format_validation_errors(e.detail)},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get parent if this isn't top level
        parent = None
        if self.parent_field:
            parent = getattr(serializer.instance, self.parent_field)

        # Render the tree item template
        context = {
            'item': serializer.instance,
            'level_type': self.level_type,
            'model_fields': ModelFieldsSerializer(instance=None).data,
            'parent': parent
        }
        html = render_to_string('main/tree_item.html', context)
        
        return Response({
            'data': serializer.data,
            'html': html
        }, status=status.HTTP_201_CREATED)

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
        """Handle cascading deletes based on level type"""
        if hasattr(instance, 'children'):
            for child in instance.children.all():
                child.delete()
        if self.child_attr and hasattr(instance, self.child_attr):
            for child in getattr(instance, self.child_attr).all():
                child.delete()
        instance.delete()

    def format_validation_errors(self, errors):
        """Format validation errors into a readable string"""
        if isinstance(errors, dict):
            return '\n'.join(f"{field}: {', '.join(msgs if isinstance(msgs, (list, tuple)) else [str(msgs)])}" 
                           for field, msgs in errors.items())
        return str(errors)

class ClientViewSet(TreeItemMixin, viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    level_type = 'client'
    child_attr = 'projects'

class ProjectViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    level_type = 'project'
    parent_field = 'client'
    child_attr = 'locations'

    def get_queryset(self):
        queryset = Project.objects.all()
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        return queryset

    def perform_create(self, serializer):
        try:
            super().perform_create(serializer)
        except Exception as e:
            raise serializers.ValidationError(str(e))

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
        print("API Context Data:", data)  # Debugging
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
    clients = Client.objects.prefetch_related(
        'projects',
        'projects__locations',
        'projects__locations__measurements',
        'projects__locations__children'
    ).all()

    # Use serializer to get model fields
    serializer = ModelFieldsSerializer(instance=None)
    model_fields = serializer.to_representation(None)
    
    context = {
        'clients': clients,
        'model_fields': model_fields
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

# Simple view functions
def location(request):
    return render(request, 'main/location.html')

def measurement(request):
    return render(request, 'main/measurement.html')

def data(request):
    return render(request, 'main/data.html')

def dictionary(request):
    return render(request, 'main/dictionary.html')