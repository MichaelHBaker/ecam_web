from django import forms
from django.forms import modelformset_factory
from .models import Client, Project 

class CSVUploadForm(forms.Form):
    csv_file = forms.FileField(
        label='Select a CSV file',
        help_text='File must be CSV format.',
        widget=forms.FileInput(attrs={'accept': '.csv'}),
        allow_empty_file=True
    )

    def clean_csv_file(self):
        file = self.cleaned_data['csv_file']
        if not file.name.endswith('.csv'):
            raise forms.ValidationError('Please upload a valid CSV file')
        return file

ClientFormSet = modelformset_factory(
    Client,
    fields=('name', 'contact_email', 'phone_number'),  # Adjust fields as necessary
    extra=1,  # Adjust based on how many empty forms you want by default
    can_delete=True  # Optional: to allow deletion of clients directly from the formset
) 
ProjectFormSet = modelformset_factory(
    Project,
    fields=('name', 'client', 'project_type', 'start_date', 'end_date'),  # adjust the fields as needed
    extra=0
)