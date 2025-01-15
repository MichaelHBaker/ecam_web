# tests/test_base.py
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient
from ..models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataSource, APIDataSource,
    DataSourceMapping, TimeSeriesData
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

        # Get content types for all models
        model_classes = [
            Project, Location, Measurement, MeasurementCategory,
            MeasurementType, MeasurementUnit, DataSource, APIDataSource,
            DataSourceMapping, TimeSeriesData
        ]
        
        # Get all model permissions
        perms = []
        for model in model_classes:
            ct = ContentType.objects.get_for_model(model)
            perms.extend(Permission.objects.filter(content_type=ct))
        
        # Assign permissions to test user
        cls.test_user.user_permissions.add(*perms)
        
        # Create initial test data
        create_model_table_data()
        
        # Cache commonly used test objects
        cls.test_project = Project.objects.get(name="Energy Trust Production")
        cls.test_location = Location.objects.get(name="Industrial Facility")
        cls.test_measurement = Measurement.objects.get(name="Building Pressure")
        
        # Cache measurement hierarchy objects
        cls.pressure_category = MeasurementCategory.objects.get(name='pressure')
        cls.flow_category = MeasurementCategory.objects.get(name='flow')
        cls.temperature_category = MeasurementCategory.objects.get(name='temperature')
        
        cls.diff_pressure_type = MeasurementType.objects.get(name='Differential Pressure') 
        cls.vol_flow_type = MeasurementType.objects.get(name='Volumetric Flow (Fluid)')
        cls.temperature_type = MeasurementType.objects.get(name='Thermal Measurement')
        
        cls.inh2o_unit = MeasurementUnit.objects.get(name='inH₂O')
        cls.gpm_unit = MeasurementUnit.objects.get(name='Gallons per minute')
        cls.fahrenheit_unit = MeasurementUnit.objects.get(name='Fahrenheit')
        
        # Cache data source objects
        cls.file_source = DataSource.objects.get(name="CSV Import")
        cls.api_source = APIDataSource.objects.get(name="Test Niagara")
        
        # Cache data mapping
        cls.pressure_mapping = DataSourceMapping.objects.get(
            measurement=cls.test_measurement,
            data_source=cls.api_source
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