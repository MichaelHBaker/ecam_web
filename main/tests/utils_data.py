from ..models import Client, Project, Location, Measurement
import datetime
import decimal
import csv
import os
import random



def create_csv_file(file_path, data, delimiter=',', encoding='utf-8'):
    """
    Create a CSV file with the given data at the specified file path.
    
    :param file_path: Full path where the file should be created
    :param data: List of lists, where each inner list represents a row
    :param delimiter: CSV delimiter (default is comma)
    :param encoding: File encoding (default is UTF-8)
    """
    with open(file_path, 'w', newline='', encoding=encoding) as csvfile:
        writer = csv.writer(csvfile, delimiter=delimiter)
        writer.writerows(data)

def create_valid_csv(file_path):
    data = [
        ['Name', 'Age', 'City'],
        ['Alice', '29', 'New York'],
        ['Bob', '25', 'Los Angeles'],
        ['Charlie', '35', 'Chicago']
    ]
    create_csv_file(file_path, data)

def create_empty_csv(file_path):
    create_csv_file(file_path, [])

def create_header_only_csv(file_path):
    data = [['Name', 'Age', 'City']]
    create_csv_file(file_path, data)

def create_missing_values_csv(file_path):
    data = [
        ['Name', 'Age', 'City'],
        ['Alice', '29', ''],
        ['Bob', '', 'Los Angeles'],
        ['', '35', 'Chicago']
    ]
    create_csv_file(file_path, data)

def create_inconsistent_columns_csv(file_path):
    data = [
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'New York', 'Extra'],
        ['Bob', '25'],
        ['Charlie', '35', 'Chicago']
    ]
    create_csv_file(file_path, data)

def create_non_utf8_csv(file_path):
    data = [
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'New York'],
        ['Bob', '25', 'Los Angeles'],
        ['Charlie', '35', 'München']
    ]
    create_csv_file(file_path, data, encoding='iso-8859-1')

def create_large_csv(file_path, num_rows=10000):
    data = [['ID', 'RandomNumber']]
    for i in range(num_rows):
        data.append([str(i), str(random.randint(1, 1000))])
    create_csv_file(file_path, data)

def create_duplicate_headers_csv(file_path):
    data = [
        ['Name', 'Age', 'City', 'Age'],
        ['Alice', '30', 'New York', '31'],
        ['Bob', '25', 'Los Angeles', '26']
    ]
    create_csv_file(file_path, data)

def create_quoted_fields_csv(file_path):
    data = [
        ['Name', 'Description'],
        ['Product A', '"A "special" product"'],
        ['Product B', 'Normal description'],
        ['Product C', '"Contains, a comma"']
    ]
    create_csv_file(file_path, data)

def create_mixed_data_types_csv(file_path):
    data = [
        ['Name', 'Age', 'Height', 'Is Student'],
        ['Alice', '30', '1.65', 'False'],
        ['Bob', 'Twenty Five', '180cm', 'Yes'],
        ['Charlie', '35', '5.9', 'TRUE']
    ]
    create_csv_file(file_path, data)

def create_model_table_data(): 
    client1 = Client.objects.create(
        name="Acme Corp", contact_email="contact@acmecorp.com"
    )
    client2 = Client.objects.create(
        name="Globex Inc", contact_email="info@globexinc.com", phone_number="555-123-4567"
    )
    # Create Projects
    project1 = Project.objects.create(
        name="Acme Audit",
        client=client1,
        project_type="Audit",
        start_date="2024-01-15",
        end_date="2024-03-15",
    )
    project2 = Project.objects.create(
        name="Globex M&V",
        client=client2,
        project_type="M&V",
        start_date="2024-05-01",
    )

    # Create Location
    location1 = Location.objects.create(
        project=project1,
        name="Acme Headquarters",
        address="123 Main St, Anytown USA",
        latitude=34.0522,
        longitude=-118.2437,
    )
    location2 = Location.objects.create(
        project=project1,
        name="Acme Factory",
        address="456 Elm St, Anytown USA",
        parent=location1,  # Factory is a child of Headquarters
        latitude=34.0422,
        longitude=-118.2537,
    )
    Location.objects.create(
        project=project2,
        name="Globex Office",
        address="789 Oak St, Othertown USA",
        latitude=40.7128,
        longitude=-74.0060,
    )
   # create measurement for location
    Measurement.objects.create(
        name="Main Power Meter",
        description="Primary building power meter",
        measurement_type="power",
        location=location1  # Acme Headquarters
    )
    
    Measurement.objects.create(
        name="HVAC Temperature",
        description="Main HVAC system temperature",
        measurement_type="temperature",
        location=location1
    )
    
    Measurement.objects.create(
        name="Process Line Pressure",
        description="Manufacturing line pressure sensor",
        measurement_type="pressure",
        location=location2  # Acme Factory
    )