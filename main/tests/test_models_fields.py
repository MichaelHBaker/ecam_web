from django.test import TestCase
from ..models import Client, Project, Location
from . import utils_data

import datetime
import decimal

class BaseTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        utils_data.create_model_table_data()

class ClientModelTest(BaseTestCase):
   
    def test_client_fields(self):
        # Get the Client model fields
        fields = [field.name for field in Client._meta.get_fields()]

        # Assert that expected fields are present
        self.assertIn('name', fields)
        self.assertIn('contact_email', fields)
        self.assertIn('phone_number', fields)

        # Assert that a non-existent field is not present
        self.assertNotIn('invalid_field', fields)

        # Retrieve the clients created by the test data generation
        client1 = Client.objects.filter(name="Acme Corp").first() 
        client2 = Client.objects.filter(name="Globex Inc").first()

        # Check if clients were found
        self.assertIsNotNone(client1)
        self.assertIsNotNone(client2)

        # Type checking using the retrieved client instances
        self.assertIsInstance(client1.name, str)
        self.assertIsInstance(client1.contact_email, str)
        self.assertIsNone(client1.phone_number, str)

        self.assertIsInstance(client2.name, str)
        self.assertIsInstance(client2.contact_email, str)
        self.assertIsInstance(client2.phone_number, str) 


class ProjectModelTest(BaseTestCase):

    def test_project_fields(self):
        # Get the Project model fields
        fields = [field.name for field in Project._meta.get_fields()]

        # Assert that expected fields are present
        self.assertIn('name', fields)
        self.assertIn('client', fields)
        self.assertIn('project_type', fields)
        self.assertIn('start_date', fields)
        self.assertIn('end_date', fields)

        # Assert that a non-existent field is not present
        self.assertNotIn('invalid_field', fields) 

        # Retrieve the projects created by the test data generation
        project1 = Project.objects.filter(name="Acme Audit").first()
        project2 = Project.objects.filter(name="Globex M&V").first()

        # Check if projects were found
        self.assertIsNotNone(project1)
        self.assertIsNotNone(project2)

        # Type checking using the retrieved project instances
        self.assertIsInstance(project1.name, str)
        self.assertIsInstance(project1.client, Client)
        self.assertIsInstance(project1.project_type, str)
        self.assertIsInstance(project1.start_date, datetime.date)
        self.assertIsInstance(project1.end_date, datetime.date)

        self.assertIsInstance(project2.name, str)
        self.assertIsInstance(project2.client, Client)
        self.assertIsInstance(project2.project_type, str)
        self.assertIsInstance(project2.start_date, datetime.date)
        self.assertIsNone(project2.end_date)


class LocationModelTest(BaseTestCase):

    def test_location_fields(self):
        # Get the Location model fields
        fields = [field.name for field in Location._meta.get_fields()]

        # Assert that expected fields are present
        self.assertIn('project', fields)
        self.assertIn('name', fields)
        self.assertIn('address', fields)
        self.assertIn('parent', fields)
        self.assertIn('latitude', fields)
        self.assertIn('longitude', fields)

        # Assert that a non-existent field is not present
        self.assertNotIn('invalid_field', fields) 

        # Retrieve the locations created by the test data generation
        location1 = Location.objects.filter(name="Acme Headquarters").first()
        location2 = Location.objects.filter(name="Acme Factory").first()
        location3 = Location.objects.filter(name="Globex Office").first()

        # Check if locations were found
        # self.assertIsNotNone(location1)
        self.assertIsNotNone(location2)
        self.assertIsNotNone(location3)

        # Type checking using the retrieved location instances
        self.assertIsInstance(location1.project, Project)
        self.assertIsInstance(location1.name, str)
        self.assertIsInstance(location1.address, str)
        self.assertIsNone(location1.parent)
        self.assertIsInstance(location1.latitude, decimal.Decimal)
        self.assertIsInstance(location1.longitude, decimal.Decimal)

        self.assertIsInstance(location2.project, Project)
        self.assertIsInstance(location2.name, str)
        self.assertIsInstance(location2.address, str)
        self.assertIsInstance(location2.parent, Location) 
        self.assertIsInstance(location2.latitude, decimal.Decimal)
        self.assertIsInstance(location2.longitude, decimal.Decimal)

        self.assertIsInstance(location3.project, Project)
        self.assertIsInstance(location3.name, str)
        self.assertIsInstance(location3.address, str)
        self.assertIsNone(location3.parent)
        self.assertIsInstance(location3.latitude, decimal.Decimal)
        self.assertIsInstance(location3.longitude, decimal.Decimal)

