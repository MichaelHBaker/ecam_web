# tests/test_api/test_client_api.py
from rest_framework import status
from django.urls import reverse
from ..test_base import BaseAPITestCase
from ...models import Client

class TestClientAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('client-list')
        self.detail_url = reverse('client-detail', kwargs={'pk': self.test_client.pk})

    def test_list_clients(self):
        """Test retrieving list of clients"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # From utils_data
        self.assertEqual(response.data[0]['name'], "Acme Corp")

    def test_create_client(self):
        """Test client creation"""
        data = {
            'name': 'New Test Client',
            'contact_email': 'test@newclient.com',
            'phone_number': '555-0123'
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Client.objects.count(), 3)

    def test_create_client_validation(self):
        """Test client creation validation"""
        # Test duplicate name
        data = {
            'name': 'Acme Corp',  # Already exists
            'contact_email': 'test@test.com'
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test invalid email
        data = {
            'name': 'Valid Name',
            'contact_email': 'not-an-email'
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_client(self):
        """Test retrieving a specific client"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_client.name)

    def test_update_client(self):
        """Test updating a client"""
        data = {'name': 'Updated Acme Corp'}
        response = self.client.patch(self.detail_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_client.refresh_from_db()
        self.assertEqual(self.test_client.name, 'Updated Acme Corp')

    def test_delete_client(self):
        """Test deleting a client"""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Client.objects.filter(pk=self.test_client.pk).exists())