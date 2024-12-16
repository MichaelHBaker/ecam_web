from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_POST
from django.views.decorators.csrf import csrf_exempt
from django.core.exceptions import ValidationError
from .models import Project, Client, Location, Measurement
from .forms import ClientForm, ProjectForm, LocationForm, MeasurementForm, ClientNameForm



import chardet
import csv
from io import StringIO
import os
from openpyxl import Workbook

def index(request):
    return render(request, 'main/index.html')


def dashboard(request):
    clients = Client.objects.all()
    edit_client_id = request.GET.get('edit')  # ID of the client to edit, if provided

    try:
        edit_client_id = int(edit_client_id) if edit_client_id else None
    except ValueError:
        edit_client_id = None

    if request.method == 'POST':
        client_id = int(request.POST.get('client_id'))
        client = Client.objects.get(pk=client_id)
        form = ClientNameForm(request.POST, instance=client)
        if form.is_valid():
            form.save()
            return redirect('dashboard')

    return render(request, 'main/dashboard.html', {
        'clients': clients,
        'edit_client_id': edit_client_id,
    })


@require_http_methods(["POST"])  # Ensure that only POST requests are handled
@csrf_exempt  # Exempting CSRF for demonstration purposes; consider CSRF protection for production
def update_client(request):
    # Extract the client ID and new name from the POST request
    client_id = request.POST.get('client_id')
    new_name = request.POST.get('name')

    # Try to find the client by ID and update the name
    try:
        client = Client.objects.get(id=client_id)
        client.name = new_name
        client.save()

        # Return the new name in a JsonResponse
        return JsonResponse({'updatedName': new_name})

    except Client.DoesNotExist:
        # If no client is found, return an error message
        return JsonResponse({'error': 'Client not found'}, status=404)


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