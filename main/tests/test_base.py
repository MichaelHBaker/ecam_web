# tests/test_base.py
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient
from ..models import (
   Project, Location, Measurement, MeasurementCategory,
   MeasurementType, MeasurementUnit, DataSource, Dataset,
   DataSourceLocation, SourceColumn, ColumnMapping,
   TimeSeriesData
)
from .utils_data import create_model_table_data

class BaseTestCase(TestCase):
   @classmethod
   def setUpTestData(cls):
       """Set up data for all test methods"""
       # Create test user
       User = get_user_model()
       cls.test_user = User.objects.create_user(
           username='testuser',
           email='testuser@example.com',
           password='testpass123',
           first_name='Test',
           last_name='User'
       )

       # Get content types
       project_ct = ContentType.objects.get_for_model(Project)
       location_ct = ContentType.objects.get_for_model(Location)
       measurement_ct = ContentType.objects.get_for_model(Measurement)
       category_ct = ContentType.objects.get_for_model(MeasurementCategory)
       type_ct = ContentType.objects.get_for_model(MeasurementType)
       unit_ct = ContentType.objects.get_for_model(MeasurementUnit)
       datasource_ct = ContentType.objects.get_for_model(DataSource)
       dataset_ct = ContentType.objects.get_for_model(Dataset)
       column_ct = ContentType.objects.get_for_model(SourceColumn)
       mapping_ct = ContentType.objects.get_for_model(ColumnMapping)

       # Get all model permissions
       model_permissions = Permission.objects.filter(
           content_type__in=[
               project_ct, 
               location_ct, 
               measurement_ct,
               category_ct,
               type_ct,
               unit_ct,
               datasource_ct,
               dataset_ct,
               column_ct,
               mapping_ct
           ]
       )

       # Assign permissions to test user
       cls.test_user.user_permissions.add(*model_permissions)
       
       # Create initial test data
       create_model_table_data()
       
       # Get reference to test project
       cls.test_project = Project.objects.get(name="Energy Trust Production")
       
       # Get reference to test location
       cls.test_location = Location.objects.get(name="Industrial Facility")
       
       # Get reference to test measurement
       cls.test_measurement = Measurement.objects.get(name="Building Pressure")

       # Get references to categories, types and units
       cls.pressure_category = MeasurementCategory.objects.get(name='pressure')
       cls.pressure_type = MeasurementType.objects.get(name='Differential Pressure')
       cls.pressure_unit = MeasurementUnit.objects.get(
           type__name='Differential Pressure',
           multiplier=''  # base unit
       )

class BaseAPITestCase(BaseTestCase):
   def setUp(self):
       """Set up auth for API tests"""
       super().setUp()
       
       # Use APIClient instead of regular Client for DRF features
       self.client = APIClient()
       
       # Force authentication for all requests
       self.client.force_authenticate(user=self.test_user)
       
       # Set default content type to JSON
       self.client.default_format = 'json'