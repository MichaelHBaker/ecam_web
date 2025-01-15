from django import forms
from .models import MeasurementCategory, MeasurementType, MeasurementUnit

class CSVUploadForm(forms.Form):
    csv_file = forms.FileField(
        label='Select a CSV file',
        help_text='File must be CSV format with category, optional type and unit columns.',
        widget=forms.FileInput(attrs={'accept': '.csv'}),
        allow_empty_file=True
    )

    def clean_csv_file(self):
        file = self.cleaned_data['csv_file']
        if not file.name.endswith('.csv'):
            raise forms.ValidationError('Please upload a valid CSV file')
        
        # Additional validation of file contents could go here
        # But that's probably better handled in the service layer
        return file