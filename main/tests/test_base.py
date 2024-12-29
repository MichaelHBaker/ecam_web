from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from ..models import Client, Project, Location, Measurement

class BaseTestCase(APITestCase):
    """Base test case with common setup and helper methods"""
    
    @classmethod
    def setUpTestData(cls):
        # Create test user
        cls.user = User.objects.create_user(
            username='testuser',
            password='testpass',
            email='test@example.com'
        )

    def setUp(self):
        # Authenticate for each test
        self.client.force_authenticate(user=self.user)
        
    def create_test_client(self, **kwargs):
        """Helper to create a test client"""
        defaults = {
            'name': 'Test Client',
            'contact_email': 'test@client.com',
            'phone_number': '123-456-7890'
        }
        defaults.update(kwargs)
        return Client.objects.create(**defaults)

    def create_test_project(self, client=None, **kwargs):
        """Helper to create a test project"""
        if not client:
            client = self.create_test_client()
        defaults = {
            'name': 'Test Project',
            'project_type': 'Audit',
            'start_date': '2024-01-01',
            'client': client
        }
        defaults.update(kwargs)
        return Project.objects.create(**defaults)

    def create_test_location(self, project=None, **kwargs):
        """Helper to create a test location"""
        if not project:
            project = self.create_test_project()
        defaults = {
            'name': 'Test Location',
            'address': '123 Test St',
            'project': project,
            'latitude': '45.0',
            'longitude': '-75.0'
        }
        defaults.update(kwargs)
        return Location.objects.create(**defaults)

    def create_test_measurement(self, location=None, **kwargs):
        """Helper to create a test measurement"""
        if not location:
            location = self.create_test_location()
        defaults = {
            'name': 'Test Measurement',
            'measurement_type': 'power',
            'location': location
        }
        defaults.update(kwargs)
        return Measurement.objects.create(**defaults)