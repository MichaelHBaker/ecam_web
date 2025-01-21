# tests/test_api/test_measurement_api.py
from rest_framework import status
from django.urls import reverse
from ..test_base import BaseAPITestCase
from ...models import Measurement, Location, MeasurementUnit

class TestMeasurementAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('measurement-list')
        self.test_unit = MeasurementUnit.objects.filter(
            type=self.pressure_type,
            is_base_unit=True
        ).first()
        
        # Ensure we have a test location
        self.location = self.test_location

    def test_create_measurement(self):
        """Test creating a new measurement"""
        data = {
            'name': 'New Test Measurement',
            'location': self.location.pk,
            'type': self.pressure_type.pk,
            'unit': self.test_unit.pk,
            'description': 'A test measurement'
        }
        
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify measurement was created
        measurement = Measurement.objects.get(name='New Test Measurement')
        self.assertEqual(measurement.location, self.location)
        self.assertEqual(measurement.type, self.pressure_type)
        self.assertEqual(measurement.unit, self.test_unit)

    def test_create_measurement_validation(self):
        """Test validation during measurement creation"""
        test_cases = [
            {
                'data': {
                    'name': '',  # Empty name
                    'location': self.location.pk,
                    'type': self.pressure_type.pk,
                    'unit': self.test_unit.pk
                },
                'expected_error': 'name'
            },
            {
                'data': {
                    'name': 'Invalid Unit Test',
                    'location': self.location.pk,
                    'type': self.pressure_type.pk,
                    # Missing unit
                },
                'expected_error': 'unit'
            },
            {
                'data': {
                    'name': 'Invalid Location Test',
                    'type': self.pressure_type.pk,
                    'unit': self.test_unit.pk
                    # Missing location
                },
                'expected_error': 'location'
            }
        ]

        for test_case in test_cases:
            response = self.client.post(self.list_url, test_case['data'])
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(test_case['expected_error'], str(response.data))

    def test_retrieve_measurement(self):
        """Test retrieving a specific measurement"""
        # Create a measurement to retrieve
        measurement = Measurement.objects.create(
            name='Retrieve Test',
            location=self.location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        url = reverse('measurement-detail', kwargs={'pk': measurement.pk})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Retrieve Test')
        self.assertIn('unit', response.data)
        self.assertIn('type', response.data)
        self.assertIn('category', response.data)

    def test_update_measurement(self):
        """Test updating an existing measurement"""
        # Create a measurement to update
        measurement = Measurement.objects.create(
            name='Update Test',
            location=self.location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        url = reverse('measurement-detail', kwargs={'pk': measurement.pk})
        data = {
            'name': 'Updated Measurement Name',
            'description': 'An updated description'
        }
        
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify update
        measurement.refresh_from_db()
        self.assertEqual(measurement.name, 'Updated Measurement Name')
        self.assertEqual(measurement.description, 'An updated description')

    def test_delete_measurement(self):
        """Test deleting a measurement"""
        # Create a measurement to delete
        measurement = Measurement.objects.create(
            name='Delete Test',
            location=self.location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        url = reverse('measurement-detail', kwargs={'pk': measurement.pk})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Measurement.objects.filter(pk=measurement.pk).exists())

    def test_duplicate_measurement_validation(self):
        """Test preventing duplicate measurements in the same location"""
        # Create first measurement
        Measurement.objects.create(
            name='Duplicate Test',
            location=self.location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        # Try to create another measurement with same name in same location
        data = {
            'name': 'Duplicate Test',
            'location': self.location.pk,
            'type': self.pressure_type.pk,
            'unit': self.test_unit.pk
        }
        
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', str(response.data))

    def test_measurement_list(self):
        """Test retrieving list of measurements"""
        # Create multiple measurements
        Measurement.objects.create(
            name='Measurement 1',
            location=self.location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        Measurement.objects.create(
            name='Measurement 2',
            location=self.location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 2)