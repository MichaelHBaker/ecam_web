from django.test import TestCase
from django.urls import reverse
from ..views import dashboard
from ..models import Client, Project, Location, Measurement
from . import utils_data

class BaseTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        utils_data.create_model_table_data()

class DashboardPageTestCase(TestCase):
    def setUp(self):
        self.url = reverse('dashboard')

    def test_load_dashboard_page(self):
        response = self.client.get(self.url)
        # self.assertRedirects() test redirect to a login page

        self.assertEqual(response.status_code, 404)
        self.client.login(username='ecam', password='test123')
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.resolver_match.func, dashboard)
        self.assertTemplateUsed(response, 'main/dashboard.html')

class PageRedirectionTestCase(TestCase):
    def setUp(self):
        # Assuming the user 'ecam' is setup for testing
        self.client.login(username='ecam', password='test123')
        self.dashboard_url = reverse('dashboard')

    def test_section_links(self):
        # Load the dashboard page
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)

        # Define the expected urls that each section button should link to
        section_urls = {
            'location': reverse('location'),      # Assumes 'location' is the URL name for Location section
            'measurement': reverse('measurement'),# Assumes 'measurement' is the URL name for Measurement section
            'data': reverse('data'),                # Assumes 'data' is the URL name for Data section
            'dictionary': reverse('dictionary')     # Assumes 'dictionary' is the URL name for Dictionary section
        }

        # Check if each section URL can be accessed correctly
        for section, url in section_urls.items():
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, f"Failed to load {section} at {url}")


class ModelTests(BaseTestCase):
    def test_client_str(self):
        client = Client.objects.get(name="Acme Corp")
        self.assertEqual(str(client), "Acme Corp")

    def test_project_str(self):
        project = Project.objects.get(name="Acme Audit")
        self.assertEqual(str(project), "Acme Audit (Audit)")

    def test_location_str(self):
        location = Location.objects.get(name="Acme Headquarters")
        self.assertEqual(
            str(location),
            "Acme Headquarters - Project: Acme Audit"
        )

    def test_measurement_str(self):
        measurement = Measurement.objects.get(name="Main Power Meter")
        self.assertEqual(str(measurement), "Main Power Meter (Power (kW))")

class LocationHierarchyTests(BaseTestCase):
    def test_client_hierarchy(self):
        client = Client.objects.get(name="Acme Corp")
        self.assertEqual(client.get_hierarchy(), "Acme Corp")

    def test_project_hierarchy(self):
        project = Project.objects.get(name="Acme Audit")
        self.assertEqual(
            project.get_hierarchy(),
            "Acme Corp > Acme Audit"
        )

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

class LocationViewTests(BaseTestCase):
    def test_dashboard_loads(self):
        response = self.client.get(reverse('dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'main/dashboard.html')

    def test_dashboard_context(self):
        response = self.client.get(reverse('dashboard'))
        self.assertIn('clients', response.context)

    def test_prefetch_related_efficiency(self):
        """Test that the view uses efficient querying"""
        with self.assertNumQueries(4):  # clients, project, location, measurement
            response = self.client.get(reverse('dashboard'))
            # Force evaluation of all querysets
            for client in response.context['clients']:
                for project in client.projects.all():
                    for location in project.location.all():
                        list(location.measurement.all())

class LocationClientOperationTests(BaseTestCase):
    def test_add_client(self):
        response = self.client.post(reverse('client-operation'), {
            'operation': 'add',
            'name': 'New Client',
            'contact_email': 'new@client.com',
            'phone_number': '555-0123'
        })
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertTrue(
            Client.objects.filter(name='New Client').exists()
        )

    def test_rename_client(self):
        client = Client.objects.get(name="Acme Corp")
        response = self.client.post(reverse('client-operation'), {
            'operation': 'rename',
            'client_id': client.id,
            'name': 'Acme Corporation'
        })
        
        self.assertEqual(response.status_code, 200)
        client.refresh_from_db()
        self.assertEqual(client.name, 'Acme Corporation')

    def test_delete_client_cascade(self):
        client = Client.objects.get(name="Acme Corp")
        project_ids = list(client.projects.values_list('id', flat=True))
        location_ids = list(Location.objects.filter(
            project__in=project_ids).values_list('id', flat=True))
        
        response = self.client.post(reverse('client-operation'), {
            'operation': 'delete',
            'client_id': client.id
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Client.objects.filter(id=client.id).exists())
        self.assertFalse(Project.objects.filter(id__in=project_ids).exists())
        self.assertFalse(Location.objects.filter(id__in=location_ids).exists())

class LocationProjectOperationTests(BaseTestCase):
    def test_add_project(self):
        client = Client.objects.get(name="Acme Corp")
        response = self.client.post(reverse('project-operation'), {
            'operation': 'add',
            'client_id': client.id,
            'name': 'New Project',
            'project_type': 'Audit',
            'start_date': '2024-01-01'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            Project.objects.filter(name='New Project').exists()
        )

    def test_delete_project_cascade(self):
        project = Project.objects.get(name="Acme Audit")
        location_ids = list(project.location.values_list('id', flat=True))
        
        response = self.client.post(reverse('project-operation'), {
            'operation': 'delete',
            'project_id': project.id
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Project.objects.filter(id=project.id).exists())
        self.assertFalse(Location.objects.filter(id__in=location_ids).exists())

class LocationOperationTests(BaseTestCase):
    def test_add_top_level_location(self):
        project = Project.objects.get(name="Acme Audit")
        response = self.client.post(reverse('location-operation'), {
            'operation': 'add',
            'project_id': project.id,
            'name': 'New Building'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            Location.objects.filter(
                name='New Building',
                parent__isnull=True
            ).exists()
        )

    def test_add_child_location(self):
        parent = Location.objects.get(name="Acme Headquarters")
        project = parent.project
        
        response = self.client.post(reverse('location-operation'), {
            'operation': 'add',
            'project_id': project.id,
            'parent_id': parent.id,
            'name': 'New Floor'
        })
        
        self.assertEqual(response.status_code, 200)
        child = Location.objects.get(name='New Floor')
        self.assertEqual(child.parent, parent)

class LocationMeasurementOperationTests(BaseTestCase):
    def test_add_measurement(self):
        location = Location.objects.get(name="Acme Headquarters")
        response = self.client.post(reverse('measurement-operation'), {
            'operation': 'add',
            'location_id': location.id,
            'name': 'New Meter',
            'measurement_type': 'power',
            'description': 'Test meter'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            Measurement.objects.filter(name='New Meter').exists()
        )

    def test_measurement_unit(self):
        measurement = Measurement.objects.get(name="Main Power Meter")
        self.assertEqual(measurement.unit, 'kW')
