# tests/utils_data.py
from ..models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataSource, APIDataSource,
    DataSourceMapping, TimeSeriesData
)
from django.contrib.auth.models import User
import datetime
import pytz
import random

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

def create_measurement_categories():
    """Create measurement categories"""
    categories = {}
    
    category_data = [
        ('pressure', 'Pressure', 'Various pressure measurements'),
        ('flow', 'Flow', 'Flow measurements'),
        ('frequency', 'Frequency', 'Frequency measurements'),
        ('count', 'Count', 'Count measurements'),
        ('percent', 'Percentage', 'Percentage measurements'),
        ('temperature', 'Temperature', 'Temperature measurements'),
        ('elevation', 'Elevation', 'Height measurements'),
    ]
    
    for name, display_name, description in category_data:
        category = MeasurementCategory.objects.create(
            name=name,
            display_name=display_name,
            description=description
        )
        categories[name] = category
    
    return categories

def create_measurement_types(categories):
    """Create measurement types"""
    types = {}
    
    type_data = [
        # Pressure types
        ('absolute_pressure', {
            'category': categories['pressure'],
            'name': 'Absolute Pressure',
            'description': 'Pressure relative to a perfect vacuum',
            'supports_multipliers': True
        }),
        ('gauge_pressure', {
            'category': categories['pressure'],
            'name': 'Gauge Pressure',
            'description': 'Pressure relative to atmospheric pressure',
            'supports_multipliers': True
        }),
        ('differential_pressure', {
            'category': categories['pressure'],
            'name': 'Differential Pressure',
            'description': 'Difference between two pressure points',
            'supports_multipliers': True
        }),
        ('atmospheric_pressure', {
            'category': categories['pressure'],
            'name': 'Atmospheric Pressure',
            'description': "Force exerted by Earth's atmosphere",
            'supports_multipliers': True
        }),
        ('vacuum_pressure', {
            'category': categories['pressure'],
            'name': 'Vacuum Pressure',
            'description': 'Pressure below atmospheric pressure',
            'supports_multipliers': True
        }),
        ('sealed_pressure', {
            'category': categories['pressure'],
            'name': 'Sealed Pressure',
            'description': 'Pressure relative to sealed reference',
            'supports_multipliers': True
        }),
        ('hydrostatic_pressure', {
            'category': categories['pressure'],
            'name': 'Hydrostatic Pressure',
            'description': 'Pressure due to weight of a fluid column',
            'supports_multipliers': True
        }),
        
        # Flow types
        ('volumetric_flow', {
            'category': categories['flow'],
            'name': 'Volumetric Flow (Fluid)',
            'description': 'Volume of fluid passing through a point per time',
            'supports_multipliers': True
        }),
        ('mass_flow', {
            'category': categories['flow'],
            'name': 'Mass Flow (Fluid)',
            'description': 'Mass of fluid passing through a point per time',
            'supports_multipliers': True
        }),
        
        # Other types
        ('frequency', {
            'category': categories['frequency'],
            'name': 'Frequency',
            'description': 'Cycles or events per unit time',
            'supports_multipliers': True
        }),
        ('count', {
            'category': categories['count'],
            'name': 'Count',
            'description': 'Total number of items',
            'supports_multipliers': False
        }),
        ('percent', {
            'category': categories['percent'],
            'name': 'Percentage',
            'description': 'Proportion expressed as a fraction of 100',
            'supports_multipliers': False
        }),
        ('temperature', {
            'category': categories['temperature'],
            'name': 'Thermal Measurement',
            'description': 'Measurement of heat intensity',
            'supports_multipliers': False
        }),
        ('elevation', {
            'category': categories['elevation'],
            'name': 'Height',
            'description': 'Height or vertical distance above a reference point',
            'supports_multipliers': True
        })
    ]
    
    for type_id, type_info in type_data:
        measurement_type = MeasurementType.objects.create(**type_info)
        types[type_id] = measurement_type
    
    return types

