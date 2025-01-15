from django.test import TestCase, Client
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from ..test_base import BaseTestCase
from ...models import DataImport
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

    def test_valid_upload_with_categories(self):
        """Test uploading a valid CSV with category mappings"""
        data = [
            ['timestamp', 'location', 'category', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'pressure', '100.5'],
            ['2024-01-01 00:00:00', 'Test Location', 'flow', '72.0']
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

    def test_invalid_category(self):
        """Test uploading CSV with invalid category"""
        data = [
            ['timestamp', 'location', 'category', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'invalid_category', '100.5']
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
        self.assertIn('categories', response.json())

    def test_category_case_insensitive(self):
        """Test that category matching is case insensitive"""
        data = [
            ['timestamp', 'location', 'category', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'PRESSURE', '100.5'],
            ['2024-01-01 00:00:00', 'Test Location', 'Flow', '72.0']
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

    def test_missing_category_column(self):
        """Test uploading CSV without category column"""
        data = [
            ['timestamp', 'location', 'value'],  # Missing category
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
        self.assertIn('CSV must contain a category column', response.json()['error'])

    def test_import_status_tracking(self):
        """Test that import status is tracked with categories"""
        data = [
            ['timestamp', 'location', 'category', 'value'],
            ['2024-01-01 00:00:00', 'Test Location', 'pressure', '100.5']
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
        latest_import = DataImport.objects.latest('started_at')
        self.assertEqual(latest_import.status, 'completed')
        self.assertIn('categories', latest_import.error_log)
        self.assertIn('pressure', latest_import.error_log['categories'])

    def test_multiple_categories(self):
        """Test handling multiple categories in same upload"""
        data = [
            ['timestamp', 'location', 'category', 'value'],
            ['2024-01-01 00:00:00', 'Loc1', 'pressure', '100.5'],
            ['2024-01-01 00:00:00', 'Loc1', 'flow', '72.0'],
            ['2024-01-01 00:00:00', 'Loc2', 'pressure', '95.2'],
            ['2024-01-01 00:00:00', 'Loc2', 'flow', '74.5']
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
        latest_import = DataImport.objects.latest('started_at')
        stats = latest_import.error_log
        self.assertEqual(len(stats['categories']), 2)
        self.assertEqual(stats['categories']['pressure'], 2)
        self.assertEqual(stats['categories']['flow'], 2)

    def test_unit_type_columns(self):
        """Test handling of optional unit and type columns"""
        data = [
            ['timestamp', 'location', 'category', 'type', 'unit', 'value'],
            ['2024-01-01 00:00:00', 'Loc1', 'pressure', 'gauge', 'psi', '100.5'],
            ['2024-01-01 00:00:00', 'Loc1', 'pressure', 'gauge', 'kPa', '72.0'],
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

    def test_invalid_unit_type_combination(self):
        """Test validation of unit and type combinations"""
        data = [
            ['timestamp', 'location', 'category', 'type', 'unit', 'value'],
            ['2024-01-01 00:00:00', 'Loc1', 'pressure', 'gauge', 'invalid_unit', '100.5'],
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
        self.assertIn('Invalid unit', response.json()['error'])