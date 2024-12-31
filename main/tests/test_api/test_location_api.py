# tests/test_api/test_location_api.py
from rest_framework import status
from django.urls import reverse
from decimal import Decimal
from ..test_base import BaseAPITestCase
from ...models import Location

class TestLocationAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('location-list')
        self.detail_url = reverse('location-detail', kwargs={'pk': self.test_location.pk})

    def test_list_locations(self):
        """Test retrieving list of locations"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # From utils_data

    def test_create_location(self):
        """Test location creation"""
        data = {
            'name': 'New Location',
            'project': self.test_project.pk,
            'address': '789 New St',
            'latitude': Decimal('34.0523'),
            'longitude': Decimal('-118.2438')
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Location.objects.filter(name='New Location').exists())

    def test_create_child_location(self):
        """Test creating a child location"""
        data = {
            'name': 'Child Location',
            'project': self.test_project.pk,
            'address': '789A New St',
            'parent': self.test_location.pk,
            'latitude': Decimal('34.0524'),
            'longitude': Decimal('-118.2439')
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_location = Location.objects.get(name='Child Location')
        self.assertEqual(created_location.parent, self.test_location)

    def test_project_filter(self):
        """Test filtering locations by project"""
        url = f"{self.list_url}?project={self.test_project.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # Factory and Headquarters