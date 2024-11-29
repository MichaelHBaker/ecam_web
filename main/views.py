from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.core.exceptions import ValidationError
from .models import Project, Client, Location, Measurement
import chardet
import csv
from io import StringIO
import os
from openpyxl import Workbook

def index(request):
    return render(request, 'main/index.html')

def dashboard(request):
    # Efficiently prefetch all related data for the tree
    clients = Client.objects.prefetch_related(
    'projects',
    'projects__locations',
    'projects__locations__measurements',
    'projects__locations__children'
    ).all()
    

    context = {
        'clients': clients,
    }
    return render(request, 'main/dashboard.html', context)

@require_http_methods(["POST"])
def client_operation(request):
    operation = request.POST.get('operation')
    client_id = request.POST.get('client_id')
    
    if operation == 'add':
        try:
            client = Client.objects.create(
                name=request.POST.get('name'),
                contact_email=request.POST.get('contact_email', ''),
                phone_number=request.POST.get('phone_number', '')
            )
            return JsonResponse({
                'status': 'success',
                'id': client.id,
                'name': client.name,
                'hierarchy': client.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'delete':
        try:
            client = Client.objects.get(id=client_id)
            client.delete()  # Will cascade delete project, location, and measurement
            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'rename':
        try:
            client = Client.objects.get(id=client_id)
            client.name = request.POST.get('name')
            client.save()
            return JsonResponse({
                'status': 'success',
                'hierarchy': client.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})

    return JsonResponse({'status': 'error', 'message': 'Invalid operation'})

@require_http_methods(["POST"])
def project_operation(request):
    operation = request.POST.get('operation')
    project_id = request.POST.get('project_id')
    
    if operation == 'add':
        try:
            client_id = request.POST.get('client_id')
            client = Client.objects.get(id=client_id)
            
            project = Project.objects.create(
                client=client,
                name=request.POST.get('name'),
                project_type=request.POST.get('project_type'),
                start_date=request.POST.get('start_date'),
                end_date=request.POST.get('end_date', None)
            )
            return JsonResponse({
                'status': 'success',
                'id': project.id,
                'name': project.name,
                'type': project.get_project_type_display(),
                'hierarchy': project.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'delete':
        try:
            project = Project.objects.get(id=project_id)
            project.delete()  # Will cascade delete location and measurement
            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'rename':
        try:
            project = Project.objects.get(id=project_id)
            project.name = request.POST.get('name')
            if request.POST.get('project_type'):
                project.project_type = request.POST.get('project_type')
            if request.POST.get('start_date'):
                project.start_date = request.POST.get('start_date')
            if request.POST.get('end_date'):
                project.end_date = request.POST.get('end_date')
            project.save()
            return JsonResponse({
                'status': 'success',
                'hierarchy': project.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})

    return JsonResponse({'status': 'error', 'message': 'Invalid operation'})

@require_http_methods(["POST"])
def location_operation(request):
    operation = request.POST.get('operation')
    location_id = request.POST.get('location_id')
    
    if operation == 'add':
        parent_id = request.POST.get('parent_id')
        project_id = request.POST.get('project_id')
        name = request.POST.get('name')
        
        try:
            project = Project.objects.get(id=project_id)
            parent = Location.objects.get(id=parent_id) if parent_id else None
            
            location = Location.objects.create(
                project=project,
                name=name,
                parent=parent,
                address=""
            )
            return JsonResponse({
                'status': 'success',
                'id': location.id,
                'name': location.name,
                'hierarchy': location.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'delete':
        try:
            location = Location.objects.get(id=location_id)
            location.delete()  # Will cascade delete child location and measurement
            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'rename':
        try:
            location = Location.objects.get(id=location_id)
            location.name = request.POST.get('name')
            if request.POST.get('address'):
                location.address = request.POST.get('address')
            if request.POST.get('latitude'):
                location.latitude = request.POST.get('latitude')
            if request.POST.get('longitude'):
                location.longitude = request.POST.get('longitude')
            location.save()
            return JsonResponse({
                'status': 'success',
                'hierarchy': location.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})

    return JsonResponse({'status': 'error', 'message': 'Invalid operation'})

@require_http_methods(["POST"])
def measurement_operation(request):
    operation = request.POST.get('operation')
    measurement_id = request.POST.get('measurement_id')
    
    if operation == 'add':
        try:
            location_id = request.POST.get('location_id')
            location = Location.objects.get(id=location_id)
            
            measurement = Measurement.objects.create(
                location=location,
                name=request.POST.get('name'),
                description=request.POST.get('description', ''),
                measurement_type=request.POST.get('measurement_type')
            )
            
            return JsonResponse({
                'status': 'success',
                'id': measurement.id,
                'name': measurement.name,
                'type': measurement.get_measurement_type_display(),
                'hierarchy': measurement.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'delete':
        try:
            measurement = Measurement.objects.get(id=measurement_id)
            measurement.delete()
            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
            
    elif operation == 'rename':
        try:
            measurement = Measurement.objects.get(id=measurement_id)
            measurement.name = request.POST.get('name')
            if request.POST.get('description'):
                measurement.description = request.POST.get('description')
            if request.POST.get('measurement_type'):
                measurement.measurement_type = request.POST.get('measurement_type')
            measurement.save()
            return JsonResponse({
                'status': 'success',
                'hierarchy': measurement.get_hierarchy()
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})

    return JsonResponse({'status': 'error', 'message': 'Invalid operation'})

@require_http_methods(["POST"])
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