def create_measurement_units(types):
    """Create measurement units with conversion factors"""
    units = {}
    
    unit_data = [
        # Pressure units
        ('pa', {
            'type': types['absolute_pressure'],
            'name': 'Pascal',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        ('bar', {
            'type': types['absolute_pressure'],
            'name': 'Bar',
            'is_base_unit': False,
            'conversion_factor': 100000.0  # 1 bar = 100,000 Pa
        }),
        ('psi', {
            'type': types['gauge_pressure'],
            'name': 'PSI',
            'is_base_unit': False,
            'conversion_factor': 6894.76  # 1 PSI = 6894.76 Pa
        }),
        ('mmhg', {
            'type': types['absolute_pressure'],
            'name': 'mmHg',
            'is_base_unit': False,
            'conversion_factor': 133.322  # 1 mmHg = 133.322 Pa
        }),
        ('inh2o', {
            'type': types['differential_pressure'],
            'name': 'inH₂O',
            'is_base_unit': False,
            'conversion_factor': 248.84  # 1 inH2O = 248.84 Pa
        }),
        
        # Flow units
        ('m3s', {
            'type': types['volumetric_flow'],
            'name': 'Cubic meters per second',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        ('lpm', {
            'type': types['volumetric_flow'],
            'name': 'Liters per minute',
            'is_base_unit': False,
            'conversion_factor': 1/60000  # L/min to m³/s
        }),
        ('gpm', {
            'type': types['volumetric_flow'],
            'name': 'Gallons per minute',
            'is_base_unit': False,
            'conversion_factor': 0.0000630902  # GPM to m³/s
        }),
        ('cfm', {
            'type': types['volumetric_flow'],
            'name': 'Cubic feet per minute',
            'is_base_unit': False,
            'conversion_factor': 0.000471947  # CFM to m³/s
        }),
        ('kgs', {
            'type': types['mass_flow'],
            'name': 'Kilograms per second',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        
        # Other basic units
        ('hz', {
            'type': types['frequency'],
            'name': 'Hertz',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        ('count', {
            'type': types['count'],
            'name': 'Count',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        ('percent', {
            'type': types['percent'],
            'name': 'Percent',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        ('celsius', {
            'type': types['temperature'],
            'name': 'Celsius',
            'is_base_unit': True,
            'conversion_factor': 1.0
        }),
        ('fahrenheit', {
            'type': types['temperature'],
            'name': 'Fahrenheit',
            'is_base_unit': False,
            'conversion_factor': 1.0  # Special handling required for °F to °C
        }),
        ('meter', {
            'type': types['elevation'],
            'name': 'Meter',
            'is_base_unit': True,
            'conversion_factor': 1.0
        })
    ]
    
    for unit_id, unit_info in unit_data:
        unit = MeasurementUnit.objects.create(**unit_info)
        units[unit_id] = unit
    
    return units

def create_model_table_data():
    """Create test data for all models"""
    # Create test user
    test_user = create_test_user()
    
    # Create measurement-related data
    categories = create_measurement_categories()
    types = create_measurement_types(categories)
    units = create_measurement_units(types)
    
    # Create Projects
    projects = {
        'audit': Project.objects.create(
            name="Energy Trust Production",
            project_type="Audit",
            start_date=datetime.date(2024, 1, 15),
            end_date=datetime.date(2024, 3, 15)
        ),
        'mv': Project.objects.create(
            name="BPA Custom",
            project_type="M&V",
            start_date=datetime.date(2024, 5, 1)
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
    
    # Create example measurements
    measurements = {
        'pressure': Measurement.objects.create(
            name="Building Pressure",
            description="Building pressure relative to atmosphere",
            location=locations['industrial'],
            type=types['differential_pressure'],
            unit=units['inh2o'],
            source_timezone='America/Los_Angeles'
        ),
        'flow': Measurement.objects.create(
            name="Chilled Water Flow",
            description="Chilled water flow rate",
            location=locations['industrial'],
            type=types['volumetric_flow'],
            unit=units['gpm'],
            source_timezone='America/Los_Angeles'
        ),
        'temp': Measurement.objects.create(
            name="Zone Temperature",
            description="Zone temperature sensor",
            location=locations['commercial'],
            type=types['temperature'],
            unit=units['fahrenheit'],
            source_timezone='America/Los_Angeles'
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
    now = datetime.datetime.now(pytz.UTC)
    for i in range(24):  # 24 hours of data
        TimeSeriesData.objects.create(
            timestamp=now - datetime.timedelta(hours=i),
            measurement=measurements['pressure'],
            value=round(random.uniform(-0.1, 0.1), 3)
        )
    
    return "Test data created successfully"