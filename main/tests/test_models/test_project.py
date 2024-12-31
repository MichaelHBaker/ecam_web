# tests/test_models/test_project.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from datetime import date, timedelta
from ..test_base import BaseTestCase
from ...models import Project

class TestProjectModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of project"""
        expected = f"{self.test_project.name} ({self.test_project.get_project_type_display()})"
        self.assertEqual(str(self.test_project), expected)

    def test_invalid_project_type(self):
        """Test project type validation"""
        with self.assertRaises(ValidationError):
            Project(
                name="Invalid Type Test",
                client=self.test_client,
                project_type="InvalidType",
                start_date=date.today()
            ).full_clean()

    def test_date_validation(self):
        """Test start/end date validation"""
        start_date = date.today()
        with self.assertRaises(ValidationError):
            Project(
                name="Invalid Dates Test",
                client=self.test_client,
                project_type="Audit",
                start_date=start_date,
                end_date=start_date - timedelta(days=1)  # End before start
            ).full_clean()

    def test_hierarchy_string(self):
        """Test get_hierarchy method"""
        expected = f"{self.test_client.name} > {self.test_project.name}"
        self.assertEqual(self.test_project.get_hierarchy(), expected)