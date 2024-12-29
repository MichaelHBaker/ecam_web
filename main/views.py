from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_POST
from django.contrib.auth import authenticate, login
from django.template import Template as DjangoTemplate
from django.template import Context as DjangoContext
from django.middleware.csrf import get_token

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status 
from rest_framework.authentication import SessionAuthentication, BasicAuthentication
from rest_framework.permissions import IsAuthenticated  # or AllowAny if you want to allow anonymous access
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from .models import Client, Project, Location, Measurement
from .serializers import ClientSerializer, ProjectSerializer, LocationSerializer, MeasurementSerializer, ModelFieldsSerializer
from .utils import get_field_metadata


import chardet
import csv
from io import StringIO
import os
from openpyxl import Workbook


def index(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('dashboard')
        else:
            # Add error message if login fails
            return render(request, 'main/index.html', {'error': 'Invalid credentials'})
    return render(request, 'main/index.html')


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        # Handle cascading delete of children
        projects = instance.projects.all()
        for project in projects:
            project.delete()  # This will trigger cascading delete
        instance.delete()

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Project.objects.all()
        client_id = self.request.query_params.get('client', None)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        return queryset

    def perform_destroy(self, instance):
        # Handle cascading delete of children
        locations = instance.locations.all()
        for location in locations:
            location.delete()  # This will trigger cascading delete
        instance.delete()

class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Location.objects.all()
        project_id = self.request.query_params.get('project', None)
        parent_id = self.request.query_params.get('parent', None)
        
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        return queryset
    
    def perform_destroy(self, instance):
        # Handle cascading delete of children
        measurements = instance.measurements.all()
        for measurement in measurements:
            measurement.delete()
        # Handle child locations
        child_locations = instance.children.all()
        for location in child_locations:
            location.delete()
        instance.delete()

    @action(detail=False, methods=['get'])
    def root_locations(self, request):
        """Get only root locations (those without parents)"""
        locations = Location.objects.filter(parent=None)
        serializer = self.get_serializer(locations, many=True)
        return Response(serializer.data)

class MeasurementViewSet(viewsets.ModelViewSet):
    queryset = Measurement.objects.all()
    serializer_class = MeasurementSerializer
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Measurement.objects.all()
        location_id = self.request.query_params.get('location', None)
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

class TemplateViewSet(viewsets.ViewSet):
    @action(detail=False, methods=['post'])
    def render(self, request):
        try:
            # Get template string and context from request
            template_string = request.data.get('template', '')
            context_data = request.data.get('context', {})
            
            # Add CSRF token to context
            context_data['csrf_token'] = get_token(request)
            
            # Check if model_fields are present in the context data
            if 'model_fields' not in context_data:
                raise ValidationError("Missing required 'model_fields' in context data")


            # Register template tags for template rendering
            from django.template import engines
            django_engine = engines['django']
            template = django_engine.from_string(template_string)
            
            # Create context ensuring template tags are available
            from django.template import Context
            context = Context(context_data)
            
            # Render the template
            rendered_html = template.render(context)
            
            return Response({
                'html': rendered_html,
                'ok': True
            })
            
        except Exception as e:
            return Response(
                {
                    'error': str(e),
                    'ok': False
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ModelFieldsViewSet(viewsets.ViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def list(self, request):
        serializer = ModelFieldsSerializer(instance=None)
        return Response(serializer.to_representation(None))
    
def dashboard(request):
    # Prefetch related data to optimize database queries
    clients = Client.objects.prefetch_related(
        'projects',
        'projects__locations',
        'projects__locations__measurements',
        'projects__locations__children'
    ).all()

    # Use serializer but get data directly
    serializer = ModelFieldsSerializer(instance=None)
    model_fields = serializer.to_representation(None)  # Call to_representation directly
    
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

def location(request):
    return render(request, 'main/location.html')

def measurement(request):
    return render(request, 'main/measurement.html')

def data(request):
    return render(request, 'main/data.html')

def dictionary(request):
    return render(request, 'main/dictionary.html')




class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer

    def get_queryset(self):
        queryset = Project.objects.all()
        client_id = self.request.query_params.get('client', None)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        return queryset

class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer

    def get_queryset(self):
        queryset = Location.objects.all()
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset
    
    @action(detail=False, methods=['get'])
    def root_locations(self, request):
        """Get only root locations (those without parents)"""
        locations = Location.objects.filter(parent=None)
        serializer = self.get_serializer(locations, many=True)
        return Response(serializer.data)

class MeasurementViewSet(viewsets.ModelViewSet):
    queryset = Measurement.objects.all()
    serializer_class = MeasurementSerializer

    def get_queryset(self):
        queryset = Measurement.objects.all()
        location_id = self.request.query_params.get('location', None)
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset