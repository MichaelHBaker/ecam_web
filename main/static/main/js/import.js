// Constants for UI element IDs and states
const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value;

class ImportManager {
    constructor(locationId) {
        this.locationId = locationId;
        this.importId = null;
        this.datasetId = null;
        this.status = 'idle';
        this.config = {};

        // Bind methods
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
        this.updateProgress = this.updateProgress.bind(this);
    }

    // Initialize UI elements
    async initialize() {
        this.initializeUI();
        this.attachEventListeners();
        return this;
    }

    initializeUI() {
        // Create container divs if they don't exist
        ['preview', 'progress', 'error', 'config'].forEach(type => {
            const containerId = `import-${type}-${this.locationId}`;
            if (!document.getElementById(containerId)) {
                const container = document.createElement('div');
                container.id = containerId;
                container.className = `import-${type}-container w3-margin-top`;
                container.style.display = 'none';
                document.getElementById(`import-main-${this.locationId}`).appendChild(container);
            }
        });

        // Initialize file input if needed
        const fileInput = document.getElementById(`file-input-${this.locationId}`);
        if (!fileInput) {
            const input = document.createElement('input');
            input.type = 'file';
            input.id = `file-input-${this.locationId}`;
            input.accept = '.csv,.txt';
            input.style.display = 'none';
            document.getElementById(`import-main-${this.locationId}`).appendChild(input);
        }
    }

    attachEventListeners() {
        // File input change handler
        const fileInput = document.getElementById(`file-input-${this.locationId}`);
        fileInput.addEventListener('change', this.handleFileSelect);

        // File drop zone
        const dropZone = document.getElementById(`import-dropzone-${this.locationId}`);
        if (dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            dropZone.addEventListener('dragover', () => {
                dropZone.classList.add('w3-pale-blue');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('w3-pale-blue');
            });

            dropZone.addEventListener('drop', (e) => {
                dropZone.classList.remove('w3-pale-blue');
                const dt = e.dataTransfer;
                const files = dt.files;
                
                if (files.length) {
                    fileInput.files = files;
                    this.handleFileSelect({ target: fileInput });
                }
            });
        }
    }

    // File handling
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.updateStatus('uploading');
            const result = await this.uploadFile(file);
            
