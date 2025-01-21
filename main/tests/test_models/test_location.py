from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from ..test_base import BaseAPITestCase
from ...models import Location, Measurement, Project, MeasurementUnit

class TestTreeItemMixin(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.location_url = reverse('location-list')
        self.measurement_url = reverse('measurement-list')
        self.project_url = reverse('project-list')

    def test_create_location(self):
        """Test creation of a location"""
        data = {
            'name': 'Test Location',
            'project': self.test_project.pk,
            'address': '123 Test St',
            'latitude': 45.5155,
            'longitude': -122.6789
        }
        response = self.client.post(self.location_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify location creation
        created_location = Location.objects.get(name='Test Location')
        self.assertEqual(created_location.project, self.test_project)
        self.assertEqual(created_location.address, '123 Test St')
        self.assertEqual(created_location.latitude, 45.5155)
        self.assertEqual(created_location.longitude, -122.6789)

    def test_location_required_fields(self):
        """Test validation of required fields"""
        # Missing project
        with self.assertRaises(ValidationError):
            Location(
                name='Incomplete Location',
                address='123 Test St'
            ).full_clean()

        # Missing name
        with self.assertRaises(ValidationError):
            Location(
                project=self.test_project,
                address='123 Test St'
            ).full_clean()

        # Missing address
        with self.assertRaises(ValidationError):
            Location(
                project=self.test_project,
                name='Incomplete Location'
            ).full_clean()

    def test_create_location_with_measurement(self):
        """Test creating a location and adding a measurement"""
        # Create location
        location = Location.objects.create(
            name='Measurement Location',
            project=self.test_project,
            address='456 Test Ave'
        )

        # Create measurement
        measurement = Measurement.objects.create(
            name='Test Measurement',
            location=location,
            type=self.pressure_type,
            unit=self.test_unit
        )

        # Verify relationships
        self.assertEqual(measurement.location, location)
        self.assertEqual(location.measurements.first(), measurement)

    def test_location_project_relationship(self):
        """Test location-project relationship"""
        # Verify existing test location
        existing_location = Location.objects.get(name="Industrial Facility")
        self.assertEqual(existing_location.project, self.test_project)

        # Create another location
        new_location = Location.objects.create(
            name='Another Location',
            project=self.test_project,
            address='789 Test Rd'
        )

        # Verify project's locations
        project_locations = self.test_project.locations.all()
        self.assertIn(existing_location, project_locations)
        self.assertIn(new_location, project_locations)

    def test_location_delete_cascade(self):
        """Test deleting a location cascades to measurements"""
        # Create location and measurement
        location = Location.objects.create(
            name='Cascade Test Location',
            project=self.test_project,
            address='321 Delete St'
        )

        measurement = Measurement.objects.create(
            name='Cascade Measurement',
            location=location,
            type=self.pressure_type,
            unit=self.test_unit
        )

        # Store IDs for verification
        location_id = location.id
        measurement_id = measurement.id
        unit_id = self.test_unit.id
        type_id = self.test_unit.type.id

        # Delete location
        location.delete()

        # Verify cascade
        self.assertFalse(Location.objects.filter(id=location_id).exists())
        self.assertFalse(Measurement.objects.filter(id=measurement_id).exists())

        # Verify measurement reference data is preserved
        self.assertTrue(MeasurementUnit.objects.filter(id=unit_id).exists())
        self.assertTrue(self.test_unit.type.__class__.objects.filter(id=type_id).exists())

    def test_location_coordinate_validation(self):
        """Test latitude and longitude validation"""
        # Valid coordinates
        location = Location.objects.create(
            name='Coordinate Test',
            project=self.test_project,
            address='123 Geo St',
            latitude=45.5155,
            longitude=-122.6789
        )
        self.assertEqual(location.latitude, 45.5155)
        self.assertEqual(location.longitude, -122.6789)

        # Optional coordinates
        location_no_coords = Location.objects.create(
            name='No Coordinate Location',
            project=self.test_project,
            address='456 Geo St'
        )
        self.assertIsNone(location_no_coords.latitude)
        self.assertIsNone(location_no_coords.longitude)