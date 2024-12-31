# tests/test_views/test_excel_upload.py
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
import os
from ..test_base import BaseTestCase

class TestExcelUploadView(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.upload_url = reverse('excel_upload')
        self.test_dir = os.path.join(os.path.dirname(__file__), 'test_files')
        os.makedirs(self.test_dir, exist_ok=True)

    def tearDown(self):
        # Clean up test files
        if os.path.exists(self.test_dir):
            for file in os.listdir(self.test_dir):
                os.remove(os.path.join(self.test_dir, file))
            os.rmdir(self.test_dir)

    def test_valid_upload(self):
        """Test uploading a valid CSV file"""
        content = (
            "Name,Age,City\n"
            "Alice,30,New York\n"
            "Bob,25,Los Angeles\n"
        ).encode('utf-8')
        csv_file = SimpleUploadedFile("test.csv", content, content_type="text/csv")
        
        data = {
            'csv_file': csv_file,
            'folder_path': self.test_dir,
            'workbook_name': 'test_output',
            'sheet_name': 'Sheet1'
        }
        
        response = self.client.post(self.upload_url, data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'success')
        
        # Verify Excel file was created
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, 'test_output.xlsx')))

    def test_missing_fields(self):
        """Test handling of missing required fields"""
        csv_file = SimpleUploadedFile("test.csv", b"test", content_type="text/csv")
        response = self.client.post(self.upload_url, {'csv_file': csv_file})
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_invalid_csv(self):
        """Test handling of invalid CSV file"""
        content = "Invalid,CSV\nMissing,Columns,Extra".encode('utf-8')
        csv_file = SimpleUploadedFile("test.csv", content, content_type="text/csv")
        
        data = {
            'csv_file': csv_file,
            'folder_path': self.test_dir,
            'workbook_name': 'test_output',
            'sheet_name': 'Sheet1'
        }
        
        response = self.client.post(self.upload_url, data)
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())