            if (result.import_id) {
                this.importId = result.import_id;
                this.datasetId = result.dataset_id;
                await this.showPreview(result.preview_content);
                this.updateStatus('ready');
                
                // Start validation
                await this.validateImport();
            }
        } catch (error) {
            this.handleError('Upload failed', error);
        }
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('location_id', this.locationId);

        const response = await fetch('/api/imports/upload/', {
            method: 'POST',
            body: formData,
            headers: {
                'X-CSRFToken': CSRF_TOKEN
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        return await response.json();
    }

    // Preview handling
    async showPreview(content) {
        const container = document.getElementById(`import-preview-${this.locationId}`);
        if (!container) return;

        container.style.display = 'block';
        container.innerHTML = `
            <div class="w3-card w3-white">
                <div class="w3-bar w3-light-grey">
                    <div class="w3-bar-item">File Preview</div>
                    <button class="w3-bar-item w3-button w3-right" onclick="this.parentElement.parentElement.style.display='none'">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
                <div class="w3-container" style="max-height: 400px; overflow: auto; white-space: pre-wrap;">
                    ${content}
                </div>
            </div>
        `;
    }

    // Import validation
    async validateImport() {
        if (!this.importId) return;

        try {
            this.updateStatus('validating');
            const response = await fetch(`/api/imports/${this.importId}/validate/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': CSRF_TOKEN
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Validation failed: ${response.statusText}`);
            }

            const result = await response.json();
            this.showValidationResults(result.validation_results);
            this.updateStatus('validated');

            return result;
        } catch (error) {
            this.handleError('Validation failed', error);
            throw error;
        }
    }

    showValidationResults(results) {
        const container = document.getElementById(`import-config-${this.locationId}`);
        if (!container) return;

        // Create validation summary
        const summary = document.createElement('div');
        summary.className = 'w3-card w3-white w3-margin-top';
        summary.innerHTML = `
            <div class="w3-container">
                <h4>Validation Results</h4>
                <p>Total Columns: ${results.structure.total_columns}</p>
                <p>Total Rows: ${results.structure.total_rows}</p>
                ${results.validation_checks.warnings.length ? `
                    <div class="w3-panel w3-pale-yellow">
                        <h4>Warnings</h4>
                        <ul>
                            ${results.validation_checks.warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;

        container.style.display = 'block';
        container.appendChild(summary);
    }

    // Import processing
    async startImport() {
        if (!this.importId) return;

        try {
            this.updateStatus('processing');
            const response = await fetch(`/api/imports/${this.importId}/process/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': CSRF_TOKEN
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Import failed: ${response.statusText}`);
            }

            // Start progress monitoring
            this.monitorProgress();

        } catch (error) {
            this.handleError('Import failed', error);
            throw error;
        }
    }

    // Progress monitoring
    async monitorProgress() {
        if (!this.importId) return;

        const checkProgress = async () => {
            try {
                const response = await fetch(`/api/imports/${this.importId}/status/`, {
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error(`Status check failed: ${response.statusText}`);
                }

                const status = await response.json();
                this.updateProgress(status);

                if (status.status === 'completed') {
                    this.updateStatus('completed');
                    return;
                }

                if (status.status === 'failed') {
                    this.handleError('Import failed', new Error(status.errors?.join('\n')));
                    return;
                }

                // Continue monitoring
                setTimeout(checkProgress, 1000);

            } catch (error) {
                this.handleError('Progress check failed', error);
            }
        };

        checkProgress();
    }

    // Status and progress updates
    updateStatus(status, message = '') {
        this.status = status;
        const statusDisplay = document.getElementById(`import-status-${this.locationId}`);
        if (!statusDisplay) return;

        const statusConfig = {
            idle: { icon: 'bi-clock', class: 'w3-light-grey', text: 'Ready' },
            uploading: { icon: 'bi-cloud-upload', class: 'w3-pale-yellow', text: 'Uploading...' },
            validating: { icon: 'bi-check-circle', class: 'w3-pale-yellow', text: 'Validating...' },
            validated: { icon: 'bi-check-circle-fill', class: 'w3-pale-green', text: 'Validated' },
            processing: { icon: 'bi-gear', class: 'w3-pale-blue', text: 'Processing...' },
            completed: { icon: 'bi-check-circle-fill', class: 'w3-pale-green', text: 'Completed' },
            error: { icon: 'bi-exclamation-triangle-fill', class: 'w3-pale-red', text: message || 'Error' }
        };

        const config = statusConfig[status] || statusConfig.idle;
        statusDisplay.className = `w3-bar ${config.class}`;
        statusDisplay.innerHTML = `
            <div class="w3-bar-item">
                <i class="bi ${config.icon}"></i> ${config.text}
            </div>
        `;
    }

    updateProgress(status) {
        const progressBar = document.getElementById(`import-progress-${this.locationId}`);
        if (!progressBar) return;

        progressBar.style.display = 'block';
        const percent = status.progress.progress_percentage || 0;
        
        progressBar.innerHTML = `
            <div class="w3-container w3-blue" style="width:${percent}%">
                ${percent}%
            </div>
        `;

        // Update stats if available
        const statsContainer = document.getElementById(`import-stats-${this.locationId}`);
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="w3-container">
                    <p>Processed: ${status.progress.processed_rows} / ${status.progress.total_rows}</p>
                    <p>Success: ${status.progress.success_count}</p>
                    <p>Errors: ${status.progress.error_count}</p>
                </div>
            `;
        }
    }

    // Error handling
    handleError(context, error) {
        console.error(`${context}:`, error);
        
        const errorContainer = document.getElementById(`import-error-${this.locationId}`);
        if (!errorContainer) return;

        errorContainer.style.display = 'block';
        errorContainer.innerHTML = `
            <div class="w3-panel w3-pale-red w3-leftbar w3-border-red">
                <h3>Error</h3>
                <p>${context}: ${error.message}</p>
            </div>
        `;

        this.updateStatus('error', error.message);
    }

    // Cleanup
    destroy() {
        // Remove event listeners
        const fileInput = document.getElementById(`file-input-${this.locationId}`);
        if (fileInput) {
            fileInput.removeEventListener('change', this.handleFileSelect);
        }

        // Clear intervals/timeouts if any
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        // Reset state
        this.importId = null;
        this.datasetId = null;
        this.status = 'idle';
        this.config = {};
    }
}

export default ImportManager;