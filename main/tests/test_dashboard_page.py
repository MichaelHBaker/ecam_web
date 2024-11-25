from django.test import TestCase
from django.urls import reverse
from django.db import transaction 
from ..views import dashboard
from ..models import Client, Project, Location 
from ..forms import ClientFormSet
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
            'locations': reverse('locations'),      # Assumes 'locations' is the URL name for Locations section
            'measurements': reverse('measurements'),# Assumes 'measurements' is the URL name for Measurements section
            'data': reverse('data'),                # Assumes 'data' is the URL name for Data section
            'dictionary': reverse('dictionary')     # Assumes 'dictionary' is the URL name for Dictionary section
        }

        # Check if each section URL can be accessed correctly
        for section, url in section_urls.items():
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, f"Failed to load {section} at {url}")


class DashboardLocationTableTest(BaseTestCase):
    def test_clients_table_content_with_formset(self):
        url = reverse('dashboard')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        # Simulate the click on the "Locations" button (adjust POST data as needed)
        response = self.client.post(url, {'show_clients': True}) 

        # Get the ClientFormSet from the response context
        formset = response.context['client_formset']  # Replace 'client_formset' with the actual context variable name

        # Assert that the formset is an instance of ClientFormSet
        self.assertIsInstance(formset, ClientFormSet)

        # Assert that the formset has the expected number of forms
        self.assertEqual(formset.total_form_count(), Client.objects.count())

        # Loop through the forms in the formset and assert the data
        for form in formset:
            client = form.instance
            self.assertIsInstance(client, Client)
            self.assertEqual(form['name'].value(), client.name)
            self.assertEqual(form['contact_email'].value(), client.contact_email)
            # ... add assertions for other fields ...