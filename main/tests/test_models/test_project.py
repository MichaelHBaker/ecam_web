# tests/test_models/test_project.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from datetime import date, timedelta
from ..test_base import BaseTestCase
from ...models import Project, Location, Measurement, MeasurementUnit

class TestProjectModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of project"""
        project = Project.objects.get(name="Energy Trust Production")
        expected = f"{project.name} ({project.get_project_type_display()})"
        self.assertEqual(str(project), expected)

    def test_project_validation(self):
        """Test project basic validation"""
        project = Project(
            name="Independent Project",
            project_type="M&V",
            start_date=date.today()
        )
        project.full_clean()  # Shouldn't raise ValidationError
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
                project.save()
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
                project.save()
            except ValidationError as e:
                self.fail(f"Date range {start} to {end} should be valid but raised: {e}")

    def test_delete_cascade(self):
        """Test deleting project cascades to locations and measurements but preserves units"""
        # Create a test project with location and measurement
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
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        # Store IDs for verification
        location_id = location.id
        measurement_id = measurement.id
        project_id = project.id
        unit_id = self.test_unit.id
        type_id = self.test_unit.type.id
        category_id = self.test_unit.type.category.id
        
        # Delete the project
        project.delete()
        
        # Verify project items are deleted
        self.assertFalse(Project.objects.filter(id=project_id).exists())
        self.assertFalse(Location.objects.filter(id=location_id).exists())
        self.assertFalse(Measurement.objects.filter(id=measurement_id).exists())
        
        # Verify measurement hierarchy items are preserved
        self.assertTrue(MeasurementUnit.objects.filter(id=unit_id).exists())
        self.assertTrue(self.test_unit.type.__class__.objects.filter(id=type_id).exists())
        self.assertTrue(self.test_unit.type.category.__class__.objects.filter(id=category_id).exists())

    def test_duplicate_name_allowed(self):
        """Test that projects can have duplicate names"""
        name = "Duplicate Test Project"
        project1 = Project.objects.create(
            name=name,
            project_type="Audit",
            start_date=date.today()
        )
        
        # Try to create another project with the same name
        try:
            project2 = Project(
                name=name,
                project_type="M&V",
                start_date=date.today()
            )
            project2.full_clean()
            project2.save()
        except ValidationError as e:
            self.fail("Should allow duplicate project names")