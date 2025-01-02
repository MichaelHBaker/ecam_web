# tests/test_api/test_measurement_api.py
from rest_framework import status
from django.urls import reverse
import json
from ..test_base import BaseAPITestCase
from ...models import Measurement, Location

class TestMeasurementAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('measurement-list')
        self.detail_url = reverse('measurement-detail', kwargs={'pk': self.test_measurement.pk})
        # Set content type for all requests
        self.client.content_type = 'application/json'

    def test_list_measurements(self):
        """Test retrieving list of measurements"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # From utils_data
        self.assertEqual(response.data[0]['name'], "Main Power Meter")

    def test_create_measurement(self):
        """Test measurement creation"""
        data = {
            'name': 'New Measurement',
            'location': self.test_location.pk,
            'measurement_type': 'power',
            'description': 'Test measurement'
        }
        response = self.client.post(
            self.list_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Measurement.objects.filter(name='New Measurement').exists())

    def test_create_measurement_validation(self):
        """Test measurement creation validation"""
        test_cases = [
            {
                'data': {'name': ''},
                'expected_error': 'name'
            },
            {
                'data': {'name': 'Test Measurement'},  # Missing location
                'expected_error': 'location'
            },
            {
                'data': {
                    'name': 'Test Measurement',
                    'location': self.test_location.pk,
                    'measurement_type': 'invalid_type'
                },
                'expected_error': 'measurement_type'
            },
            {
                'data': {
                    'name': self.test_measurement.name,  # Duplicate name in same location
                    'location': self.test_location.pk,
                    'measurement_type': 'power'
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

    def test_create_measurement_same_name_different_location(self):
        """Test can create measurements with same name in different locations"""
        storage_location = Location.objects.get(name="Fish Storage Warehouse")
        data = {
            'name': self.test_measurement.name,  # Same name as existing measurement
            'location': storage_location.pk,  # Different location
            'measurement_type': 'power'
        }
        response = self.client.post(
            self.list_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_retrieve_measurement(self):
        """Test retrieving a specific measurement"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_measurement.name)
        self.assertEqual(response.data['measurement_type'], 'pressure')  # Updated to match utils_data
        self.assertEqual(response.data['unit'], 'PSI')  # Updated to match measurement type

    def test_update_measurement(self):
        """Test updating a measurement"""
        data = {
            'name': 'Updated Measurement Name',
            'description': 'Updated description'
        }
        response = self.client.patch(
            self.detail_url, 
            data=json.dumps(data), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_measurement.refresh_from_db()
        self.assertEqual(self.test_measurement.name, 'Updated Measurement Name')

    def test_delete_measurement(self):
        """Test deleting a measurement"""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Measurement.objects.filter(pk=self.test_measurement.pk).exists())