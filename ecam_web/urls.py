"""
URL configuration for ecam_web project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


from rest_framework import routers
from main import views


# Create a router and register our viewsets
router = routers.DefaultRouter()
router.register(r'projects', views.ProjectViewSet, basename='project')
router.register(r'locations', views.LocationViewSet, basename='location')
router.register(r'measurements', views.MeasurementViewSet, basename='measurement')
router.register(r'model-fields', views.ModelFieldsViewSet, basename='model-fields')  

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    path('excel-upload/', views.excel_upload, name='excel_upload'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('project/', views.project, name='project'),
    path('measurement/', views.measurement, name='measurement'),
    path('data/', views.data, name='data'),
    path('model/', views.model, name='model'),
    path('api/data-imports/', views.create_data_import, name='api-data-imports'),
    path('api/data-imports/<int:import_id>/', views.get_data_import, name='api-data-import-detail'),
    path('api/', include(router.urls)),
    path('api/fields/', views.ModelFieldsViewSet.as_view({'get': 'list'}), name='field-definitions'),
    path('api/fields/validation/', views.ModelFieldsViewSet.as_view({'get': 'validation_rules'}), name='validation-rules'),
    path('api/fields/dependencies/', views.ModelFieldsViewSet.as_view({'get': 'dependencies'}), name='field-dependencies'),

]  + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)