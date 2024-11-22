from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User

class HomePageTests(TestCase):
    def setUp(self):
        # Create and log in a test user
        self.user = User.objects.create_user(username='ecam', password='test123')
        self.client.login(username='ecam', password='test123')
        self.home_url = reverse('dashboard')  # Assuming 'home' is the URL name for the Home button's link

    def test_home_button_opens_dashboard(self):
        """
        Test if clicking the Home button redirects to the dashboard.html page.
        """
        # Simulate a click on the Home button by making a GET request to the home URL
        response = self.client.get(self.home_url)
        # Check if the response redirects as expected
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'main/dashboard.html')

        # Optional: Additional assertions could include checking for specific content
        # self.assertContains(response, 'Welcome to the Dashboard', status_code=200)
