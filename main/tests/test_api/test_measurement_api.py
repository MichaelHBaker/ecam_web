# tests/test_api/test_measurement_api.py
from rest_framework import status
from django.urls import reverse
from ..test_base import BaseAPITestCase
from ...models import Measurement

class TestMeasurementAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('measurement-list')
        self.detail_url = reverse('measurement-detail', kwargs={'pk': self.test_measurement.pk})

    def test_list_measurements(self):
        """Test retrieving list of measurements"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)  # From utils_data

    def test_create_measurement(self):
        """Test measurement creation"""
        data = {
            'name': 'New Measurement',
            'location': self.test_location.pk,
            'measurement_type': 'power',
            'description': 'Test measurement'
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Measurement.objects.filter(name='New Measurement').exists())

    def test_measurement_type_validation(self):
        """Test measurement type validation"""
        data = {
            'name': 'Invalid Measurement',
            'location': self.test_location.pk,
            'measurement_type': 'invalid_type'
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_location_filter(self):
        """Test filtering measurements by location"""
        url = f"{self.list_url}?location={self.test_location.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # Power and Temperature