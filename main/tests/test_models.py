from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from django.db import transaction
from datetime import date, timedelta
from decimal import Decimal
from ..models import Client, Project, Location, Measurement

class ClientModelTests(TestCase):
    """Tests for the Client model"""
    
    def setUp(self):
        self.valid_data = {
            'name': 'Test Client',
            'contact_email': 'valid@test.com',
            'phone_number': '123-456-7890'
        }

    def test_creation_and_str(self):
        """Test basic creation and string representation"""
        client = Client.objects.create(**self.valid_data)
        self.assertEqual(str(client), 'Test Client')

    def test_unique_name_constraint(self):
        """Test that client names must be unique"""
        Client.objects.create(**self.valid_data)
        
        # Try to create another client with the same name
        duplicate_data = self.valid_data.copy()
        duplicate_data['contact_email'] = 'other@test.com'
        
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Client.objects.create(**duplicate_data)

    def test_email_validation(self):
        """Test email field validation"""
        invalid_data = self.valid_data.copy()
        invalid_data['contact_email'] = 'not-an-email'
        
        client = Client(**invalid_data)
        with self.assertRaises(ValidationError):
            client.full_clean()

    def test_cascading_delete(self):
        """Test that deleting a client cascades to related objects"""
        client = Client.objects.create(**self.valid_data)
        project = Project.objects.create(
            name='Test Project',
            client=client,
            project_type='Audit',
            start_date=date.today()
        )
        
        self.assertEqual(Project.objects.count(), 1)
        client.delete()
        self.assertEqual(Project.objects.count(), 0)


class ProjectModelTests(TestCase):
    """Tests for the Project model"""

    def setUp(self):
        self.client = Client.objects.create(
            name='Test Client',
            contact_email='test@test.com'
        )
        self.valid_data = {
            'name': 'Test Project',
            'client': self.client,
            'project_type': 'Audit',
            'start_date': date.today(),
            'end_date': date.today() + timedelta(days=30)
        }

    def test_creation_and_str(self):
        """Test basic creation and string representation"""
        project = Project.objects.create(**self.valid_data)
        expected_str = f"{project.name} ({project.project_type})"
        self.assertEqual(str(project), expected_str)

    def test_project_type_validation(self):
        """Test project type choices validation"""
        invalid_data = self.valid_data.copy()
        invalid_data['project_type'] = 'InvalidType'
        
        project = Project(**invalid_data)
        with self.assertRaises(ValidationError):
            project.full_clean()

    def test_date_validation(self):
        """Test start/end date validation"""
        invalid_data = self.valid_data.copy()
        invalid_data['end_date'] = date.today() - timedelta(days=1)
        
        project = Project(**invalid_data)
        with self.assertRaises(ValidationError):
            project.full_clean()

    def test_cascading_delete(self):
        """Test that deleting a project cascades to related objects"""
        project = Project.objects.create(**self.valid_data)
        location = Location.objects.create(
            name='Test Location',
            project=project,
            address='123 Test St'
        )
        
        self.assertEqual(Location.objects.count(), 1)
        project.delete()
        self.assertEqual(Location.objects.count(), 0)


class LocationModelTests(TestCase):
    """Tests for the Location model"""

    def setUp(self):
        self.client = Client.objects.create(
            name='Test Client',
            contact_email='test@test.com'
        )
        self.project = Project.objects.create(
            name='Test Project',
            client=self.client,
            project_type='Audit',
            start_date=date.today()
        )
        self.valid_data = {
            'name': 'Test Location',
            'project': self.project,
            'address': '123 Test St',
            'latitude': Decimal('45.4215'),
            'longitude': Decimal('-75.6972')
        }

    def test_creation_and_str(self):
        """Test basic creation and string representation"""
        location = Location.objects.create(**self.valid_data)
        expected_str = f"{location.name} - Project: {location.project.name}"
        self.assertEqual(str(location), expected_str)

    def test_coordinate_validation(self):
        """Test coordinate validation"""
        invalid_data = self.valid_data.copy()
        invalid_data['latitude'] = Decimal('91.0')
        
        location = Location(**invalid_data)
        with self.assertRaises(ValidationError):
            location.full_clean()

        invalid_data['latitude'] = Decimal('45.0')
        invalid_data['longitude'] = Decimal('181.0')
        
        location = Location(**invalid_data)
        with self.assertRaises(ValidationError):
            location.full_clean()

    def test_hierarchy_validation(self):
        """Test parent-child relationship validation"""
        parent = Location.objects.create(**self.valid_data)
        
        # Valid child creation
        child_data = self.valid_data.copy()
        child_data['name'] = 'Child Location'
        child_data['parent'] = parent
        child = Location.objects.create(**child_data)
        
        self.assertEqual(child.parent, parent)
        self.assertIn(child, parent.children.all())

        # Test self-reference prevention
        parent.parent = parent
        with self.assertRaises(ValidationError):
            parent.full_clean()

    def test_cascading_delete(self):
        """Test that deleting a location cascades to related objects"""
        location = Location.objects.create(**self.valid_data)
        measurement = Measurement.objects.create(
            name='Test Measurement',
            location=location,
            measurement_type='power'
        )
        
        self.assertEqual(Measurement.objects.count(), 1)
        location.delete()
        self.assertEqual(Measurement.objects.count(), 0)


class MeasurementModelTests(TestCase):
    """Tests for the Measurement model"""

    def setUp(self):
        self.client = Client.objects.create(
            name='Test Client',
            contact_email='test@test.com'
        )
        self.project = Project.objects.create(
            name='Test Project',
            client=self.client,
            project_type='Audit',
            start_date=date.today()
        )
        self.location = Location.objects.create(
            name='Test Location',
            project=self.project,
            address='123 Test St'
        )
        self.valid_data = {
            'name': 'Test Measurement',
            'location': self.location,
            'measurement_type': 'power',
            'description': 'Test measurement description'
        }

    def test_creation_and_str(self):
        """Test basic creation and string representation"""
        measurement = Measurement.objects.create(**self.valid_data)
        expected_str = f"{measurement.name} ({measurement.get_measurement_type_display()})"
        self.assertEqual(str(measurement), expected_str)

    def test_measurement_type_validation(self):
        """Test measurement type choices validation"""
        invalid_data = self.valid_data.copy()
        invalid_data['measurement_type'] = 'invalid_type'
        
        measurement = Measurement(**invalid_data)
        with self.assertRaises(ValidationError):
            measurement.full_clean()

    def test_location_relationship(self):
        """Test relationship with location"""
        measurement = Measurement.objects.create(**self.valid_data)
        self.assertEqual(measurement.location, self.location)
        self.assertIn(measurement, self.location.measurements.all())