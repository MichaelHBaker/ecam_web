# tests/test_api/test_project_api.py
from rest_framework import status
from django.urls import reverse
from datetime import date
from ..test_base import BaseAPITestCase
from ...models import Project

class TestProjectAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('project-list')
        self.detail_url = reverse('project-detail', kwargs={'pk': self.test_project.pk})

    def test_list_projects(self):
        """Test retrieving list of projects"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # From utils_data

    def test_create_project(self):
        """Test project creation"""
        data = {
            'name': 'New Project',
            'client': self.test_client.pk,
            'project_type': 'M&V',
            'start_date': date.today().isoformat()
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Project.objects.filter(name='New Project').exists())

    def test_project_type_validation(self):
        """Test project type validation"""
        data = {
            'name': 'Invalid Project',
            'client': self.test_client.pk,
            'project_type': 'InvalidType',
            'start_date': date.today().isoformat()
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_filter(self):
        """Test filtering projects by client"""
        url = f"{self.list_url}?client={self.test_client.pk}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "Acme Audit")