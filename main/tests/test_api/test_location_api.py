# tests/test_api/test_location_api.py
from rest_framework import status
from django.urls import reverse
from decimal import Decimal
import json
from ..test_base import BaseAPITestCase
from ...models import Location, Project, MeasurementUnit

class TestLocationAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('location-list')
        self.detail_url = reverse('location-detail', kwargs={'pk': self.test_location.pk})
        self.client.content_type = 'application/json'

        # Get base unit for the pressure type
        self.test_unit = MeasurementUnit.objects.filter(
            type=self.pressure_type,
            is_base_unit=True
        ).first()

    def test_list_locations(self):
        """Test retrieving list of locations"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)  # From utils_data
        self.assertEqual(response.data[0]['name'], "Industrial Facility")

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
                    'address': '123 Test St'
                },
                'expected_error': 'address'  # If address is required
            },
            {
                'data': {
                    'name': 'Test Location',
                    'project': self.test_project.pk,
                    'address': '123 Test St',
                    'latitude': '91.0',  # Invalid latitude
                    'longitude': '0.0'
                },
                'expected_error': 'latitude'
            }
        ]

        for test_case in test_cases:
            response = self.client.post(
                self.list_url, 
                data=test_case['data'], 
                content_type='application/json'
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            
            # Check that the expected error is in the response
            error_str = str(response.data)
            self.assertIn(test_case['expected_error'], error_str, 
                        f"Expected error '{test_case['expected_error']}' not found in {error_str}")

    def test_retrieve_location_with_measurements(self):
        """Test retrieving a specific location with measurement details"""
        # Create a unique measurement for this test
        measurement = self.test_location.measurements.create(
            name="Unique Measurement for Retrieval Test",
            type=self.pressure_type,
            unit=self.test_unit
        )

        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_location.name)
        
        measurement_data = response.data['measurements'][0]
        self.assertIn('unit', measurement_data)
        self.assertIn('category', measurement_data)
        self.assertIn('type', measurement_data)
        self.assertEqual(measurement_data['unit']['id'], self.test_unit.id)
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

    def test_delete_location_with_measurements(self):
        """Test deleting a location cascades to measurements but preserves units"""
        # Create a unique measurement for this test
        measurement = self.test_location.measurements.create(
            name="Unique Measurement for Deletion Test",
            type=self.pressure_type,
            unit=self.test_unit
        )

        measurement_id = measurement.id
        unit_id = self.test_unit.id
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.test_location.measurements.filter(id=measurement_id).exists())
        self.assertTrue(MeasurementUnit.objects.filter(id=unit_id).exists())
