# tests/utils_data.py
from ..models import Project, Location, Measurement, MeasurementType
import datetime
import decimal
import csv
import os
import random

# CSV creation functions remain unchanged
def create_csv_file(file_path, data, delimiter=',', encoding='utf-8'):
    with open(file_path, 'w', newline='', encoding=encoding) as csvfile:
        writer = csv.writer(csvfile, delimiter=delimiter)
        writer.writerows(data)

def create_model_table_data():
    """Create test data for models"""
    # Create or get MeasurementTypes
    power_type, _ = MeasurementType.objects.get_or_create(
        name='power',
        defaults={
            'display_name': 'Power (kW)',
            'unit': 'kW',
            'description': 'Power consumption measurement'
        }
    )
    
    temp_type, _ = MeasurementType.objects.get_or_create(
        name='temperature',
        defaults={
            'display_name': 'Temperature (°F)',
            'unit': '°F',
            'description': 'Temperature measurement'
        }
    )
    
    pressure_type, _ = MeasurementType.objects.get_or_create(
        name='pressure',
        defaults={
            'display_name': 'Pressure (PSI)',
            'unit': 'PSI',
            'description': 'Pressure measurement'
        }
    )

    # Create Projects
    project1 = Project.objects.create(
        name="Energy Trust Production",
        project_type="Audit",
        start_date="2024-01-15",
        end_date="2024-03-15",
    )
    project2 = Project.objects.create(
        name="BPA Custom",
        project_type="M&V",
        start_date="2024-05-01",
    )

    # Create Location hierarchy for first project
    ind = Location.objects.create(
        project=project1,
        name="Acme Products",
        address="123 Main St, Anytown USA",
        latitude=34.0522,
        longitude=-118.2437,
    )
    com = Location.objects.create(
        project=project2,
        name="Fish Storage Warehouse",
        address="456 Elm St, Anytown USA",
        latitude=34.0422,
        longitude=-118.2537,
    )
    
    # Create Location for second project
    Location.objects.create(
        project=project2,
        name="Office Park II",
        address="789 Oak St, Othertown USA",
        latitude=40.7128,
        longitude=-74.0060,
    )

    # Create measurements for locations
    Measurement.objects.create(
        name="Main Power Meter",
        description="Primary building power meter",
        measurement_type=power_type,
        location=com
    )
    
    Measurement.objects.create(
        name="HVAC Temperature",
        description="Main HVAC system temperature",
        measurement_type=temp_type,
        location=com
    )
    
    Measurement.objects.create(
        name="Process Line Pressure",
        description="Manufacturing line pressure sensor",
        measurement_type=pressure_type,
        location=ind
    )