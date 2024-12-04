from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_POST
from django.core.exceptions import ValidationError
from .models import Project, Client, Location, Measurement
from .forms import ClientForm, ProjectForm, LocationForm, MeasurementForm


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


def render_edit_form(request):
    entity_type = request.GET.get('entity_type')
    entity_id = request.GET.get('entity_id')
    form_classes = {
        'client': ClientForm,
        'project': ProjectForm,
        'location': LocationForm,
        'measurement': MeasurementForm
    }
    form_class = form_classes.get(entity_type)
    instance = get_object_or_404(form_class.Meta.model, pk=entity_id) if entity_id else None
    form = form_class(instance=instance)
    
    # Correct handling for the entity_type in the template
    entity_type_clean = instance.__class__.__name__.lower() if instance else entity_type

    return render(request, 'main/location_tree_edit_form.html', {'form': form, 'entity_type': entity_type_clean})



@require_POST
def handle_edit_form_submission(request):
    entity_type = request.POST.get('entity_type')
    entity_id = request.POST.get('entity_id')
    form_class = {
        'client': ClientForm,
        'project': ProjectForm,
        'location': LocationForm,
        'measurement': MeasurementForm
    }.get(entity_type)
    instance = form_class.Meta.model.objects.get(pk=entity_id) if entity_id else None
    form = form_class(request.POST, instance=instance)
    
    if form.is_valid():
        form.save()
        # Redirect back to the dashboard
        return redirect('dashboard')
    else:
        # Handle errors, potentially by re-rendering the form with errors
        return render(request, 'main/location_tree_edit_form.html', {'form': form})

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