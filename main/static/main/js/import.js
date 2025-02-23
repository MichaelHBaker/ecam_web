// import.js
// Enhanced import management with proper initialization and safety checks

import { State } from './state.js';
import { API } from './api.js';
import { NotificationUI } from './ui.js';
import { DOM } from './dom.js';

const IMPORT_STATE_KEY = 'import_state';

/**
 * Enhanced Import Manager with initialization safety and dependency checks
 */
class ImportManager {
    /**
     * Create an Import Manager instance
     * @param {string} locationId - Location identifier
     */
    constructor(locationId) {
        this.initialized = false;
        this.locationId = locationId;
        this.importId = null;
        this.datasetId = null;
        this.status = 'idle';
        this.config = {};
        this.fileValidation = {
            maxSize: 50 * 1024 * 1024, // 50MB
            allowedTypes: ['text/csv', 'application/vnd.ms-excel'],
            allowedExtensions: ['.csv', '.txt', '.xls', '.xlsx']
        };

        // Bind methods
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
        this.updateProgress = this.updateProgress.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    /**
     * Check if import manager is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Ensure manager is initialized
     * @private
     */
    _checkInitialized() {
        if (!this.initialized) {
            throw new Error('Import Manager must be initialized before use');
        }
    }

    /**
     * Initialize import manager with dependency checks
     * @returns {Promise<ImportManager>} Initialized instance
     */
    async initialize() {
        if (this.initialized) {
            console.warn('ImportManager already initialized');
            return this;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before ImportManager');
            }
            if (!API.isInitialized()) {
                throw new Error('API must be initialized before ImportManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before ImportManager');
            }

            // Initialize UI elements
            await this.initializeUI();
            
            // Set up event listeners
            await this.attachEventListeners();

            // Initialize import state
            await this.initializeState();

            this.initialized = true;
            console.log('ImportManager initialized');

            return this;

        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize UI elements with error handling
     * @private
     */
    async initializeUI() {
        try {
            // Create container divs if they don't exist
            const containers = ['preview', 'progress', 'error', 'config'];
            
            for (const type of containers) {
                const containerId = `import-${type}-${this.locationId}`;
                
                if (!DOM.getElement(containerId)) {
                    const container = DOM.createElement('div', {
                        id: containerId,
                        className: `import-${type}-container w3-margin-top`,
                        attributes: {
                            style: 'display: none;'
                        }
                    });
                    
                    const mainContainer = DOM.getElement(`import-main-${this.locationId}`);
                    if (mainContainer) {
                        mainContainer.appendChild(container);
                    } else {
                        throw new Error(`Main container not found for location ${this.locationId}`);
                    }
                }
            }

            // Initialize file input
            await this.initializeFileInput();

            // Initialize drop zone
            await this.initializeDropZone();

        } catch (error) {
            this.handleError('UI Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize file input with error handling
     * @private
     */
    async initializeFileInput() {
        try {
            const existingInput = DOM.getElement(`file-input-${this.locationId}`);
            if (!existingInput) {
                const input = DOM.createElement('input', {
                    type: 'file',
                    id: `file-input-${this.locationId}`,
                    accept: this.fileValidation.allowedExtensions.join(','),
                    attributes: {
                        style: 'display: none;'
                    }
                });
                
                const mainContainer = DOM.getElement(`import-main-${this.locationId}`);
                if (mainContainer) {
                    mainContainer.appendChild(input);
                } else {
                    throw new Error('Main container not found');
                }
            }
        } catch (error) {
            this.handleError('File Input Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize drop zone with error handling
     * @private
     */
    async initializeDropZone() {
        try {
            const dropZone = DOM.getElement(`import-dropzone-${this.locationId}`);
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
            DOM.addClasses(dropZone, ['w3-border', 'w3-border-dashed', 'w3-round']);
            dropZone.style.minHeight = '200px';
            dropZone.style.display = 'flex';
            dropZone.style.alignItems = 'center';
            dropZone.style.justifyContent = 'center';
            dropZone.style.cursor = 'pointer';
            dropZone.style.transition = 'all 0.3s ease';

        } catch (error) {
            this.handleError('Drop Zone Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize import state
     * @private
     */
    async initializeState() {
        try {
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
            await State.update(IMPORT_STATE_KEY, {
                [`location_${this.locationId}`]: initialState
            });

        } catch (error) {
            this.handleError('State Initialization Error', error);
            throw error;
        }
    }
    /**
     * Attach event listeners with error handling
     * @private
     */
    async attachEventListeners() {
        try {
            // File input change handler
            const fileInput = DOM.getElement(`file-input-${this.locationId}`);
            if (fileInput) {
                fileInput.addEventListener('change', this.handleFileSelect);
            }

            // Drop zone events
            const dropZone = DOM.getElement(`import-dropzone-${this.locationId}`);
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
                dropZone.addEventListener('drop', async (e) => {
                    try {
                        dropZone.classList.remove('w3-pale-blue');
                        const dt = e.dataTransfer;
                        const files = dt.files;
                        
                        if (files.length) {
                            const fileInput = DOM.getElement(`file-input-${this.locationId}`);
                            if (fileInput) {
                                fileInput.files = files;
                                await this.handleFileSelect({ target: fileInput });
                            }
                        }
                    } catch (error) {
                        this.handleError('File Drop Error', error);
                    }
                });

                // Click to select
                dropZone.addEventListener('click', () => {
                    try {
                        const fileInput = DOM.getElement(`file-input-${this.locationId}`);
                        if (fileInput) {
                            fileInput.click();
                        }
                    } catch (error) {
                        this.handleError('File Input Click Error', error);
                    }
                });
            }
        } catch (error) {
            this.handleError('Event Listener Setup Error', error);
            throw error;
        }
    }

    /**
     * Handle file selection with validation and error handling
     * @param {Event} event - File input change event
     */
    async handleFileSelect(event) {
        this._checkInitialized();

        const file = event.target.files[0];
        if (!file) return;

        try {
            // Validate file
            const validationResult = await this.validateFile(file);
            if (!validationResult.valid) {
                throw new Error(validationResult.error);
            }

            // Update status and UI
            this.updateStatus('uploading');
            await this.showFileInfo(file);

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
            this.updateStatus('error', error.message);
        }
    }

    /**
     * Validate file before upload with enhanced checks
     * @param {File} file - File to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateFile(file) {
        this._checkInitialized();

        try {
            // Size validation
            if (file.size > this.fileValidation.maxSize) {
                const maxSizeMB = Math.round(this.fileValidation.maxSize / (1024 * 1024));
                return {
                    valid: false,
                    error: `File size exceeds ${maxSizeMB}MB limit`
                };
            }

            // Type validation with more thorough checks
            const fileType = await this.getFileType(file);
            if (!this.fileValidation.allowedTypes.includes(fileType)) {
                return {
                    valid: false,
                    error: 'Invalid file type. Please upload a CSV or Excel file.'
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

            // Basic content validation
            if (file.size === 0) {
                return {
                    valid: false,
                    error: 'File is empty'
                };
            }

            // Perform deeper content validation if needed
            const contentValidation = await this.validateFileContent(file);
            if (!contentValidation.valid) {
                return contentValidation;
            }

            return { valid: true };

        } catch (error) {
            this.handleError('File Validation Error', error);
            return {
                valid: false,
                error: `Validation error: ${error.message}`
            };
        }
    }

    /**
     * Get file type with enhanced detection
     * @private
     * @param {File} file - File to check
     * @returns {Promise<string>} Detected file type
     */
    async getFileType(file) {
        try {
            // Check file signature for more accurate type detection
            const buffer = await file.slice(0, 4).arrayBuffer();
            const bytes = new Uint8Array(buffer);
            
            // Excel file signatures
            if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
                return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; // XLSX
            }
            if (bytes[0] === 0xD0 && bytes[1] === 0xCF) {
                return 'application/vnd.ms-excel'; // XLS
            }

            // CSV detection through content sampling
            const textSample = await file.slice(0, 1024).text();
            const lines = textSample.split('\n');
            if (lines.length > 1) {
                const firstLine = lines[0];
                const commas = (firstLine.match(/,/g) || []).length;
                const tabs = (firstLine.match(/\t/g) || []).length;
                
                if (commas > 0 || tabs > 0) {
                    return 'text/csv';
                }
            }

            return file.type;

        } catch (error) {
            this.handleError('File Type Detection Error', error);
            return file.type; // Fallback to basic type
        }
    }

    /**
     * Validate file content
     * @private
     * @param {File} file - File to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateFileContent(file) {
        try {
            // Read first few lines to validate structure
            const sample = await file.slice(0, 4096).text();
            const lines = sample.split('\n');

            if (lines.length < 2) {
                return {
                    valid: false,
                    error: 'File must contain at least a header row and one data row'
                };
            }

            // Validate header row
            const headerRow = lines[0].trim();
            if (!headerRow) {
                return {
                    valid: false,
                    error: 'Header row is empty'
                };
            }

            // Check for minimum required columns
            const columns = headerRow.split(',');
            if (columns.length < 2) {
                return {
                    valid: false,
                    error: 'File must contain at least two columns'
                };
            }

            // Validate data consistency
            const columnCount = columns.length;
            for (let i = 1; i < Math.min(lines.length, 5); i++) {
                const line = lines[i].trim();
                if (line) {
                    const fields = line.split(',');
                    if (Math.abs(fields.length - columnCount) > 1) {
                        return {
                            valid: false,
                            error: 'Inconsistent number of columns detected'
                        };
                    }
                }
            }

            return { valid: true };

        } catch (error) {
            this.handleError('Content Validation Error', error);
            return {
                valid: false,
                error: `Content validation error: ${error.message}`
            };
        }
    }
    /**
     * Upload file to server with progress tracking
     * @param {File} file - File to upload
     * @returns {Promise} Upload result
     */
    async uploadFile(file) {
        this._checkInitialized();

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('location_id', this.locationId);

            // Create upload tracker
            const tracker = {
                total: file.size,
                loaded: 0,
                startTime: Date.now()
            };

            // Configure upload request with progress tracking
            const response = await API.DataImports.create(
                this.locationId, 
                formData,
                {
                    onUploadProgress: (progressEvent) => {
                        tracker.loaded = progressEvent.loaded;
                        this.updateUploadProgress(tracker);
                    }
                }
            );
            
            if (!response.import_id) {
                throw new Error('Invalid server response');
            }

            this.updateState({
                uploadComplete: true,
                uploadStats: {
                    fileSize: file.size,
                    duration: Date.now() - tracker.startTime,
                    speed: Math.round(file.size / ((Date.now() - tracker.startTime) / 1000))
                }
            });

            return response;

        } catch (error) {
            this.handleError('Upload Error', error);
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    /**
     * Update upload progress with stats
     * @private
     * @param {Object} tracker - Upload tracker
     */
    updateUploadProgress(tracker) {
        try {
            const progress = Math.round((tracker.loaded / tracker.total) * 100);
            const elapsed = (Date.now() - tracker.startTime) / 1000;
            const speed = Math.round(tracker.loaded / elapsed);
            const remaining = Math.round((tracker.total - tracker.loaded) / speed);

            this.updateState({
                uploadProgress: {
                    percent: progress,
                    loaded: tracker.loaded,
                    total: tracker.total,
                    speed,
                    remaining
                }
            });

            this.updateProgressUI(progress, speed, remaining);

        } catch (error) {
            this.handleError('Progress Update Error', error);
        }
    }

    /**
     * Show file information in UI
     * @param {File} file - Uploaded file
     */
    async showFileInfo(file) {
        this._checkInitialized();

        try {
            const container = DOM.getElement(`file-display-${this.locationId}`);
            if (!container) return;

            // Format file size
            const size = this.formatFileSize(file.size);

            const fileDisplay = DOM.createElement('div', {
                className: 'w3-display-container w3-padding',
                innerHTML: `
                    <i class="bi bi-file-earmark-text"></i>
                    <span class="w3-margin-left">${file.name}</span>
                    <span class="w3-text-grey w3-small w3-margin-left">${size}</span>
                    <button class="w3-button w3-hover-light-grey w3-display-right">
                        <i class="bi bi-x"></i>
                    </button>
                `
            });

            // Add remove handler
            const removeButton = fileDisplay.querySelector('button');
            if (removeButton) {
                removeButton.addEventListener('click', () => this.clearFile());
            }

            // Clear existing content and show new file info
            container.innerHTML = '';
            container.appendChild(fileDisplay);
            container.style.display = 'block';

            this.updateState({
                fileInfo: {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: new Date(file.lastModified)
                }
            });

        } catch (error) {
            this.handleError('File Info Display Error', error);
        }
    }

    /**
     * Show file preview with enhanced error handling
     * @param {string} content - File preview content
     */
    async showPreview(content) {
        this._checkInitialized();

        const container = DOM.getElement(`import-preview-${this.locationId}`);
        if (!container) return;

        try {
            // Create preview container
            const previewCard = DOM.createElement('div', {
                className: 'w3-card w3-white',
                innerHTML: `
                    <div class="w3-bar w3-light-grey">
                        <div class="w3-bar-item">File Preview</div>
                        <button class="w3-bar-item w3-button w3-right" 
                                title="Close Preview">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                    <div class="w3-container preview-content" 
                         style="max-height: 400px; overflow: auto;">
                        <table class="w3-table w3-striped w3-bordered">
                            ${await this.formatPreviewContent(content)}
                        </table>
                    </div>
                `
            });

            // Add close handler
            const closeButton = previewCard.querySelector('button');
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    container.style.display = 'none';
                });
            }

            // Show preview
            container.innerHTML = '';
            container.appendChild(previewCard);
            container.style.display = 'block';

            // Update state
            this.updateState({
                preview: {
                    content: content,
                    timestamp: new Date()
                }
            });

            // Analyze preview content
            await this.analyzePreviewContent(content);

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
            const parsedData = await this.parseCSV(content);
            if (!parsedData || parsedData.length === 0) {
                return '<tr><td>No data available</td></tr>';
            }

            // Generate table header
            const headers = Object.keys(parsedData[0]);
            const headerRow = `
                <tr class="w3-light-grey">
                    ${headers.map(header => `
                        <th class="w3-padding-small">${this.sanitizeCell(header)}</th>
                    `).join('')}
                </tr>
            `;

            // Generate table rows (limit to first 10 rows)
            const dataRows = parsedData.slice(0, 10).map(row => `
                <tr>
                    ${headers.map(header => `
                        <td class="w3-padding-small">
                            ${this.sanitizeCell(row[header])}
                        </td>
                    `).join('')}
                </tr>
            `).join('');

            return headerRow + dataRows;

        } catch (error) {
            this.handleError('Preview Formatting Error', error);
            return '<tr><td>Error formatting preview</td></tr>';
        }
    }

    /**
     * Sanitize cell content for display
     * @private
     * @param {*} value - Cell value
     * @returns {string} Sanitized value
     */
    sanitizeCell(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const str = String(value);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Parse CSV content
     * @private
     * @param {string} content - CSV content
     * @returns {Promise<Array>} Parsed data
     */
    async parseCSV(content) {
        return new Promise((resolve, reject) => {
            try {
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
            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Validate import with enhanced error handling
     * @returns {Promise<Object>} Validation results
     */
    async validateImport() {
        this._checkInitialized();

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
            this.updateStatus('error', error.message);
            throw error;
        }
    }

    /**
     * Show validation results with enhanced UI
     * @param {Object} results - Validation results
     */
    async showValidationResults(results) {
        this._checkInitialized();

        try {
            const container = DOM.getElement(`import-config-${this.locationId}`);
            if (!container) return;

            // Create validation summary
            const summary = DOM.createElement('div', {
                className: 'w3-card w3-white w3-margin-top'
            });

            const content = DOM.createElement('div', {
                className: 'w3-container',
                innerHTML: `
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
                `
            });

            // Add warnings if present
            if (results.validation_checks.warnings.length) {
                content.appendChild(this.createWarningsPanel(results.validation_checks.warnings));
            }

            // Add recommendations if present
            if (results.validation_checks.recommendations.length) {
                content.appendChild(this.createRecommendationsPanel(results.validation_checks.recommendations));
            }

            // Add data quality metrics if available
            if (results.data_quality) {
                content.appendChild(this.createDataQualityPanel(results.data_quality));
            }

            summary.appendChild(content);
            container.style.display = 'block';
            container.appendChild(summary);

            // Update state
            this.updateState({
                validationResults: results,
                validationComplete: true,
                lastValidation: new Date()
            });

        } catch (error) {
            this.handleError('Validation Results Display Error', error);
        }
    }

    /**
     * Create warnings panel
     * @private
     */
    createWarningsPanel(warnings) {
        return DOM.createElement('div', {
            className: 'w3-panel w3-pale-yellow',
            innerHTML: `
                <h5>Warnings</h5>
                <ul class="w3-ul">
                    ${warnings.map(w => `
                        <li class="w3-padding-small">
                            <i class="bi bi-exclamation-triangle"></i>
                            ${this.sanitizeCell(w)}
                        </li>
                    `).join('')}
                </ul>
            `
        });
    }

    /**
     * Create recommendations panel
     * @private
     */
    createRecommendationsPanel(recommendations) {
        return DOM.createElement('div', {
            className: 'w3-panel w3-pale-blue',
            innerHTML: `
                <h5>Recommendations</h5>
                <ul class="w3-ul">
                    ${recommendations.map(r => `
                        <li class="w3-padding-small">
                            <i class="bi bi-info-circle"></i>
                            ${this.sanitizeCell(r)}
                        </li>
                    `).join('')}
                </ul>
            `
        });
    }

    /**
     * Create data quality panel
     * @private
     */
    createDataQualityPanel(quality) {
        const metrics = [];
        
        if (quality.completeness) {
            metrics.push(`Data Completeness: ${quality.completeness}%`);
        }
        if (quality.consistency) {
            metrics.push(`Data Consistency: ${quality.consistency}%`);
        }
        if (quality.duplicates) {
            metrics.push(`Duplicate Rows: ${quality.duplicates}`);
        }

        return DOM.createElement('div', {
            className: 'w3-panel w3-pale-green',
            innerHTML: `
                <h5>Data Quality Metrics</h5>
                <ul class="w3-ul">
                    ${metrics.map(m => `
                        <li class="w3-padding-small">
                            <i class="bi bi-check-circle"></i>
                            ${this.sanitizeCell(m)}
                        </li>
                    `).join('')}
                </ul>
            `
        });
    }

    /**
     * Update status with state management
     * @param {string} status - New status
     * @param {string} [message] - Optional status message
     */
    updateStatus(status, message = '') {
        try {
            this.status = status;
            
            // Update UI status
            const statusDisplay = DOM.getElement(`import-status-${this.locationId}`);
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
            this.updateState({
                status,
                statusMessage: message,
                lastStatusUpdate: new Date()
            });

        } catch (error) {
            this.handleError('Status Update Error', error);
        }
    }

    /**
     * Update state with error handling
     * @private
     * @param {Object} update - State update
     */
    updateState(update) {
        try {
            const currentState = State.get(IMPORT_STATE_KEY)[`location_${this.locationId}`] || {};
            
            State.update(IMPORT_STATE_KEY, {
                [`location_${this.locationId}`]: {
                    ...currentState,
                    ...update,
                    lastUpdate: new Date()
                }
            });
        } catch (error) {
            this.handleError('State Update Error', error);
        }
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

    /**
     * Handle errors consistently
     * @private
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        console.error(`Import Error (${context}):`, error);
        
        NotificationUI.show({
            message: `Import Error: ${error.message}`,
            type: 'error',
            duration: 5000
        });

        this.updateState({
            error: {
                context,
                message: error.message,
                stack: error.stack,
                timestamp: new Date()
            }
        });
    }

    /**
     * Clear current file
     */
    clearFile() {
        this._checkInitialized();

        try {
            // Reset file input
            const fileInput = DOM.getElement(`file-input-${this.locationId}`);
            if (fileInput) {
                fileInput.value = '';
            }

            // Clear display
            const display = DOM.getElement(`file-display-${this.locationId}`);
            if (display) {
                display.innerHTML = '';
                display.style.display = 'none';
            }

            // Clear preview
            const preview = DOM.getElement(`import-preview-${this.locationId}`);
            if (preview) {
                preview.innerHTML = '';
                preview.style.display = 'none';
            }

            // Reset state
            this.importId = null;
            this.datasetId = null;
            this.status = 'idle';

            this.updateState({
                fileInfo: null,
                preview: null,
                validationResults: null,
                error: null,
                lastUpdate: new Date()
            });

            this.updateStatus('idle');

        } catch (error) {
            this.handleError('Clear File Error', error);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (!this.initialized) return;

        try {
            // Clear file input
            const fileInput = DOM.getElement(`file-input-${this.locationId}`);
            if (fileInput) {
                fileInput.removeEventListener('change', this.handleFileSelect);
            }

            // Clear all containers
            ['preview', 'progress', 'error', 'config'].forEach(type => {
                const container = DOM.getElement(`import-${type}-${this.locationId}`);
                if (container) {
                    container.innerHTML = '';
                    container.style.display = 'none';
                }
            });

            // Clear state
            State.update(IMPORT_STATE_KEY, {
                [`location_${this.locationId}`]: null
            });

            this.initialized = false;

        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }
}

export default ImportManager;