"""
URL configuration for ecam_web project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from main import views

# Create a router and register our viewsets
router = routers.DefaultRouter()
router.register(r'clients', views.ClientViewSet)
router.register(r'projects', views.ProjectViewSet, basename='project')
router.register(r'locations', views.LocationViewSet, basename='location')
router.register(r'measurements', views.MeasurementViewSet, basename='measurement')
router.register(r'model-fields', views.ModelFieldsViewSet, basename='model-fields')  

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    path('excel-upload/', views.excel_upload, name='excel_upload'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('location/', views.location, name='location'),
    path('measurement/', views.measurement, name='measurement'),
    path('data/', views.data, name='data'),
    path('dictionary/', views.dictionary, name='dictionary'),
    path('api/', include(router.urls)),  
]