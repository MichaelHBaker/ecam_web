# tests/utils_data.py
from ..models import (
   Project, Location, Measurement, MeasurementCategory,
   MeasurementType, MeasurementUnit, DataSource, Dataset,
   DataSourceLocation, SourceColumn, ColumnMapping,
   TimeSeriesData
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
       username='mbaker',
       email='mbaker@sbwconsulting.com'
   )
   if created:
       user.set_password('RangeBreak99.')
       user.save()
   return user

def create_model_table_data():
   """Create test data for all models"""
   
   # Create test user
   test_user = create_test_user()

   # Create Categories with get_or_create
   categories_data = {
       'pressure': {
           'display_name': 'Pressure',
           'description': 'Various pressure measurements'
       },
       'flow': {
           'display_name': 'Flow',
           'description': 'Fluid flow measurements'
       },
       'frequency': {
           'display_name': 'Frequency',
           'description': 'Frequency measurements'
       },
       'count': {
           'display_name': 'Count',
           'description': 'Count measurements'
       },
       'percent': {
           'display_name': 'Percentage',
           'description': 'Percentage measurements'
       },
       'temperature': {
           'display_name': 'Temperature',
           'description': 'Temperature measurements'
       },
       'elevation': {
           'display_name': 'Elevation',
           'description': 'Height measurements'
       }
   }

   categories = {}
   for name, details in categories_data.items():
       categories[name], _ = MeasurementCategory.objects.update_or_create(
           name=name,
           defaults={
               'display_name': details['display_name'],
               'description': details.get('description', '')
           }
       )

   # Create Types with get_or_create
   types_data = {
       'pressure_types': {
           'absolute': {
               'category': categories['pressure'],
               'description': 'Pressure relative to a perfect vacuum',
               'supports_multipliers': True
           },
           'gauge': {
               'category': categories['pressure'],
               'description': 'Pressure relative to atmospheric pressure',
               'supports_multipliers': True
           },
           'differential': {
               'category': categories['pressure'],
               'description': 'Difference between two pressure points',
               'supports_multipliers': True
           }
       },
       'flow_types': {
           'volumetric': {
               'category': categories['flow'],
               'description': 'Volume of fluid passing through a point per time',
               'supports_multipliers': True
           },
           'mass': {
               'category': categories['flow'],
               'description': 'Mass of fluid passing through a point per time',
               'supports_multipliers': True
           }
       },
       'other_types': {
           'frequency': {
               'category': categories['frequency'],
               'description': 'Cycles or events per unit time',
               'supports_multipliers': True
           },
           'count': {
               'category': categories['count'],
               'description': 'Total number of items',
               'supports_multipliers': False
           },
           'percent': {
               'category': categories['percent'],
               'description': 'Proportion expressed as a fraction of 100',
               'supports_multipliers': False
           },
           'celsius': {
               'category': categories['temperature'],
               'description': 'Temperature measurement',
               'supports_multipliers': False
           },
           'elevation': {
               'category': categories['elevation'],
               'description': 'Height or vertical distance',
               'supports_multipliers': True
           }
       }
   }

   # Combine all type dictionaries
   all_type_data = {}
   all_type_data.update(types_data['pressure_types'])
   all_type_data.update(types_data['flow_types'])
   all_type_data.update(types_data['other_types'])

   types = {}
   for name, details in all_type_data.items():
       # Adjust name for lookup
       lookup_names = {
           'absolute': 'Absolute Pressure',
           'gauge': 'Gauge Pressure',
           'differential': 'Differential Pressure',
           'volumetric': 'Volumetric Flow',
           'mass': 'Mass Flow',
           'frequency': 'Frequency',
           'count': 'Count',
           'percent': 'Percentage',
           'celsius': 'Celsius',
           'elevation': 'Height'
       }
       lookup_name = lookup_names.get(name, name.capitalize())

       types[name], _ = MeasurementType.objects.update_or_create(
           category=details['category'],
           name=lookup_name,
           defaults={
               'description': details['description'],
               'supports_multipliers': details['supports_multipliers']
           }
       )

   # Create Units with get_or_create
   units_data = {
       'pressure_units': {
           'Pa Base': {
               'type': types['absolute'], 
               'description': 'Pascal base unit',
               'conversion_factor': 1.0,
               'is_base_unit': True
           },
           'PSI': {
               'type': types['gauge'], 
               'description': 'Pounds per square inch',
               'conversion_factor': 6894.76,
               'is_base_unit': False
           },
           'inH2O': {
               'type': types['differential'], 
               'description': 'Inches of water',
               'conversion_factor': 248.84,
               'is_base_unit': False
           }
       },
       'flow_units': {
           'm³/s Base': {
               'type': types['volumetric'], 
               'description': 'Cubic meters per second base unit',
               'conversion_factor': 1.0,
               'is_base_unit': True
           },
           'L/min': {
               'type': types['volumetric'], 
               'description': 'Liters per minute',
               'conversion_factor': 1/60000,
               'is_base_unit': False
           },
           'GPM': {
               'type': types['volumetric'], 
               'description': 'Gallons per minute',
               'conversion_factor': 0.0000630902,
               'is_base_unit': False
           }
       },
       'basic_units': {
           'Hz': {
               'type': types['frequency'], 
               'description': 'Hertz base unit',
               'conversion_factor': 1.0,
               'is_base_unit': True
           },
           'Count': {
               'type': types['count'], 
               'description': 'Base count unit',
               'conversion_factor': 1.0,
               'is_base_unit': True
           },
           '°C': {
               'type': types['celsius'], 
               'description': 'Celsius base temperature unit',
               'conversion_factor': 1.0,
               'is_base_unit': True
           }
       }
   }

   # Combine all unit dictionaries
   all_unit_data = {}
   all_unit_data.update(units_data['pressure_units'])
   all_unit_data.update(units_data['flow_units'])
   all_unit_data.update(units_data['basic_units'])

   units = {}
   for name, details in all_unit_data.items():
       units[name], _ = MeasurementUnit.objects.update_or_create(
           type=details['type'],
           name=name,
           defaults={
               'description': details['description'],
               'conversion_factor': details['conversion_factor'],
               'is_base_unit': details['is_base_unit']
           }
       )

   # Create Projects with get_or_create
   projects_data = {
       'audit': {
           'name': "Energy Trust Production",
           'project_type': "Audit",
           'start_date': "2024-01-15",
           'end_date': "2024-03-15",
       },
       'mv': {
           'name': "BPA Custom",
           'project_type': "M&V",
           'start_date': "2024-05-01",
       }
   }

   projects = {}
   for key, details in projects_data.items():
        projects[key], _ = Project.objects.get_or_create(
            name=details['name'],
            project_type=details['project_type'],
            defaults={
                'start_date': details.get('start_date'),
                'end_date': details.get('end_date'),
                'owner': test_user  # ✅ Ensure the project has an owner
            }
        )

   # Create Locations with get_or_create
   locations_data = {
       'industrial': {
           'project': projects['audit'],
           'name': "Industrial Facility",
           'address': "123 Factory Lane",
           'latitude': 45.5155,
           'longitude': -122.6789
       },
       'commercial': {
           'project': projects['mv'],
           'name': "Office Complex",
           'address': "456 Business Park",
           'latitude': 45.5231,
           'longitude': -122.6765
       }
   }

   locations = {}
   for key, details in locations_data.items():
       locations[key], _ = Location.objects.get_or_create(
           name=details['name'],
           project=details['project'],
           defaults={
               'address': details['address'],
               'latitude': details['latitude'],
               'longitude': details['longitude']
           }
       )

   # Create Measurements with get_or_create
   measurements_data = {
       'pressure': {
           'name': "Building Pressure",
           'description': "Building pressure relative to atmosphere",
           'location': locations['industrial'],
           'type': types['differential'],
           'unit': units['inH2O'],
           'multiplier': None
       },
       'flow': {
           'name': "Chilled Water Flow",
           'description': "Chilled water flow rate",
           'location': locations['industrial'],
           'type': types['volumetric'],
           'unit': units['GPM'],
           'multiplier': None
       },
       'temp': {
           'name': "Zone Temperature",
           'description': "Zone temperature sensor",
           'location': locations['commercial'],
           'type': types['celsius'],
           'unit': units['°C'],
           'multiplier': None
       }
   }

   measurements = {}
   for key, details in measurements_data.items():
       measurements[key], _ = Measurement.objects.get_or_create(
           name=details['name'],
           location=details['location'],
           type=details['type'],
           unit=details['unit'],
           defaults={
               'description': details['description'],
               'multiplier': details['multiplier']
           }
       )

   # Create Data Sources
   sources_data = {
       'niagara': {
           'name': "Test Niagara",
           'source_type': 'api',
           'middleware_type': 'niagara',
           'url_base': 'https://test.niagara.com',
           'auth_type': 'basic',
           'is_active': True,
           'project_key': 'audit' 
       },
       'file': {
           'name': "CSV Import",
           'source_type': 'file',
           'is_active': True,
           'project_key': 'audit'
       }
   }

   sources = {}
   for key, details in sources_data.items():
        project = projects[details['project_key']]
        sources[key], _ = DataSource.objects.get_or_create(
            name=details['name'],
            source_type=details['source_type'],
            project=project,  # Add this line
            defaults={
                'middleware_type': details.get('middleware_type', ''),
                'url_base': details.get('url_base', ''),
                'auth_type': details.get('auth_type', ''),
                'is_active': details.get('is_active', True),
                'created_by': test_user
            }
        )

   # Create DataSourceLocation links
   for location in locations.values():
       DataSourceLocation.objects.get_or_create(
           data_source=sources['niagara'],
           location=location
       )

   # Create Dataset and mappings
   dataset, _ = Dataset.objects.get_or_create(
       data_source=sources['niagara'],
       name="Building Pressure Data",
   )

   source_column, _ = SourceColumn.objects.get_or_create(
       dataset=dataset,
       name='Building Pressure',
       position=0,
       data_type='float'
   )

   ColumnMapping.objects.get_or_create(
       source_column=source_column,
       measurement=measurements['pressure'],
       defaults={
           'transform_config': {'point_path': '/Building/Pressure'},
           'validation_rules': {}
       }
   )

   # Create or update time series data
   now = datetime.datetime.now(datetime.timezone.utc)
   for i in range(24):  # 24 hours of data
        TimeSeriesData.objects.get_or_create(
            timestamp=now - datetime.timedelta(hours=i),
            measurement=measurements['pressure'],
            dataset=dataset,  # ✅ Ensure dataset_id is assigned
            defaults={
                'value': round(random.uniform(-0.1, 0.1), 3)
            }
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