from django.test import TestCase, Client
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from ..test_base import BaseTestCase
from ...models import DataImport, MeasurementType
import json
import os
import csv
from io import StringIO

class TestExcelUpload(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.upload_url = reverse('excel_upload')
        self.client = Client()

    def create_test_csv(self, data):
        """Helper method to create a test CSV file"""
        output = StringIO()
        writer = csv.writer(output)
        for row in data:
            writer.writerow(row)
        return SimpleUploadedFile(
            "test.csv",
            output.getvalue().encode('utf-8'),
            content_type='text/csv'
        )

    def test_valid_upload_with_measurement_types(self):
        """Test uploading a valid CSV with measurement type mappings"""
        # Create CSV with measurement type columns
        data = [
            ['timestamp', 'location', 'measurement_type', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'power', '100.5'],
            ['2024-01-01 00:00:00', 'Test Location', 'temperature', '72.0']
        ]
        csv_file = self.create_test_csv(data)
        
        response = self.client.post(self.upload_url, {
            'csv_file': csv_file,
            'folder_path': '/tmp',
            'workbook_name': 'test_workbook',
            'sheet_name': 'Sheet1'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')

    def test_invalid_measurement_type(self):
        """Test uploading CSV with invalid measurement type"""
        data = [
            ['timestamp', 'location', 'measurement_type', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'invalid_type', '100.5']
        ]
        csv_file = self.create_test_csv(data)
        
        response = self.client.post(self.upload_url, {
            'csv_file': csv_file,
            'folder_path': '/tmp',
            'workbook_name': 'test_workbook',
            'sheet_name': 'Sheet1'
        })
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())
        self.assertIn('measurement_type', response.json()['error'])

    def test_measurement_type_case_insensitive(self):
        """Test that measurement type matching is case insensitive"""
        data = [
            ['timestamp', 'location', 'measurement_type', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'POWER', '100.5'],
            ['2024-01-01 00:00:00', 'Test Location', 'Temperature', '72.0']
        ]
        csv_file = self.create_test_csv(data)
        
        response = self.client.post(self.upload_url, {
            'csv_file': csv_file,
            'folder_path': '/tmp',
            'workbook_name': 'test_workbook',
            'sheet_name': 'Sheet1'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')

    def test_missing_measurement_type_column(self):
        """Test uploading CSV without measurement type column"""
        data = [
            ['timestamp', 'location', 'value'],  # Missing measurement_type
            ['2024-01-01 00:00:00', 'Test Location', '100.5']
        ]
        csv_file = self.create_test_csv(data)
        
        response = self.client.post(self.upload_url, {
            'csv_file': csv_file,
            'folder_path': '/tmp',
            'workbook_name': 'test_workbook',
            'sheet_name': 'Sheet1'
        })
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())
        self.assertIn('measurement_type', response.json()['error'])

    def test_import_status_tracking(self):
        """Test that import status is tracked with measurement types"""
        data = [
            ['timestamp', 'location', 'measurement_type', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'power', '100.5']
        ]
        csv_file = self.create_test_csv(data)
        
        response = self.client.post(self.upload_url, {
            'csv_file': csv_file,
            'folder_path': '/tmp',
            'workbook_name': 'test_workbook',
            'sheet_name': 'Sheet1'
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Check import record
        latest_import = DataImport.objects.latest('uploaded_at')
        self.assertEqual(latest_import.status, 'analyzed')
        self.assertIn('measurement_types', latest_import.stats)
        self.assertIn('power', latest_import.stats['measurement_types'])

    def test_multiple_measurement_types(self):
        """Test handling multiple measurement types in same upload"""
        data = [
            ['timestamp', 'location', 'measurement_type', 'value'],
            ['2024-01-01 00:00:00', 'Loc1', 'power', '100.5'],
            ['2024-01-01 00:00:00', 'Loc1', 'temperature', '72.0'],
            ['2024-01-01 00:00:00', 'Loc2', 'power', '95.2'],
            ['2024-01-01 00:00:00', 'Loc2', 'temperature', '74.5']
        ]
        csv_file = self.create_test_csv(data)
        
        response = self.client.post(self.upload_url, {
            'csv_file': csv_file,
            'folder_path': '/tmp',
            'workbook_name': 'test_workbook',
            'sheet_name': 'Sheet1'
        })
        
        self.assertEqual(response.status_code, 200)
        
        # Verify stats in import record
        latest_import = DataImport.objects.latest('uploaded_at')
        stats = latest_import.stats
        self.assertEqual(len(stats['measurement_types']), 2)
        self.assertEqual(stats['measurement_types']['power'], 2)
        self.assertEqual(stats['measurement_types']['temperature'], 2)

    def test_measurement_type_validation_rules(self):
        """Test validation rules for measurement type values"""
        test_cases = [
            {
                'value': '500',
                'type': 'power',
                'expected_valid': True
            },
            {
                'value': '-10',
                'type': 'power',
                'expected_valid': False  # Power shouldn't be negative
            },
            {
                'value': '72',
                'type': 'temperature',
                'expected_valid': True
            },
            {
                'value': 'invalid',
                'type': 'power',
                'expected_valid': False
            }
        ]
        
        for test_case in test_cases:
            data = [
                ['timestamp', 'location', 'measurement_type', 'value'],
                ['2024-01-01 00:00:00', 'Test Location', 
                 test_case['type'], test_case['value']]
            ]
            csv_file = self.create_test_csv(data)
            
            response = self.client.post(self.upload_url, {
                'csv_file': csv_file,
                'folder_path': '/tmp',
                'workbook_name': 'test_workbook',
                'sheet_name': 'Sheet1'
            })
            
            if test_case['expected_valid']:
                self.assertEqual(response.status_code, 200)
            else:
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.json())