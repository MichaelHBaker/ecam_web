from rest_framework.test import APITestCase
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

class APITests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client_url = reverse('client-list')
        self.test_client = Client.objects.get(name="Acme Corp")
        self.client_detail_url = reverse('client-detail', kwargs={'pk': self.test_client.pk})

    def test_list_clients(self):
        response = self.client.get(self.client_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.data) > 0)

    def test_create_client(self):
        data = {
            'name': 'New Test Client',
            'contact_email': 'test@newclient.com',
            'phone_number': '1234567890'
        }
        response = self.client.post(self.client_url, data)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Client.objects.filter(name='New Test Client').count(), 1)

    def test_update_client(self):
        data = {'name': 'Updated Acme Corp'}
        response = self.client.patch(self.client_detail_url, data)
        self.assertEqual(response.status_code, 200)
        self.test_client.refresh_from_db()
        self.assertEqual(self.test_client.name, 'Updated Acme Corp')

    def test_delete_client(self):
        response = self.client.delete(self.client_detail_url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Client.objects.filter(pk=self.test_client.pk).exists())

class ModelTests(BaseTestCase):
    def test_client_str(self):
        client = Client.objects.get(name="Acme Corp")
        self.assertEqual(str(client), "Acme Corp")

    def test_project_str(self):
        project = Project.objects.get(name="Acme Audit")
        self.assertEqual(str(project), "Acme Audit (Audit)")

    def test_location_str(self):
        location = Location.objects.get(name="Acme Headquarters")
        self.assertEqual(str(location), "Acme Headquarters - Project: Acme Audit")

    def test_measurement_str(self):
        measurement = Measurement.objects.get(name="Main Power Meter")
        self.assertEqual(str(measurement), "Main Power Meter (Power (kW))")

class LocationHierarchyTests(BaseTestCase):
    def test_client_hierarchy(self):
        client = Client.objects.get(name="Acme Corp")
        self.assertEqual(client.get_hierarchy(), "Acme Corp")

    def test_project_hierarchy(self):
        project = Project.objects.get(name="Acme Audit")
        self.assertEqual(project.get_hierarchy(), "Acme Corp > Acme Audit")

    def test_location_hierarchy_top_level(self):
        location = Location.objects.get(name="Acme Headquarters")
        self.assertEqual(
            location.get_hierarchy(),
            "Acme Corp > Acme Audit > Acme Headquarters"
        )

    def test_location_hierarchy_nested(self):
        location = Location.objects.get(name="Acme Factory")
        self.assertEqual(
            location.get_hierarchy(),
            "Acme Corp > Acme Audit > Acme Headquarters > Acme Factory"
        )

    def test_measurement_hierarchy(self):
        measurement = Measurement.objects.get(name="Main Power Meter")
        self.assertEqual(
            measurement.get_hierarchy(),
            "Acme Corp > Acme Audit > Acme Headquarters > Main Power Meter"
        )

class SerializerTests(BaseTestCase):
    def test_client_serializer(self):
        client = Client.objects.get(name="Acme Corp")
        serializer = ClientSerializer(client)
        self.assertEqual(serializer.data['name'], "Acme Corp")
        self.assertTrue('projects' in serializer.data)

    def test_client_serializer_create(self):
        data = {
            'name': 'New Client',
            'contact_email': 'new@client.com',
            'phone_number': '1234567890'
        }
        serializer = ClientSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        new_client = serializer.save()
        self.assertEqual(new_client.name, 'New Client')