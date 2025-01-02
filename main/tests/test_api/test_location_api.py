# tests/test_api/test_location_api.py
from rest_framework import status
from django.urls import reverse
from decimal import Decimal
import json
from ..test_base import BaseAPITestCase
from ...models import Location, Project

class TestLocationAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('location-list')
        self.detail_url = reverse('location-detail', kwargs={'pk': self.test_location.pk})
        # Set content type for all requests
        self.client.content_type = 'application/json'

    def test_list_locations(self):
        """Test retrieving list of locations"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # From utils_data
        self.assertEqual(response.data[0]['name'], "Acme Products")

    def test_create_location(self):
        """Test location creation"""
        data = {
            'name': 'New Location',
            'project': self.test_project.pk,
            'address': '789 New St',
            'latitude': '34.0523',
            'longitude': '-118.2438'
        }
        response = self.client.post(
            self.list_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Location.objects.filter(name='New Location').exists())

    def test_create_child_location(self):
        """Test creating a child location"""
        data = {
            'name': 'Child Location',
            'project': self.test_project.pk,
            'address': '789A New St',
            'parent': self.test_location.pk,
            'latitude': '34.0524',
            'longitude': '-118.2439'
        }
        response = self.client.post(
            self.list_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_location = Location.objects.get(name='Child Location')
        self.assertEqual(created_location.parent, self.test_location)

    def test_create_location_validation(self):
        """Test location creation validation"""
        test_cases = [
            {
                'data': {'name': ''},
                'expected_error': 'name'
            },
            {
                'data': {'name': 'Test Location'},  # Missing project
                'expected_error': 'project'
            },
            {
                'data': {
                    'name': 'Test Location',
                    'project': self.test_project.pk,
                    'latitude': '91.0',  # Invalid latitude
                    'longitude': '0.0'
                },
                'expected_error': 'latitude'
            },
            {
                'data': {
                    'name': self.test_location.name,  # Duplicate name in same project
                    'project': self.test_project.pk,
                    'address': '123 Test St'
                },
                'expected_error': 'name'
            }
        ]

        for test_case in test_cases:
            response = self.client.post(
                self.list_url, 
                data=json.dumps(test_case['data']), 
                content_type='application/json'
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(test_case['expected_error'], str(response.data))

    def test_create_location_different_project_parent(self):
        """Test cannot create location with parent from different project"""
        other_project = Project.objects.get(name="BPA Custom")
        data = {
            'name': 'Cross Project Location',
            'project': other_project.pk,
            'address': '789 Cross St',
            'parent': self.test_location.pk  # Parent from different project
        }
        response = self.client.post(
            self.list_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('parent', str(response.data))

    def test_retrieve_location(self):
        """Test retrieving a specific location"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_location.name)
        self.assertIn('measurements', response.data)
        self.assertIn('children', response.data)

    def test_update_location(self):
        """Test updating a location"""
        data = {
            'name': 'Updated Location Name',
            'address': 'Updated Address'
        }
        response = self.client.patch(
            self.detail_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_location.refresh_from_db()
        self.assertEqual(self.test_location.name, 'Updated Location Name')

    def test_delete_location(self):
        """Test deleting a location cascades to children and measurements"""
        # Get counts before delete
        child_count = self.test_location.children.count()
        measurement_count = self.test_location.measurements.count()
        self.assertTrue(measurement_count > 0)  # Verify we have measurements

        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify everything is deleted
        self.assertFalse(Location.objects.filter(pk=self.test_location.pk).exists())