from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from django.contrib.auth.models import User
from django.db import transaction
from datetime import date, timedelta
from decimal import Decimal
from ..models import Client, Project, Location, Measurement

class BaseAPITestCase(APITestCase):
    """Base class for API tests with common setup"""
    
    def setUp(self):
        # Create and authenticate test user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass'
        )
        self.client.force_authenticate(user=self.user)

        # Create base test data
        self.test_client = Client.objects.create(
            name='Test Client',
            contact_email='test@example.com',
            phone_number='123-456-7890'
        )
        self.test_project = Project.objects.create(
            name='Test Project',
            client=self.test_client,
            project_type='Audit',
            start_date=date.today()
        )
        self.test_location = Location.objects.create(
            name='Test Location',
            project=self.test_project,
            address='123 Test St',
            latitude=Decimal('45.4215'),
            longitude=Decimal('-75.6972')
        )
        self.test_measurement = Measurement.objects.create(
            name='Test Measurement',
            location=self.test_location,
            measurement_type='power'
        )


class ClientAPITests(BaseAPITestCase):
    """Test client-related API endpoints"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse('client-list')
        self.detail_url = reverse('client-detail', kwargs={'pk': self.test_client.pk})
        self.valid_data = {
            'name': 'New Client',
            'contact_email': 'new@example.com',
            'phone_number': '987-654-3210'
        }

    def test_list_clients(self):
        """Test client listing"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], self.test_client.name)

    def test_create_client(self):
        """Test client creation scenarios"""
        # Test valid creation
        response = self.client.post(self.list_url, self.valid_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Client.objects.count(), 2)

        # Test creation with invalid email
        invalid_data = self.valid_data.copy()
        invalid_data['contact_email'] = 'not-an-email'
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test duplicate name
        response = self.client.post(self.list_url, self.valid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_client(self):
        """Test client retrieval"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_client.name)

    def test_update_client(self):
        """Test client update scenarios"""
        # Test valid update
        response = self.client.patch(self.detail_url, {'name': 'Updated Client'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_client.refresh_from_db()
        self.assertEqual(self.test_client.name, 'Updated Client')

        # Test invalid email update
        response = self.client.patch(self.detail_url, {'contact_email': 'invalid-email'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_client(self):
        """Test client deletion and cascading"""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Client.objects.count(), 0)
        self.assertEqual(Project.objects.count(), 0)


class ProjectAPITests(BaseAPITestCase):
    """Test project-related API endpoints"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse('project-list')
        self.detail_url = reverse('project-detail', kwargs={'pk': self.test_project.pk})
        self.valid_data = {
            'name': 'New Project',
            'client': self.test_client.pk,
            'project_type': 'M&V',
            'start_date': date.today().isoformat()
        }

    def test_list_projects(self):
        """Test project listing and filtering"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Test client filtering
        response = self.client.get(f"{self.list_url}?client={self.test_client.pk}")
        self.assertEqual(len(response.data), 1)

        # Create another project for filtering tests
        Project.objects.create(
            name='Second Project',
            client=self.test_client,
            project_type='M&V',
            start_date=date.today()
        )

        # Test project type filter
        response = self.client.get(f"{self.list_url}?project_type=Audit")
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Test Project')

    def test_create_project(self):
        """Test project creation scenarios"""
        # Test valid creation
        response = self.client.post(self.list_url, self.valid_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Test invalid project type
        invalid_data = self.valid_data.copy()
        invalid_data['project_type'] = 'InvalidType'
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test invalid dates
        invalid_data = self.valid_data.copy()
        invalid_data['end_date'] = (date.today() - timedelta(days=1)).isoformat()
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_project(self):
        """Test project retrieval"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_project.name)

    def test_update_project(self):
        """Test project update scenarios"""
        # Test valid update
        response = self.client.patch(self.detail_url, {'name': 'Updated Project'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_project.refresh_from_db()
        self.assertEqual(self.test_project.name, 'Updated Project')

        # Test invalid client reference
        response = self.client.patch(self.detail_url, {'client': 9999})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LocationAPITests(BaseAPITestCase):
    """Test location-related API endpoints"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse('location-list')
        self.detail_url = reverse('location-detail', kwargs={'pk': self.test_location.pk})
        self.valid_data = {
            'name': 'New Location',
            'project': self.test_project.pk,
            'address': '456 Test Ave',
            'latitude': '45.4216',
            'longitude': '-75.6973'
        }

    def test_list_locations(self):
        """Test location listing and filtering"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        
        # Create child location
        child_location = Location.objects.create(
            name='Child Location',
            project=self.test_project,
            parent=self.test_location,
            address='123A Test St'
        )

        # Test project filter
        response = self.client.get(f"{self.list_url}?project={self.test_project.pk}")
        self.assertEqual(len(response.data), 2)

        # Test parent filter (root locations)
        response = self.client.get(f"{self.list_url}?parent__isnull=true")
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], self.test_location.name)

    def test_create_location(self):
        """Test location creation scenarios"""
        # Test valid creation
        response = self.client.post(self.list_url, self.valid_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Test invalid coordinates
        invalid_data = self.valid_data.copy()
        invalid_data['latitude'] = '91.0'
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test invalid project reference
        invalid_data = self.valid_data.copy()
        invalid_data['project'] = 9999
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_location(self):
        """Test location update scenarios"""
        # Test valid update
        response = self.client.patch(self.detail_url, {'name': 'Updated Location'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_location.refresh_from_db()
        self.assertEqual(self.test_location.name, 'Updated Location')

        # Test self-reference as parent
        response = self.client.patch(self.detail_url, {'parent': self.test_location.pk})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MeasurementAPITests(BaseAPITestCase):
    """Test measurement-related API endpoints"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse('measurement-list')
        self.detail_url = reverse('measurement-detail', kwargs={'pk': self.test_measurement.pk})
        self.valid_data = {
            'name': 'New Measurement',
            'location': self.test_location.pk,
            'measurement_type': 'temperature',
            'description': 'Test description'
        }

    def test_list_measurements(self):
        """Test measurement listing and filtering"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Test location filter
        response = self.client.get(f"{self.list_url}?location={self.test_location.pk}")
        self.assertEqual(len(response.data), 1)

        # Create another measurement for testing filters
        Measurement.objects.create(
            name='Second Measurement',
            location=self.test_location,
            measurement_type='temperature'
        )

        # Test type filter
        response = self.client.get(f"{self.list_url}?measurement_type=power")
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Test Measurement')

    def test_create_measurement(self):
        """Test measurement creation scenarios"""
        # Test valid creation
        response = self.client.post(self.list_url, self.valid_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Test invalid measurement type
        invalid_data = self.valid_data.copy()
        invalid_data['measurement_type'] = 'invalid_type'
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test invalid location reference
        invalid_data = self.valid_data.copy()
        invalid_data['location'] = 9999
        response = self.client.post(self.list_url, invalid_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_measurement(self):
        """Test measurement update scenarios"""
        # Test valid update
        response = self.client.patch(self.detail_url, {'description': 'Updated description'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_measurement.refresh_from_db()
        self.assertEqual(self.test_measurement.description, 'Updated description')

        # Test invalid type update
        response = self.client.patch(self.detail_url, {'measurement_type': 'invalid_type'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_measurement(self):
        """Test measurement deletion"""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Measurement.objects.count(), 0)