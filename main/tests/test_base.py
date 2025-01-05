# tests/test_base.py
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient
from ..models import Project, Location, Measurement, MeasurementType
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
        measurement_type_ct = ContentType.objects.get_for_model(MeasurementType)

        # Get all model permissions
        model_permissions = Permission.objects.filter(
            content_type__in=[
                project_ct, 
                location_ct, 
                measurement_ct,
                measurement_type_ct
            ]
        )

        # Assign permissions to test user
        cls.test_user.user_permissions.add(*model_permissions)
        
        # Create initial test data
        create_model_table_data()
        
        # Get reference to test project (Energy Trust Production)
        cls.test_project = Project.objects.get(name="Energy Trust Production")
        
        # Get reference to test location (Acme Products)
        cls.test_location = Location.objects.get(name="Acme Products")
        
        # Get reference to test measurement (Process Line Pressure)
        cls.test_measurement = Measurement.objects.get(name="Process Line Pressure")

        # Get references to measurement types
        cls.power_type = MeasurementType.objects.get(name='power')
        cls.temp_type = MeasurementType.objects.get(name='temperature')
        cls.pressure_type = MeasurementType.objects.get(name='pressure')

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