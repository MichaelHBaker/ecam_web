from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import (
    DataImport, ImportBatch, Location, Project,
    Dataset, DataSource
)
from .serializers import (
    DataImportSerializer, ImportBatchSerializer,
    DatasetSerializer
)
from .services.import_service import ImportService

class ImportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing data imports.
    Provides endpoints for file upload, validation, and processing.
    """
    queryset = DataImport.objects.all()
    serializer_class = DataImportSerializer
    permission_classes = [IsAuthenticated]
    import_service = ImportService()

    def get_queryset(self):
        """Filter imports by user access"""
        return DataImport.objects.filter(
            dataset__data_source__project__user_access__user=self.request.user,
            dataset__data_source__project__user_access__revoked_at__isnull=True
        ).select_related(
            'dataset',
            'dataset__data_source',
            'created_by'
        ).prefetch_related(
            'batches'
        )

    @action(detail=False, methods=['POST'])
    def upload(self, request):
        """
        Handle file upload and initial processing.
        
        Expected payload:
        - file: The file to upload
        - location_id: ID of the location for this import
        """
        try:
            # Validate request
            if 'file' not in request.FILES:
                return Response(
                    {'error': 'No file provided'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            location_id = request.data.get('location_id')
            if not location_id:
                return Response(
                    {'error': 'Location ID is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Verify location access
            location = get_object_or_404(Location, id=location_id)
            project = location.project
            if not (request.user == project.owner or project.has_user_access(request.user)):
                return Response(
                    {'error': 'No access to this location'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Process upload
            data_import, preview_info = self.import_service.process_upload(
                request.FILES['file'],
                location_id,
                request.user
            )

            # Prepare response
            response_data = {
                'import_id': data_import.id,
                'dataset_id': data_import.dataset.id,
                'status': data_import.status,
                **preview_info
            }

            return Response(response_data, status=status.HTTP_201_CREATED)

        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Upload failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['POST'])
    def validate(self, request, pk=None):
        """
        Validate import configuration and data.
        
        Optional parameters:
        - validation_type: Type of validation to perform (basic, full)
        """
        try:
            data_import = self.get_object()
            
            # Check if import exists and is in valid state
            if data_import.status in ['completed', 'failed']:
                return Response(
                    {'error': f'Import is already {data_import.status}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Run validation
            validation_results = self.import_service.validate_import(pk)

            return Response({
                'import_id': data_import.id,
                'status': data_import.status,
                'validation_results': validation_results
            })

        except DataImport.DoesNotExist:
            return Response(
                {'error': 'Import not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Validation failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['POST'])
    def configure(self, request, pk=None):
        """
        Update import configuration.
        
        Expected payload:
        - column_mappings: Dict mapping column indices to measurement IDs
        - options: Dict of import options (delimiter, timezone, etc.)
        """
        try:
            data_import = self.get_object()
            
            if data_import.status not in ['analyzing', 'validated']:
                return Response(
                    {'error': 'Import must be in analyzing or validated state'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update configuration
            config = {
                'column_mappings': request.data.get('column_mappings', {}),
                'options': request.data.get('options', {})
            }
            
            data_import.import_config.update(config)
            data_import.save()

            return Response({
                'import_id': data_import.id,
                'status': data_import.status,
                'config': data_import.import_config
            })

        except Exception as e:
            return Response(
                {'error': f'Configuration update failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['POST'])
    def process(self, request, pk=None):
        """
        Start or resume import processing.
        
        Optional parameters:
        - batch_size: Number of rows to process per batch
        """
        try:
            data_import = self.get_object()
            
            # Validate import state
            if data_import.status == 'completed':
                return Response(
                    {'error': 'Import is already completed'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            if data_import.status == 'processing':
                return Response(
                    {'error': 'Import is already processing'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Start processing
            batch_size = request.data.get('batch_size', 1000)
            self.import_service.process_import(pk, batch_size)

            return Response({
                'import_id': data_import.id,
                'status': 'processing',
                'message': 'Import processing started'
            })

        except Exception as e:
            return Response(
                {'error': f'Processing failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['GET'])
    def status(self, request, pk=None):
        """Get detailed import status and progress"""
        try:
            data_import = self.get_object()
            
            response_data = {
                'status': data_import.status,
                'progress': {
                    'processed_rows': data_import.processed_rows or 0,
                    'total_rows': data_import.total_rows or 0,
                    'error_count': data_import.error_count or 0,
                    'success_count': data_import.success_count or 0,
                    'progress_percentage': round(
                        (data_import.processed_rows or 0) / 
                        (data_import.total_rows or 1) * 100,
                        2
                    )
                },
                'timing': {
                    'started_at': data_import.started_at,
                    'completed_at': data_import.completed_at,
                    'elapsed_time': (
                        data_import.completed_at - data_import.started_at
                        if data_import.completed_at and data_import.started_at
                        else None
                    )
                }
            }

            # Add error information if present
            if data_import.error_log:
                response_data['errors'] = data_import.error_log

            # Add batch information
            latest_batches = data_import.batches.order_by('-batch_number')[:5]
            response_data['latest_batches'] = ImportBatchSerializer(
                latest_batches,
                many=True
            ).data

            return Response(response_data)

        except Exception as e:
            return Response(
                {'error': f'Status check failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['POST'])
    def cancel(self, request, pk=None):
        """Cancel an in-progress import"""
        try:
            data_import = self.get_object()
            
            if data_import.status not in ['processing', 'analyzing', 'validating']:
                return Response(
                    {'error': f'Import cannot be cancelled in {data_import.status} state'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update status and add cancellation info
            data_import.status = 'cancelled'
            data_import.error_log = {
                'cancelled_by': request.user.username,
                'cancelled_at': datetime.now().isoformat(),
                'reason': request.data.get('reason', 'User cancelled import')
            }
            data_import.save()

            return Response({
                'status': 'cancelled',
                'message': 'Import cancelled successfully'
            })

        except Exception as e:
            return Response(
                {'error': f'Cancellation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ImportBatchViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing import batch details.
    Read-only as batches are managed by the import process.
    """
    serializer_class = ImportBatchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filter batches by import ID and user access"""
        import_id = self.kwargs.get('import_pk')
        if not import_id:
            return ImportBatch.objects.none()

        return ImportBatch.objects.filter(
            data_import_id=import_id,
            data_import__dataset__data_source__project__user_access__user=self.request.user
        ).select_related('data_import')