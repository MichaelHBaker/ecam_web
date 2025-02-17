// import.js
// Enhanced import management module

import { State } from './state.js';
import { NotificationUI } from './ui.js';
import { API } from './api.js';

const IMPORT_STATE_KEY = 'import_state';

/**
 * Enhanced Import Manager class
 */
class ImportManager {
    /**
     * Create an Import Manager instance
     * @param {string} locationId - Location identifier
     */
    constructor(locationId) {
        this.locationId = locationId;
        this.importId = null;
        this.datasetId = null;
        this.status = 'idle';
        this.config = {};
        this.fileValidation = {
            maxSize: 50 * 1024 * 1024, // 50MB
            allowedTypes: ['text/csv', 'application/vnd.ms-excel'],
            allowedExtensions: ['.csv', '.txt']
        };

        // Bind methods
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
        this.updateProgress = this.updateProgress.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    /**
     * Initialize import manager
     * @returns {Promise<ImportManager>} Initialized instance
     */
    async initialize() {
        try {
            // Initialize UI elements
            this.initializeUI();
            
            // Set up event listeners
            this.attachEventListeners();

            // Initialize import state
            this.initializeState();

            return this;
        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize UI elements
     * @private
     */
    initializeUI() {
        // Create container divs if they don't exist
        const containers = ['preview', 'progress', 'error', 'config'];
        
        containers.forEach(type => {
            const containerId = `import-${type}-${this.locationId}`;
            if (!document.getElementById(containerId)) {
                const container = document.createElement('div');
                container.id = containerId;
                container.className = `import-${type}-container w3-margin-top`;
                container.style.display = 'none';
                
                const mainContainer = document.getElementById(`import-main-${this.locationId}`);
                if (mainContainer) {
                    mainContainer.appendChild(container);
                }
            }
        });

        // Initialize file input
        this.initializeFileInput();

        // Initialize drop zone
        this.initializeDropZone();
    }

    /**
     * Initialize file input
     * @private
     */
    initializeFileInput() {
        const fileInput = document.getElementById(`file-input-${this.locationId}`);
        if (!fileInput) {
            const input = document.createElement('input');
            input.type = 'file';
            input.id = `file-input-${this.locationId}`;
            input.accept = this.fileValidation.allowedExtensions.join(',');
            input.style.display = 'none';
            
            const mainContainer = document.getElementById(`import-main-${this.locationId}`);
            if (mainContainer) {
                mainContainer.appendChild(input);
            }
        }
    }

    /**
     * Initialize drop zone
     * @private
     */
    initializeDropZone() {
        const dropZone = document.getElementById(`import-dropzone-${this.locationId}`);
        if (!dropZone) return;

        // Add visual cues
        dropZone.innerHTML = `
            <div class="w3-padding w3-center">
                <i class="bi bi-cloud-upload w3-jumbo"></i>
                <p>Drag and drop files here or click to select</p>
                <p class="w3-small w3-text-grey">
                    Supported formats: ${this.fileValidation.allowedExtensions.join(', ')}
                </p>
            </div>
        `;

        // Add styling
        dropZone.classList.add('w3-border', 'w3-border-dashed', 'w3-round');
        dropZone.style.minHeight = '200px';
        dropZone.style.display = 'flex';
        dropZone.style.alignItems = 'center';
        dropZone.style.justifyContent = 'center';
        dropZone.style.cursor = 'pointer';
        dropZone.style.transition = 'all 0.3s ease';
    }

    /**
     * Initialize import state
     * @private
     */
    initializeState() {
        const initialState = {
            sourceInfo: {
                type: null,
                status: 'initializing',
                streamInfo: {
                    totalSize: null,
                    processedSize: 0,
                    sampleSize: 1000,
                    hasMore: true,
                    position: 0
                }
            },
            importConfig: null,
            typeInfo: null,
            mappingInfo: null,
            preview: null,
            dataset: null,
            error: null,
            lastUpdate: new Date()
        };

        // Update local state
        Object.assign(this, {
            state: initialState,
            status: 'initialized'
        });

        // Update global state
        State.update(IMPORT_STATE_KEY, {
            [`location_${this.locationId}`]: initialState
        });
    }

    /**
     * Attach event listeners
     * @private
     */
    attachEventListeners() {
        // File input change handler
        const fileInput = document.getElementById(`file-input-${this.locationId}`);
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect);
        }

        // Drop zone events
        const dropZone = document.getElementById(`import-dropzone-${this.locationId}`);
        if (dropZone) {
            // Prevent default behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            // Visual feedback
            dropZone.addEventListener('dragenter', () => {
                dropZone.classList.add('w3-pale-blue');
                this.updateStatus('ready');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('w3-pale-blue');
            });

            // Handle drops
            dropZone.addEventListener('drop', (e) => {
                dropZone.classList.remove('w3-pale-blue');
                const dt = e.dataTransfer;
                const files = dt.files;
                
                if (files.length) {
                    const fileInput = document.getElementById(`file-input-${this.locationId}`);
                    if (fileInput) {
                        fileInput.files = files;
                        this.handleFileSelect({ target: fileInput });
                    }
                }
            });

            // Click to select
            dropZone.addEventListener('click', () => {
                const fileInput = document.getElementById(`file-input-${this.locationId}`);
                if (fileInput) {
                    fileInput.click();
                }
            });
        }
    }

    /**
     * Update import manager status
     * @param {string} status - New status
     * @param {string} [message] - Optional status message
     */
    updateStatus(status, message = '') {
        this.status = status;
        
        // Update UI status
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

        // Update state
        State.update(IMPORT_STATE_KEY, {
            [`location_${this.locationId}`]: {
                ...this.state,
                status,
                statusMessage: message,
                lastUpdate: new Date()
            }
        });
    }
    // import.js - Part 2
// File handling and validation

    /**
     * Handle file selection
     * @param {Event} event - File input change event
     */
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Validate file
            const validationResult = this.validateFile(file);
            if (!validationResult.valid) {
                throw new Error(validationResult.error);
            }

            // Update status and UI
            this.updateStatus('uploading');
            this.showFileInfo(file);

            // Upload file
            const result = await this.uploadFile(file);
            
            if (result.import_id) {
                this.importId = result.import_id;
                this.datasetId = result.dataset_id;
                
                // Show preview
                await this.showPreview(result.preview_content);
                this.updateStatus('ready');
                
                // Start validation
                await this.validateImport();
            }

        } catch (error) {
            this.handleError('File Selection Error', error);
        }
    }

    /**
     * Validate file before upload
     * @param {File} file - File to validate
     * @returns {Object} Validation result
     */
    validateFile(file) {
        try {
            // Size validation
            if (file.size > this.fileValidation.maxSize) {
                const maxSizeMB = Math.round(this.fileValidation.maxSize / (1024 * 1024));
                return {
                    valid: false,
                    error: `File size exceeds ${maxSizeMB}MB limit`
                };
            }

            // Type validation
            if (!this.fileValidation.allowedTypes.includes(file.type)) {
                return {
                    valid: false,
                    error: 'Invalid file type. Please upload a CSV file.'
                };
            }

            // Extension validation
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            if (!this.fileValidation.allowedExtensions.includes(extension)) {
                return {
                    valid: false,
                    error: `Invalid file extension. Allowed: ${this.fileValidation.allowedExtensions.join(', ')}`
                };
            }

            return { valid: true };

        } catch (error) {
            return {
                valid: false,
                error: `Validation error: ${error.message}`
            };
        }
    }

    /**
     * Upload file to server
     * @param {File} file - File to upload
     * @returns {Promise} Upload result
     */
    async uploadFile(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('location_id', this.locationId);

            const response = await API.DataImports.create(this.locationId, file);
            
            if (!response.import_id) {
                throw new Error('Invalid server response');
            }

            return response;

        } catch (error) {
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    /**
     * Show file information in UI
     * @param {File} file - Uploaded file
     */
    showFileInfo(file) {
        const container = document.getElementById(`file-display-${this.locationId}`);
        if (!container) return;

        // Format file size
        const size = this.formatFileSize(file.size);

        container.innerHTML = `
            <div class="w3-display-container w3-padding">
                <i class="bi bi-file-earmark-text"></i>
                <span class="w3-margin-left">${file.name}</span>
                <span class="w3-text-grey w3-small w3-margin-left">${size}</span>
                <button onclick="this.remove()" class="w3-button w3-hover-light-grey w3-display-right">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `;

        container.style.display = 'block';
    }

    /**
     * Show file preview
     * @param {string} content - File preview content
     */
    async showPreview(content) {
        const container = document.getElementById(`import-preview-${this.locationId}`);
        if (!container) return;

        try {
            // Create preview container
            container.innerHTML = `
                <div class="w3-card w3-white">
                    <div class="w3-bar w3-light-grey">
                        <div class="w3-bar-item">File Preview</div>
                        <button class="w3-bar-item w3-button w3-right" 
                                onclick="document.getElementById('import-preview-${this.locationId}').style.display='none'">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                    <div class="w3-container preview-content" style="max-height: 400px; overflow: auto;">
                        <table class="w3-table w3-striped w3-bordered">
                            ${await this.formatPreviewContent(content)}
                        </table>
                    </div>
                </div>
            `;

            container.style.display = 'block';

            // Update state
            this.state.preview = {
                content: content,
                timestamp: new Date()
            };

            State.update(IMPORT_STATE_KEY, {
                [`location_${this.locationId}`]: this.state
            });

        } catch (error) {
            this.handleError('Preview Error', error);
        }
    }

    /**
     * Format preview content as HTML table
     * @private
     * @param {string} content - Raw preview content
     * @returns {Promise<string>} Formatted HTML
     */
    async formatPreviewContent(content) {
        try {
            // Parse CSV content
            const rows = await this.parseCSV(content);
            if (!rows || rows.length === 0) {
                return '<tr><td>No data available</td></tr>';
            }

            // Generate table header
            const headers = Object.keys(rows[0]);
            const headerRow = `
                <tr class="w3-light-grey">
                    ${headers.map(header => `
                        <th class="w3-padding-small">${header}</th>
                    `).join('')}
                </tr>
            `;

            // Generate table rows
            const dataRows = rows.slice(0, 10).map(row => `
                <tr>
                    ${headers.map(header => `
                        <td class="w3-padding-small">${row[header] || ''}</td>
                    `).join('')}
                </tr>
            `).join('');

            return headerRow + dataRows;

        } catch (error) {
            throw new Error(`Preview formatting failed: ${error.message}`);
        }
    }

    /**
     * Parse CSV content
     * @private
     * @param {string} content - CSV content
     * @returns {Promise<Array>} Parsed data
     */
    async parseCSV(content) {
        return new Promise((resolve, reject) => {
            Papa.parse(content, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`CSV parsing failed: ${results.errors[0].message}`));
                    } else {
                        resolve(results.data);
                    }
                },
                error: (error) => {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                }
            });
        });
    }

    /**
     * Format file size for display
     * @private
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
    // import.js - Part 3
// Import validation, processing, and cleanup

    /**
     * Validate import
     * @returns {Promise<Object>} Validation results
     */
    async validateImport() {
        if (!this.importId) {
            throw new Error('No active import');
        }

        try {
            this.updateStatus('validating');
            
            const response = await API.DataImports.get(this.importId);
            
            if (response.status === 'failed') {
                throw new Error(response.error || 'Validation failed');
            }

            await this.showValidationResults(response.validation_results);
            this.updateStatus('validated');

            return response;

        } catch (error) {
            this.handleError('Validation Error', error);
            throw error;
        }
    }

    /**
     * Show validation results
     * @param {Object} results - Validation results
     */
    async showValidationResults(results) {
        const container = document.getElementById(`import-config-${this.locationId}`);
        if (!container) return;

        // Create validation summary
        const summary = document.createElement('div');
        summary.className = 'w3-card w3-white w3-margin-top';
        
        summary.innerHTML = `
            <div class="w3-container">
                <h4>Validation Results</h4>
                
                <div class="w3-section">
                    <h5>File Structure</h5>
                    <div class="w3-row-padding">
                        <div class="w3-half">
                            <p>Total Columns: ${results.structure.total_columns}</p>
                            <p>Total Rows: ${results.structure.total_rows}</p>
                        </div>
                        <div class="w3-half">
                            <p>Header Row: ${results.structure.header_row || 'Not detected'}</p>
                            <p>Data Format: ${results.structure.format || 'Unknown'}</p>
                        </div>
                    </div>
                </div>

                ${results.validation_checks.warnings.length ? `
                    <div class="w3-panel w3-pale-yellow">
                        <h5>Warnings</h5>
                        <ul class="w3-ul">
                            ${results.validation_checks.warnings.map(w => `
                                <li class="w3-padding-small">
                                    <i class="bi bi-exclamation-triangle"></i>
                                    ${w}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}

                ${results.validation_checks.recommendations.length ? `
                    <div class="w3-panel w3-pale-blue">
                        <h5>Recommendations</h5>
                        <ul class="w3-ul">
                            ${results.validation_checks.recommendations.map(r => `
                                <li class="w3-padding-small">
                                    <i class="bi bi-info-circle"></i>
                                    ${r}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;

        container.style.display = 'block';
        container.appendChild(summary);

        // Update state
        this.state.validationResults = results;
        State.update(IMPORT_STATE_KEY, {
            [`location_${this.locationId}`]: this.state
        });
    }

    /**
     * Start import processing
     * @returns {Promise<void>}
     */
    async startImport() {
        if (!this.importId) {
            throw new Error('No active import');
        }

        try {
            this.updateStatus('processing');
            
            const response = await API.DataImports.processBatch(
                this.importId,
                this.config,
                { start: true }
            );

            if (response.status === 'failed') {
                throw new Error(response.error || 'Import failed to start');
            }

            // Start progress monitoring
            this.monitorProgress();

        } catch (error) {
            this.handleError('Import Start Error', error);
            throw error;
        }
    }

    /**
     * Monitor import progress
     * @private
     */
    async monitorProgress() {
        if (!this.importId) return;

        const checkProgress = async () => {
            try {
                const response = await API.DataImports.get(this.importId);

                this.updateProgress(response);

                if (response.status === 'completed') {
                    this.updateStatus('completed');
                    return;
                }

                if (response.status === 'failed') {
                    this.handleError('Import Failed', new Error(response.errors?.join('\n')));
                    return;
                }

                // Continue monitoring
                setTimeout(checkProgress, 1000);

            } catch (error) {
                this.handleError('Progress Check Error', error);
            }
        };

        checkProgress();
    }

    /**
     * Update progress display
     * @param {Object} status - Progress status
     */
    updateProgress(status) {
        const progressBar = document.getElementById(`import-progress-${this.locationId}`);
        const statsContainer = document.getElementById(`import-stats-${this.locationId}`);
        
        if (!progressBar || !statsContainer) return;

        try {
            // Update progress bar
            const percent = status.progress.progress_percentage || 0;
            
            progressBar.style.display = 'block';
            progressBar.innerHTML = `
                <div class="w3-container w3-blue" style="width:${percent}%">
                    ${percent}%
                </div>
            `;

            // Update statistics
            statsContainer.innerHTML = `
                <div class="w3-container">
                    <div class="w3-row-padding">
                        <div class="w3-third">
                            <p>Processed: ${status.progress.processed_rows} / ${status.progress.total_rows}</p>
                        </div>
                        <div class="w3-third">
                            <p>Success: ${status.progress.success_count}</p>
                        </div>
                        <div class="w3-third">
                            <p>Errors: ${status.progress.error_count}</p>
                        </div>
                    </div>
                    ${status.progress.error_count > 0 ? `
                        <div class="w3-panel w3-pale-red">
                            <p>Last Error: ${status.progress.last_error || 'Unknown error'}</p>
                        </div>
                    ` : ''}
                </div>
            `;

            // Update state
            this.state.progress = status.progress;
            State.update(IMPORT_STATE_KEY, {
                [`location_${this.locationId}`]: this.state
            });

        } catch (error) {
            this.handleError('Progress Update Error', error);
        }
    }

    /**
     * Handle errors
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        console.error(`${context}:`, error);
        
        const errorContainer = document.getElementById(`import-error-${this.locationId}`);
        if (errorContainer) {
            errorContainer.style.display = 'block';
            errorContainer.innerHTML = `
                <div class="w3-panel w3-pale-red w3-leftbar w3-border-red">
                    <h3>Error</h3>
                    <p>${context}: ${error.message}</p>
                </div>
            `;
        }

        this.updateStatus('error', error.message);

        // Update state
        this.state.error = {
            context,
            message: error.message,
            timestamp: new Date()
        };
        
        State.update(IMPORT_STATE_KEY, {
            [`location_${this.locationId}`]: this.state
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        try {
            // Remove event listeners
            const fileInput = document.getElementById(`file-input-${this.locationId}`);
            if (fileInput) {
                fileInput.removeEventListener('change', this.handleFileSelect);
            }

            // Clear progress monitoring
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
            }

            // Reset state
            this.importId = null;
            this.datasetId = null;
            this.status = 'idle';
            this.config = {};

            // Clear UI elements
            ['preview', 'progress', 'error', 'config'].forEach(type => {
                const container = document.getElementById(`import-${type}-${this.locationId}`);
                if (container) {
                    container.innerHTML = '';
                    container.style.display = 'none';
                }
            });

            // Update state
            State.update(IMPORT_STATE_KEY, {
                [`location_${this.locationId}`]: null
            });

        } catch (error) {
            console.error('Cleanup Error:', error);
        }
    }
}

export default ImportManager;