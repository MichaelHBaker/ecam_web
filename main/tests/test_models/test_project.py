# tests/test_models/test_project.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from datetime import date, timedelta
from ..test_base import BaseTestCase
from ...models import Project, Location, Measurement, MeasurementType

class TestProjectModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of project"""
        project = Project.objects.get(name="Energy Trust Production")
        expected = f"{project.name} ({project.get_project_type_display()})"
        self.assertEqual(str(project), expected)

    def test_project_as_root(self):
        """Test project functions correctly as root entity"""
        project = Project.objects.create(
            name="Root Project",
            project_type="Audit",
            start_date=date.today()
        )
        # Verify it can be created without dependencies
        self.assertIsNotNone(project.pk)
        # Verify hierarchy
        self.assertEqual(project.get_hierarchy(), project.name)
        # Verify it can have locations
        self.assertEqual(list(project.locations.all()), [])

    def test_project_independence(self):
        """Test project can exist and validate without dependencies"""
        project = Project(
            name="Independent Project",
            project_type="M&V",
            start_date=date.today()
        )
        # Shouldn't raise ValidationError
        project.full_clean()
        project.save()
        self.assertIsNotNone(project.pk)

    def test_invalid_project_type(self):
        """Test project type validation"""
        with self.assertRaises(ValidationError) as context:
            Project(
                name="Invalid Type Test",
                project_type="InvalidType",
                start_date=date.today()
            ).full_clean()
        self.assertIn('project_type', str(context.exception))

    def test_valid_project_types(self):
        """Test all valid project types are accepted"""
        for project_type, _ in Project.PROJECT_TYPES:
            project = Project(
                name=f"Project {project_type}",
                project_type=project_type,
                start_date=date.today()
            )
            try:
                project.full_clean()
            except ValidationError as e:
                self.fail(f"Project type {project_type} should be valid but raised: {e}")

    def test_date_validation(self):
        """Test start/end date validation"""
        start_date = date.today()
        with self.assertRaises(ValidationError) as context:
            Project(
                name="Invalid Dates Test",
                project_type="Audit",
                start_date=start_date,
                end_date=start_date - timedelta(days=1)  # End before start
            ).full_clean()
        self.assertIn('end_date', str(context.exception))

    def test_valid_date_ranges(self):
        """Test valid date ranges are accepted"""
        start_date = date.today()
        test_ranges = [
            (start_date, start_date),  # Same day
            (start_date, start_date + timedelta(days=30)),  # 30 days
            (start_date, None),  # No end date
            (None, None),  # No dates
        ]

        for start, end in test_ranges:
            project = Project(
                name=f"Project {start}-{end}",
                project_type="Audit",
                start_date=start,
                end_date=end
            )
            try:
                project.full_clean()
            except ValidationError as e:
                self.fail(f"Date range {start} to {end} should be valid but raised: {e}")

    def test_delete_cascade(self):
        """Test deleting project cascades to locations and measurements"""
        # Create a test project with a location and measurement
        project = Project.objects.create(
            name="Cascade Test Project",
            project_type="Audit",
            start_date=date.today()
        )
        
        location = Location.objects.create(
            project=project,
            name="Test Location",
            address="123 Test St"
        )
        
        measurement = Measurement.objects.create(
            location=location,
            name="Test Measurement",
            measurement_type=self.power_type
        )
        
        # Store IDs for later verification
        location_id = location.id
        measurement_id = measurement.id
        project_id = project.id
        measurement_type_id = self.power_type.id
        
        # Delete the project
        project.delete()
        
        # Verify everything is deleted
        self.assertFalse(
            Project.objects.filter(id=project_id).exists(),
            "Project should be deleted"
        )
        self.assertFalse(
            Location.objects.filter(id=location_id).exists(),
            "Location should be deleted via cascade"
        )
        self.assertFalse(
            Measurement.objects.filter(id=measurement_id).exists(),
            "Measurement should be deleted via cascade"
        )
        # Verify measurement type is NOT deleted (protected)
        self.assertTrue(
            MeasurementType.objects.filter(id=measurement_type_id).exists(),
            "MeasurementType should not be deleted"
        )

    def test_hierarchy_with_locations(self):
        """Test hierarchy string includes locations correctly"""
        # Get existing project
        project = Project.objects.get(name="BPA Custom")
        storage_location = Location.objects.get(name="Fish Storage Warehouse")
        office_location = Location.objects.get(name="Office Park II")
        
        # Verify locations' hierarchies include project
        storage_expected = f"{project.name} > {storage_location.name}"
        self.assertEqual(storage_location.get_hierarchy(), storage_expected)
        
        office_expected = f"{project.name} > {office_location.name}"
        self.assertEqual(office_location.get_hierarchy(), office_expected)

    def test_duplicate_name_allowed(self):
        """Test that projects can have duplicate names"""
        name = "Duplicate Test Project"
        project1 = Project.objects.create(
            name=name,
            project_type="Audit",
            start_date=date.today()
        )
        
        # Try to create another project with the same name
        project2 = Project(
            name=name,
            project_type="M&V",
            start_date=date.today()
        )
        
        try:
            project2.full_clean()
            project2.save()
        except ValidationError as e:
            self.fail("Should allow duplicate project names")