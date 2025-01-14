# views.py
from django.shortcuts import render, redirect
from django.db import models
from django.http import JsonResponse
from django.contrib.auth import authenticate, login
from django.template.loader import render_to_string
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.views import View

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.permissions import IsAuthenticated

from .models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit
)
from .serializers import (
    ProjectSerializer, LocationSerializer, MeasurementSerializer,
    MeasurementCategorySerializer, MeasurementTypeSerializer,
    MeasurementUnitSerializer, ModelFieldsSerializer
)

import chardet
import csv
from io import StringIO
import os
from openpyxl import Workbook

class ChatPageView(View):
    def get(self, request):
        return render(request, 'main/chat.html')

class TreeItemMixin:
    """Mixin for tree item viewsets that handles template rendering and parent/child relationships"""
    level_type = None  # Must be set by child class
    parent_field = None  # Only for middle and bottom levels
    has_children = True  # False for bottom level (Measurement)
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_field_metadata(self, model_class):
        """Get enhanced field metadata including foreign key information"""
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
                'display_field': 'name'
            }
            
            if field_info['is_foreign_key']:
                related_model = field.related_model
                related_objects = related_model.objects.all()
                
                choices = []
                for obj in related_objects:
                    choice = {'id': obj.id}
                    
                    if hasattr(obj, 'display_name'):
                        choice['display_name'] = obj.display_name
                    elif hasattr(obj, 'name'):
                        choice['display_name'] = getattr(obj, 'name')
                    else:
                        choice['display_name'] = str(obj)
                        
                    choices.append(choice)
                    
                field_info.update({
                    'related_model': related_model._meta.model_name,
                    'choices': choices,
                    'display_field': 'display_name' if hasattr(related_model, 'display_name') else 'name'
                })
            
            elif hasattr(field, 'choices') and field.choices:
                field_info.update({
                    'type': 'choice',
                    'choices': [
                        {'id': choice[0], 'display_name': choice[1]}
                        for choice in field.choices
                    ]
                })
                
            fields.append(field_info)
            
        return fields
    
    def get_context_for_item(self, instance, parent=None):
        """Prepare context for rendering a tree item"""
        fields_serializer = ModelFieldsSerializer()
        model_fields = fields_serializer.to_representation(None)
        type_info = model_fields.get(self.level_type, {})
        
        configured_fields = type_info.get('fields', [])
        
        fields = []
        all_field_metadata = self.get_field_metadata(self.get_serializer().Meta.model)
        
        for configured_field in configured_fields:
            field_name = configured_field['name']
            field_metadata = next((f for f in all_field_metadata if f['name'] == field_name), None)
            if field_metadata:
                merged_field = {**field_metadata, **configured_field}
                fields.append(merged_field)
        
        next_level_type = type_info.get('child_type')
        children_attr = f"{next_level_type}s" if next_level_type else None

        return {
            'item': instance,
            'level_type': self.level_type,
            'model_fields': model_fields,
            'parent': parent,
            'fields': fields,
            'next_level_type': next_level_type,
            'children_attr': children_attr
        }

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
                
            parent = None
            if self.parent_field:
                parent = getattr(serializer.instance, self.parent_field)

            context = self.get_context_for_item(serializer.instance, parent)
            html = render_to_string('main/tree_item.html', context, request=request)
            
            return Response({
                'data': serializer.data,
                'html': html
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
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
        instance.delete()

    def format_validation_errors(self, errors):
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

class MeasurementCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MeasurementCategorySerializer
    queryset = MeasurementCategory.objects.all()
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

class MeasurementTypeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MeasurementTypeSerializer
    queryset = MeasurementType.objects.all()
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['get'])
    def units(self, request, pk=None):
        """Get units for a specific measurement type"""
        measurement_type = self.get_object()
        units = measurement_type.units.all()
        serializer = MeasurementUnitSerializer(units, many=True)
        return Response(serializer.data)

class MeasurementViewSet(TreeItemMixin, viewsets.ModelViewSet):
    serializer_class = MeasurementSerializer
    level_type = 'measurement'
    parent_field = 'location'
    has_children = False
    child_attr = None

    def get_queryset(self):
        queryset = Measurement.objects.select_related('unit__type__category').all()
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

class ModelFieldsViewSet(viewsets.ViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def list(self, request):
        serializer = ModelFieldsSerializer()
        data = serializer.to_representation(None)
        return Response(data)

@login_required(login_url='/')
def dashboard(request):
    projects = Project.objects.prefetch_related(
        'locations',
        'locations__measurements',
        'locations__measurements__unit',
        'locations__measurements__unit__type',
        'locations__measurements__unit__type__category',
        'locations__children'
    ).all()

    categories = MeasurementCategory.objects.prefetch_related(
        'types',
        'types__units'
    ).all()

    serializer = ModelFieldsSerializer(instance=None)
    model_fields = serializer.to_representation(None)
    
    context = {
        'projects': projects,
        'model_fields': model_fields,
        'categories': categories
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
        raw_content = csv_file.read()
        detected_encoding = chardet.detect(raw_content)['encoding']
        file_content = raw_content.decode(detected_encoding)
        csv_reader = csv.reader(StringIO(file_content))
        rows = list(csv_reader)

        headers = rows[0]
        try:
            category_index = headers.index('category')
        except ValueError:
            return JsonResponse({
                'error': 'CSV must contain a category column'
            }, status=400)

        valid_categories = {c.lower(): c for c in MeasurementCategory.objects.values_list('name', flat=True)}

        invalid_categories = []
        for row_num, row in enumerate(rows[1:], start=2):
            if row and len(row) > category_index:
                category = row[category_index].strip().lower()
                if category and category not in valid_categories:
                    invalid_categories.append((row_num, row[category_index]))

        if invalid_categories:
            error_msg = {
                'error': 'Invalid categories found',
                'categories': [
                    f'Invalid category "{t}" in row {r}' 
                    for r, t in invalid_categories
                ]
            }
            return JsonResponse(error_msg, status=400)

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
            'valid_categories': list(valid_categories.values())
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