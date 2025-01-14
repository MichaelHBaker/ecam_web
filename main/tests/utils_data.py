# tests/utils_data.py
from ..models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataSource, APIDataSource,
    DataSourceMapping, TimeSeriesData
)
from django.contrib.auth.models import User
import datetime
import decimal
import csv
import os
import random

def create_csv_file(file_path, data, delimiter=',', encoding='utf-8'):
    """Create a CSV file with the given data"""
    with open(file_path, 'w', newline='', encoding=encoding) as csvfile:
        writer = csv.writer(csvfile, delimiter=delimiter)
        writer.writerows(data)

def create_test_user():
    """Create a test user for authentication"""
    user, created = User.objects.get_or_create(
        username='testuser',
        email='test@example.com'
    )
    if created:
        user.set_password('testpass123')
        user.save()
    return user

def create_model_table_data():
    """Create test data for all models"""
    
    # Create test user
    test_user = create_test_user()

    # Create Categories
    categories = {
        'pressure': MeasurementCategory.objects.create(
            name='pressure',
            display_name='Pressure',
            description='Various pressure measurements'
        ),
        'flow': MeasurementCategory.objects.create(
            name='flow',
            display_name='Flow',
            description='Fluid flow measurements'
        ),
        'frequency': MeasurementCategory.objects.create(
            name='frequency',
            display_name='Frequency',
            description='Frequency measurements'
        ),
        'count': MeasurementCategory.objects.create(
            name='count',
            display_name='Count',
            description='Count measurements'
        ),
        'percent': MeasurementCategory.objects.create(
            name='percent',
            display_name='Percentage',
            description='Percentage measurements'
        ),
        'temperature': MeasurementCategory.objects.create(
            name='temperature',
            display_name='Temperature',
            description='Temperature measurements'
        ),
        'elevation': MeasurementCategory.objects.create(
            name='elevation',
            display_name='Elevation',
            description='Height measurements'
        )
    }

    # Create Types with base units and conversion factors
    pressure_types = {
        'absolute': MeasurementType.objects.create(
            category=categories['pressure'],
            name='Absolute Pressure',
            symbol='Pa',
            description='Pressure relative to a perfect vacuum',
            is_base_unit=True,
            supports_multipliers=True
        ),
        'gauge': MeasurementType.objects.create(
            category=categories['pressure'],
            name='Gauge Pressure',
            symbol='Pa',
            description='Pressure relative to atmospheric pressure',
            supports_multipliers=True
        ),
        'differential': MeasurementType.objects.create(
            category=categories['pressure'],
            name='Differential Pressure',
            symbol='Pa',
            description='Difference between two pressure points',
            supports_multipliers=True
        )
    }

    flow_types = {
        'volumetric': MeasurementType.objects.create(
            category=categories['flow'],
            name='Volumetric Flow',
            symbol='m³/s',
            description='Volume of fluid passing through a point per time',
            is_base_unit=True,
            supports_multipliers=True
        ),
        'mass': MeasurementType.objects.create(
            category=categories['flow'],
            name='Mass Flow',
            symbol='kg/s',
            description='Mass of fluid passing through a point per time',
            supports_multipliers=True
        )
    }

    other_types = {
        'frequency': MeasurementType.objects.create(
            category=categories['frequency'],
            name='Frequency',
            symbol='Hz',
            description='Cycles or events per unit time',
            is_base_unit=True,
            supports_multipliers=True
        ),
        'count': MeasurementType.objects.create(
            category=categories['count'],
            name='Count',
            symbol='count',
            description='Total number of items',
            is_base_unit=True,
            supports_multipliers=False
        ),
        'percent': MeasurementType.objects.create(
            category=categories['percent'],
            name='Percentage',
            symbol='%',
            description='Proportion expressed as a fraction of 100',
            is_base_unit=True,
            supports_multipliers=False
        ),
        'celsius': MeasurementType.objects.create(
            category=categories['temperature'],
            name='Celsius',
            symbol='°C',
            description='Temperature measurement',
            is_base_unit=True,
            supports_multipliers=False
        ),
        'elevation': MeasurementType.objects.create(
            category=categories['elevation'],
            name='Height',
            symbol='m',
            description='Height or vertical distance',
            is_base_unit=True,
            supports_multipliers=True
        )
    }

    # Create Units with conversions
    # Pressure Units
    pressure_units = {
        'pa': MeasurementUnit.objects.create(type=pressure_types['absolute'], multiplier=''),
        'kpa': MeasurementUnit.objects.create(type=pressure_types['absolute'], multiplier='k'),
        'mpa': MeasurementUnit.objects.create(type=pressure_types['absolute'], multiplier='M'),
        'psi': MeasurementUnit.objects.create(
            type=pressure_types['gauge'],
            multiplier='',
            conversion_factor=6894.76  # 1 PSI = 6894.76 Pa
        ),
        'inh2o': MeasurementUnit.objects.create(
            type=pressure_types['differential'],
            multiplier='',
            conversion_factor=248.84  # 1 inH2O = 248.84 Pa
        )
    }

    # Flow Units
    flow_units = {
        'm3s': MeasurementUnit.objects.create(type=flow_types['volumetric'], multiplier=''),
        'lpm': MeasurementUnit.objects.create(
            type=flow_types['volumetric'],
            multiplier='',
            conversion_factor=1/60000  # L/min to m³/s
        ),
        'gpm': MeasurementUnit.objects.create(
            type=flow_types['volumetric'],
            multiplier='',
            conversion_factor=0.0000630902  # GPM to m³/s
        ),
        'kgs': MeasurementUnit.objects.create(type=flow_types['mass'], multiplier='')
    }

    # Basic units for other types
    basic_units = {
        'hz': MeasurementUnit.objects.create(type=other_types['frequency'], multiplier=''),
        'khz': MeasurementUnit.objects.create(type=other_types['frequency'], multiplier='k'),
        'count': MeasurementUnit.objects.create(type=other_types['count']),
        'percent': MeasurementUnit.objects.create(type=other_types['percent']),
        'celsius': MeasurementUnit.objects.create(type=other_types['celsius']),
        'fahrenheit': MeasurementUnit.objects.create(
            type=other_types['celsius'],
            conversion_factor=1,  # Will need special handling for °F to °C
        ),
        'meter': MeasurementUnit.objects.create(type=other_types['elevation'], multiplier=''),
        'mm': MeasurementUnit.objects.create(type=other_types['elevation'], multiplier='m'),
    }

    # Create Projects
    projects = {
        'audit': Project.objects.create(
            name="Energy Trust Production",
            project_type="Audit",
            start_date="2024-01-15",
            end_date="2024-03-15",
        ),
        'mv': Project.objects.create(
            name="BPA Custom",
            project_type="M&V",
            start_date="2024-05-01",
        )
    }

    # Create Locations
    locations = {
        'industrial': Location.objects.create(
            project=projects['audit'],
            name="Industrial Facility",
            address="123 Factory Lane",
            latitude=45.5155,
            longitude=-122.6789
        ),
        'commercial': Location.objects.create(
            project=projects['mv'],
            name="Office Complex",
            address="456 Business Park",
            latitude=45.5231,
            longitude=-122.6765
        )
    }

    # Create Measurements
    measurements = {
        'pressure': Measurement.objects.create(
            name="Building Pressure",
            description="Building pressure relative to atmosphere",
            unit=pressure_units['inh2o'],
            location=locations['industrial']
        ),
        'flow': Measurement.objects.create(
            name="Chilled Water Flow",
            description="Chilled water flow rate",
            unit=flow_units['gpm'],
            location=locations['industrial']
        ),
        'temp': Measurement.objects.create(
            name="Zone Temperature",
            description="Zone temperature sensor",
            unit=basic_units['fahrenheit'],
            location=locations['commercial']
        )
    }

    # Create Data Sources
    sources = {
        'niagara': APIDataSource.objects.create(
            name="Test Niagara",
            source_type='api',
            middleware_type='niagara',
            url_base='https://test.niagara.com',
            auth_type='basic',
            is_active=True
        ),
        'file': DataSource.objects.create(
            name="CSV Import",
            source_type='file',
            is_active=True
        )
    }

    # Create Data Source Mappings
    DataSourceMapping.objects.create(
        measurement=measurements['pressure'],
        data_source=sources['niagara'],
        source_identifiers={
            'station_name': 'Station1',
            'point_path': '/Building/Pressure'
        }
    )

    # Create Time Series Data
    now = datetime.datetime.now(datetime.timezone.utc)
    for i in range(24):  # 24 hours of data
        TimeSeriesData.objects.create(
            timestamp=now - datetime.timedelta(hours=i),
            measurement=measurements['pressure'],
            value=round(random.uniform(-0.1, 0.1), 3)
        )

    return "Test data created successfully"

def create_timeseries_csv(measurement_id, start_date, end_date, file_path):
    """Create a CSV file with time series data for testing imports"""
    headers = ['timestamp', 'value']
    data = [headers]
    
    current = start_date
    while current <= end_date:
        value = round(random.uniform(0, 100), 2)
        data.append([current.isoformat(), value])
        current += datetime.timedelta(hours=1)

    create_csv_file(file_path, data)