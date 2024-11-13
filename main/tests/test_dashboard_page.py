from django.test import TestCase
from django.urls import reverse
from ..views import dashboard

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

    