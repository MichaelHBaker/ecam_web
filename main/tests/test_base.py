# tests/test_base.py
from django.test import TestCase
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from django.urls import reverse
from ..models import Client, Project, Location, Measurement
from .utils_data import create_model_table_data

class BaseTestCase(TestCase):
    """Base test case for non-API tests"""
    
    @classmethod
    def setUpTestData(cls):
        """Called once at the beginning of the test run"""
        # Create test user
        cls.user = User.objects.create_user(
            username='testuser',
            password='testpass',
            email='test@example.com'
        )
        
        create_model_table_data()

        # Get pre-created test data
        cls.test_client = Client.objects.get(name="Acme Corp")
        cls.test_project = Project.objects.get(name="Acme Audit")
        cls.test_location = Location.objects.get(name="Acme Headquarters")
        cls.test_measurement = Measurement.objects.get(name="Main Power Meter")

    def setUp(self):
        """Called before each test method"""
        self.client.login(username='testuser', password='testpass')


class BaseAPITestCase(APITestCase):
    """Base test case for API tests"""
    
    @classmethod
    def setUpTestData(cls):
        """Share the same test data setup as BaseTestCase"""
        cls.user = User.objects.create_user(
            username='testuser',
            password='testpass',
            email='test@example.com'
        )

        create_model_table_data()

        # Get pre-created test data
        cls.test_client = Client.objects.get(name="Acme Corp")
        cls.test_project = Project.objects.get(name="Acme Audit")
        cls.test_location = Location.objects.get(name="Acme Headquarters")
        cls.test_measurement = Measurement.objects.get(name="Main Power Meter")

    def setUp(self):
        """Called before each test method"""
        self.client.force_authenticate(user=self.user)