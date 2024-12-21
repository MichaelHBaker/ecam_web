from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from django.contrib.auth.models import User
from ..views import dashboard
from ..models import Client, Project, Location, Measurement
from ..serializers import ClientSerializer, ProjectSerializer, LocationSerializer, MeasurementSerializer
from . import utils_data


class BaseTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Create test user
        cls.user = User.objects.create_user(
            username='ecam',
            password='test123',
            email='test@example.com'
        )
        utils_data.create_model_table_data()

    def setUp(self):
        # Authenticate for each test
        self.client.force_authenticate(user=self.user)

class DashboardPageTestCase(APITestCase):
    def setUp(self):
        self.url = reverse('dashboard')
        self.user = User.objects.create_user(
            username='ecam',
            password='test123'
        )
        self.api_client_url = reverse('client-list')  # DRF URL pattern

    def test_load_dashboard_page(self):
        # Test unauthenticated access
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)  # Should redirect to login

        # Test authenticated access
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.resolver_match.func, dashboard)
        self.assertTemplateUsed(response, 'main/dashboard.html')

    def test_api_access(self):
        # Test unauthenticated API access
        response = self.client.get(self.api_client_url)
        self.assertEqual(response.status_code, 401)  # Unauthorized

        # Test authenticated API access
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.api_client_url)
        self.assertEqual(response.status_code, 200)

class PageRedirectionTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='ecam',
            password='test123'
        )
        self.client.force_authenticate(user=self.user)
        self.dashboard_url = reverse('dashboard')

    def test_section_links(self):
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)

        section_urls = {
            'location': reverse('location'),
            'measurement': reverse('measurement'),
            'data': reverse('data'),
            'dictionary': reverse('dictionary')
        }

        for section, url in section_urls.items():
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, f"Failed to load {section} at {url}")

class AuthenticatedTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='test123')
        self.client.force_authenticate(user=self.user)

class ClientAPITests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        self.client_list_url = reverse('client-list')
        self.client_obj = Client.objects.create(name="Acme Corp", contact_email="contact@acme.com", phone_number="555-1234")
        self.client_detail_url = reverse('client-detail', kwargs={'pk': self.client_obj.pk})

    def test_create_client_valid(self):
        data = {
            'name': 'New Client',
            'contact_email': 'newclient@example.com',
            'phone_number': '1234567890'
        }
        response = self.client.post(self.client_list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Client.objects.filter(name='New Client').exists())

    def test_list_clients(self):
        response = self.client.get(self.client_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Acme Corp', [c['name'] for c in response.data])

    def test_retrieve_client(self):
        response = self.client.get(self.client_detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Acme Corp')

    def test_update_client(self):
        data = {'name': 'Acme Corp Updated'}
        response = self.client.patch(self.client_detail_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_obj.refresh_from_db()
        self.assertEqual(self.client_obj.name, 'Acme Corp Updated')

    def test_delete_client(self):
        response = self.client.delete(self.client_detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Client.objects.filter(pk=self.client_obj.pk).exists())


class ProjectAPITests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        self.client_obj = Client.objects.create(name="Acme Corp", contact_email="contact@acme.com")
        self.project_list_url = reverse('project-list')
        self.project_obj = Project.objects.create(name="Acme Audit", client=self.client_obj, project_type='Audit', start_date="2024-01-01")
        self.project_detail_url = reverse('project-detail', kwargs={'pk': self.project_obj.pk})

    def test_create_project_valid(self):
        data = {
            'name': 'New Project',
            'project_type': 'M&V',
            'start_date': '2025-01-01',
            'end_date': '2025-12-31',
            'client': self.client_obj.pk
        }
        response = self.client.post(self.project_list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Project.objects.filter(name='New Project').exists())

    def test_list_projects(self):
        response = self.client.get(self.project_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Acme Audit', [p['name'] for p in response.data])

    def test_retrieve_project(self):
        response = self.client.get(self.project_detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Acme Audit')

    def test_update_project(self):
        data = {'name': 'Acme Audit Updated'}
        response = self.client.patch(self.project_detail_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.project_obj.refresh_from_db()
        self.assertEqual(self.project_obj.name, 'Acme Audit Updated')

    def test_delete_project(self):
        response = self.client.delete(self.project_detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.filter(pk=self.project_obj.pk).exists())


class LocationAPITests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        self.client_obj = Client.objects.create(name="Acme Corp", contact_email="contact@acme.com")
        self.project_obj = Project.objects.create(name="Acme Audit", client=self.client_obj, project_type='Audit', start_date="2024-01-01")
        self.location_list_url = reverse('location-list')
        self.location_obj = Location.objects.create(project=self.project_obj, name="Acme Headquarters", address="123 Main St")
        self.location_detail_url = reverse('location-detail', kwargs={'pk': self.location_obj.pk})

    def test_create_location_valid(self):
        data = {
            'project': self.project_obj.pk,
            'name': 'New Location',
            'address': '456 Industrial Rd',
            'latitude': 10.123456,
            'longitude': 20.654321
        }
        response = self.client.post(self.location_list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Location.objects.filter(name='New Location').exists())

    def test_list_locations(self):
        response = self.client.get(self.location_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Acme Headquarters', [l['name'] for l in response.data])

    def test_retrieve_location(self):
        response = self.client.get(self.location_detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Acme Headquarters')

    def test_update_location(self):
        data = {'name': 'Acme HQ Updated'}
        response = self.client.patch(self.location_detail_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.location_obj.refresh_from_db()
        self.assertEqual(self.location_obj.name, 'Acme HQ Updated')

    def test_delete_location(self):
        response = self.client.delete(self.location_detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Location.objects.filter(pk=self.location_obj.pk).exists())


class MeasurementAPITests(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        self.client_obj = Client.objects.create(name="Acme Corp", contact_email="contact@acme.com")
        self.project_obj = Project.objects.create(name="Acme Audit", client=self.client_obj, project_type='Audit', start_date="2024-01-01")
        self.location_obj = Location.objects.create(project=self.project_obj, name="Acme Headquarters", address="123 Main St")
        self.measurement_list_url = reverse('measurement-list')
        self.measurement_obj = Measurement.objects.create(name="Main Power Meter", measurement_type="power", location=self.location_obj)
        self.measurement_detail_url = reverse('measurement-detail', kwargs={'pk': self.measurement_obj.pk})

    def test_create_measurement_valid(self):
        data = {
            'name': 'New Measurement',
            'description': 'A test measurement',
            'measurement_type': 'temperature',
            'location': self.location_obj.pk
        }
        response = self.client.post(self.measurement_list_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Measurement.objects.filter(name='New Measurement').exists())

    def test_list_measurements(self):
        response = self.client.get(self.measurement_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Main Power Meter', [m['name'] for m in response.data])

    def test_retrieve_measurement(self):
        response = self.client.get(self.measurement_detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Main Power Meter')

    def test_update_measurement(self):
        data = {'description': 'Updated description'}
        response = self.client.patch(self.measurement_detail_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.measurement_obj.refresh_from_db()
        self.assertEqual(self.measurement_obj.description, 'Updated description')

    def test_delete_measurement(self):
        response = self.client.delete(self.measurement_detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Measurement.objects.filter(pk=self.measurement_obj.pk).exists())
