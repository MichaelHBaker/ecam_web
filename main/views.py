from django.shortcuts import render
from django.http import JsonResponse, HttpResponseNotFound
from django.views.decorators.http import require_http_methods
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

import json
from .forms import CSVUploadForm
import chardet
import csv
from io import StringIO
import os
from openpyxl import Workbook


def index(request):
    return render(request, 'main/index.html')

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
    


def dashboard(request):
    # Get regions to close from query params (can be multiple, comma-separated)
    closed_regions = request.GET.get('close', '').split(',')
    
    regions = [
        {
            'id': 'locations', 
            'title': 'Locations', 
            'icon': 'bi bi-geo-alt',
            'content_url': 'locations_content',
        },
        {
            'id': 'measurements', 
            'title': 'Measurements', 
            'icon': 'bi bi-speedometer2',
            'content_url': 'measurements_content',
        },
        {
            'id': 'data', 
            'title': 'Data', 
            'icon': 'bi bi-pie-chart-fill',
            'content_url': 'data_content',
        },
        {
            'id': 'dictionary', 
            'title': 'Dictionary', 
            'icon': 'bi bi-book-half',
            'content_url': 'dictionary_content',
        }
    ]
    
    # Set initial collapse state
    for region in regions:
        region['is_closed'] = region['id'] in closed_regions
        
    return render(request, 'main/dashboard.html', {
        'regions': regions,
        'initial_state': json.dumps({r['id']: not r['is_closed'] for r in regions})
    })

def full_region_view(request, region_id):
    # Map region_id to title and content template
    region_map = {
        'locations': {
            'title': 'Locations',
            'template': 'main/regions/locations.html'
        },
        'measurements': {
            'title': 'Measurements',
            'template': 'main/regions/measurements.html'
        },
        'data': {
            'title': 'Data',
            'template': 'main/regions/data.html'
        },
        'dictionary': {
            'title': 'Dictionary',
            'template': 'main/regions/dictionary.html'
        }
    }
    
    region_info = region_map.get(region_id)
    if not region_info:
        return HttpResponseNotFound('Region not found')
        
    context = {
        'region_id': region_id,
        'title': region_info['title'],
        # Add any additional context needed for the specific region
    }
    return render(request, region_info['template'], context)

# New view for loading region content dynamically
def region_content(request, region_id):
    template_map = {
        'locations': 'main/regions/locations_content.html',
        'measurements': 'main/regions/measurements_content.html',
        'data': 'main/regions/data_content.html',
        'dictionary': 'main/regions/dictionary_content.html'
    }
    
    template_name = template_map.get(region_id)
    if not template_name:
        return HttpResponseNotFound('Region not found')
    
    context = {
        'region_id': region_id,
    }
    
    # Add region-specific context
    if region_id == 'locations':
        # You can replace this with actual database queries later
        context['locations'] = []  # Empty list for now
        context['site_count'] = 0
        context['station_count'] = 0
        context['facility_count'] = 0
    
    return render(request, template_name, context)

# New view to handle state changes via AJAX
@require_http_methods(["POST"])  # Changed from require_POST to require_http_methods
def update_region_state(request):
    try:
        data = json.loads(request.body)
        region_id = data.get('region_id')
        mode = data.get('mode')
        
        # Here you could save the state to the session or database if needed
        request.session[f'region_{region_id}_mode'] = mode
        
        return JsonResponse({'status': 'success'})
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)