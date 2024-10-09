from django.test import TestCase
from django.urls import reverse
from ..views import index

class IndexPageTestCase(TestCase):
    def setUp(self):
        self.url = reverse('index')

    def test_load_index_page(self):
        """Test that the index page loads correctly and uses the right view."""
        response = self.client.get(self.url)
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.resolver_match.func, index)
        self.assertTemplateUsed(response, 'main/index.html')
        self.assertContains(response, 'Select a CSV file')

    def test_csv_upload_form_display(self):
        """Test that the CSV upload form is displayed on the index page."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '<form')
        self.assertContains(response, 'type="file"')
        self.assertContains(response, 'accept=".csv"')