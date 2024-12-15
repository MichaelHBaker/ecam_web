from django import forms
from django.forms import modelformset_factory
from .models import Client, Project, Location, Measurement

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

class ClientNameForm(forms.ModelForm):
    class Meta:
        model = Client
        fields = ['name']

class ClientForm(forms.ModelForm):
    class Meta:
        model = Client
        fields = '__all__'

class ProjectForm(forms.ModelForm):
    class Meta:
        model = Project
        fields = '__all__'

class LocationForm(forms.ModelForm):
    class Meta:
        model = Location
        fields = '__all__'

class MeasurementForm(forms.ModelForm):
    class Meta:
        model = Measurement
        fields = '__all__'
