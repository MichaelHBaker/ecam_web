from django.test import TestCase
from django.urls import reverse
from ..views import dashboard
from ..models import Client, Project, Location, Measurement
from ..forms import ClientForm, ProjectForm, LocationForm, MeasurementForm
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


class TreeEditFormTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Setup once for all tests in this class
        cls.client = Client.objects.create(name="Test Client", contact_email="contact@testclient.com")
        cls.project = Project.objects.create(name="Test Project", client=cls.client, project_type="Audit", start_date="2024-01-15")

    def test_valid_client_form(self):
        form_data = {
            'name': 'New Client',
            'contact_email': 'newclient@example.com'
        }
        form = ClientForm(data=form_data)
        self.assertTrue(form.is_valid())
        new_client = form.save()
        self.assertEqual(Client.objects.count(), 2)

    def test_valid_project_form(self):
        form_data = {
            'name': 'New Project',
            'client': self.client,
            'project_type': 'Development',
            'start_date': "2024-01-15"
        }
        form = ProjectForm(data=form_data)
        self.assertTrue(form.is_valid())
        new_project = form.save()
        self.assertEqual(Project.objects.count(), 2)

    def test_valid_location_form(self):
        form_data = {
            'name': 'New Location',
            'project': self.project,
            'address': '123 New St, New City'
        }
        form = LocationForm(data=form_data)
        self.assertTrue(form.is_valid())
        new_location = form.save()
        self.assertEqual(Location.objects.count(), 1)

    def test_valid_measurement_form(self):
        form_data = {
            'name': 'New Measurement',
            'description': 'New measurement description',
            'measurement_type': 'Temperature',
            'location': Location.objects.create(
                name="Project Location", project=self.project).id
        }
        form = MeasurementForm(data=form_data)
        self.assertTrue(form.is_valid())
        new_measurement = form.save()
        self.assertEqual(Measurement.objects.count(), 1)

    def test_invalid_client_form(self):
        form_data = {}
        form = ClientForm(data=form_data)
        self.assertFalse(form.is_valid())

    def test_invalid_project_form(self):
        form_data = {'name': 'Invalid Project'}
        form = ProjectForm(data=form_data)
        self.assertFalse(form.is_valid())

    def test_invalid_location_form(self):
        form_data = {'name': ''}
        form = LocationForm(data=form_data)
        self.assertFalse(form.is_valid())

    def test_invalid_measurement_form(self):
        form_data = {'name': ''}
        form = MeasurementForm(data=form_data)
        self.assertFalse(form.is_valid())
