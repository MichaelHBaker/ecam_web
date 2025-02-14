// CSRF Token setup
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM.');
}

// Initialize state and event handlers
let columnSelectionMenus = {};
let codeMirrorInstances = {};
let codeMirrorLoaded = false;

const initializeColumnSelectionHandlers = () => {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu') && !e.target.closest('.w3-card')) {
            Object.keys(columnSelectionMenus).forEach(hideColumnSelectionMenus);
        }
    });
};
initializeColumnSelectionHandlers();

// Initialize MODEL_FIELDS
export let MODEL_FIELDS = null;
let modelFieldsPromise = null;

// Helper function for CodeMirror instances
const generateModalInstanceId = (locationId) => {
    return `${locationId}-${Date.now()}`;
};

const getModalInstanceId = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    return modal?.dataset.instanceId;
};

// Function to load CodeMirror and its dependencies
const loadCodeMirror = async () => {
    if (codeMirrorLoaded) return;
    
    if (!window.CodeMirror) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    codeMirrorLoaded = true;
};

// Generalized API fetch function with enhanced error handling
export const apiFetch = async (endpoint, options = {}, basePath = '/api') => {
    let headers = {
        'X-CSRFToken': CSRF_TOKEN,
    };

    // Only set Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const defaultOptions = {
        headers: headers,
        credentials: 'include',  // Ensure cookies are sent
    };

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const apiEndpoint = `${basePath}${cleanEndpoint}`;
    
    try {
        const response = await fetch(apiEndpoint, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {}),
            },
        });

        // Handle different response types
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType?.includes('application/json')) {
            data = await response.json();
        } else if (response.status === 204) {
            // No content
            return null;
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            if (response.status === 400 && typeof data === 'object') {
                const errors = [];
                Object.entries(data).forEach(([field, messages]) => {
                    if (Array.isArray(messages)) {
                        errors.push(`${field}: ${messages.join(', ')}`);
                    } else if (typeof messages === 'string') {
                        errors.push(`${field}: ${messages}`);
                    }
                });
                throw new Error(errors.join('\n'));
            }

            throw new Error(data.detail || `API Error: ${response.statusText}`);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching ${apiEndpoint}:`, error);
        throw error;
    }
};

// Central State Management
const StateManager = {
    _state: {},
    _codeMirrorInstances: {},
    _columnSelectionMenus: {},
    _codeMirrorLoaded: false,
    
    get(locationId, key) {
        const state = this._state[locationId] || {};
        return key ? state[key] : state;
    },
    
    set(locationId, updates) {
        this._state[locationId] = {
            ...this._state[locationId],
            ...updates
        };
    },
    
    clear(locationId) {
        delete this._state[locationId];
        delete this._codeMirrorInstances[locationId];
        delete this._columnSelectionMenus[locationId];
    },

    // CodeMirror specific methods
    setCodeMirrorInstance(locationId, instance) {
        this._codeMirrorInstances[locationId] = instance;
    },

    getCodeMirrorInstance(locationId) {
        return this._codeMirrorInstances[locationId];
    },

    setCodeMirrorLoaded(value) {
        this._codeMirrorLoaded = value;
    },

    isCodeMirrorLoaded() {
        return this._codeMirrorLoaded;
    },

    // Column selection methods
    setColumnMenu(locationId, menuType, menu) {
        if (!this._columnSelectionMenus[locationId]) {
            this._columnSelectionMenus[locationId] = {};
        }
        this._columnSelectionMenus[locationId][menuType] = menu;
    },

    getColumnMenus(locationId) {
        return this._columnSelectionMenus[locationId] || {};
    },

    clearColumnMenus(locationId) {
        delete this._columnSelectionMenus[locationId];
    }
};

// Source Management - Parent manager for all source types
const SourceManager = {
    async initialize(locationId, sourceType) {
        // Initialize base state
        StateManager.set(locationId, {
            sourceInfo: {
                type: sourceType,
                status: 'initializing',
                streamInfo: {
                    totalSize: null,
                    processedSize: 0,
                    sampleSize: 1000,
                    hasMore: true,
                    position: 0
                }
            }
        });

        // Initialize dependent managers
        await ImportConfigManager.initialize(locationId);
        await DataTypeManager.initialize(locationId);
        await MappingManager.initialize(locationId);

        // Get source-specific manager
        const manager = this.getSourceManager(sourceType);
        if (!manager) {
            throw new Error(`Unsupported source type: ${sourceType}`);
        }

        // Initialize source-specific UI
        await this.initializeSourceUI(locationId, sourceType);

        return manager;
    },

    getSourceManager(sourceType) {
        switch(sourceType) {
            case 'file': return FileManager;
            case 'api': return ApiManager;
            case 'database': return DatabaseManager;
            default: return null;
        }
    },

    async loadSource(locationId) {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        if (!sourceInfo?.type) {
            throw new Error('Source type not initialized');
        }

        try {
            // Get manager and load sample
            const manager = this.getSourceManager(sourceInfo.type);
            const response = await manager.loadSample(locationId);

            // Initialize preview
            await PreviewManager.initialize(locationId, response.preview_content);

            // Update source status
            this.updateSourceStatus(locationId, 'ready');

            return response;

        } catch (error) {
            this.updateSourceStatus(locationId, 'error', error.message);
            throw error;
        }
    },

    async initializeSourceUI(locationId, sourceType) {
        const container = document.getElementById(`id_source_container-${locationId}`);
        if (!container) return;

        // Set up source indicator
        container.innerHTML = `
            <div id="id_source_indicator-${locationId}" 
                 class="w3-panel w3-leftbar w3-border-blue w3-pale-blue">
                <i class="bi bi-${this.getSourceIcon(sourceType)}"></i> 
                ${this.getSourceDisplayName(sourceType)}
            </div>
            <div id="id_source_controls-${locationId}" class="w3-bar">
                ${this.getSourceControls(sourceType, locationId)}
            </div>
            <div id="id_source_progress-${locationId}" 
                 class="w3-progress-container w3-round" 
                 style="display: none;">
                <div class="w3-progressbar w3-round" style="width:0%">
                    <div class="w3-center w3-text-white"></div>
                </div>
            </div>
        `;
    },

    updateSourceStatus(locationId, status, message = '') {
        // Update state
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        if (!sourceInfo) return;

        StateManager.set(locationId, {
            sourceInfo: {
                ...sourceInfo,
                status,
                lastMessage: message
            }
        });

        // Update UI
        const manager = this.getSourceManager(sourceInfo.type);
        if (manager?.updateDisplay) {
            manager.updateDisplay(locationId, status, message);
        }

        // Show/hide progress bar
        const progressContainer = document.getElementById(`id_source_progress-${locationId}`);
        if (progressContainer) {
            progressContainer.style.display = 
                ['loading', 'processing'].includes(status) ? 'block' : 'none';
        }
    },

    updateProgress(locationId, processed, total) {
        const progressBar = document.querySelector(
            `#id_source_progress-${locationId} .w3-progressbar`
        );
        const progressText = progressBar?.querySelector('.w3-center');
        
        if (progressBar && progressText) {
            const percent = total ? Math.round((processed / total) * 100) : 0;
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${percent}%`;
        }

        // Update stream info
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        if (sourceInfo) {
            StateManager.set(locationId, {
                sourceInfo: {
                    ...sourceInfo,
                    streamInfo: {
                        ...sourceInfo.streamInfo,
                        processedSize: processed,
                        totalSize: total
                    }
                }
            });
        }
    },

    getSourceIcon(sourceType) {
        switch(sourceType) {
            case 'file': return 'file-earmark-text';
            case 'api': return 'cloud';
            case 'database': return 'database';
            default: return 'question-circle';
        }
    },

    getSourceDisplayName(sourceType) {
        switch(sourceType) {
            case 'file': return 'File Source';
            case 'api': return 'API Connection';
            case 'database': return 'Database Connection';
            default: return 'Unknown Source';
        }
    },

    getSourceControls(sourceType, locationId) {
        switch(sourceType) {
            case 'file':
                return `
                    <input type="file" 
                           id="id_file_input-${locationId}" 
                           style="display: none;" 
                           accept=".csv,.txt,.json,.xml">
                    <button class="w3-button w3-blue" 
                            onclick="crud.FileManager.triggerFileSelect('${locationId}')">
                        <i class="bi bi-file-earmark-arrow-up"></i> Select File
                    </button>
                `;
            case 'api':
                return `
                    <button class="w3-button w3-blue" 
                            onclick="crud.ApiManager.configureConnection('${locationId}')">
                        <i class="bi bi-gear"></i> Configure API
                    </button>
                `;
            case 'database':
                return `
                    <button class="w3-button w3-blue" 
                            onclick="crud.DatabaseManager.configureConnection('${locationId}')">
                        <i class="bi bi-gear"></i> Configure Database
                    </button>
                `;
            default:
                return '';
        }
    },

    // Validation integration
    async validateSource(locationId) {
        return ValidationManager.validateSource(locationId);
    },

    // Configuration integration
    getSourceConfig(locationId) {
        return ImportConfigManager.getConfig(locationId);
    },

    // Mapping integration
    getMappingStatus(locationId) {
        return MappingManager.getMappings(locationId);
    }
};

// File-specific source manager
const FileManager = {
    async loadSample(locationId) {
        const fileInput = document.getElementById(`id_file_input-${locationId}`);
        if (!fileInput?.files?.[0]) {
            throw new Error('No file selected');
        }

        const file = fileInput.files[0];
        return this.handleUpload(file, locationId);
    },

    async handleUpload(file, locationId) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('location_id', String(locationId));
        formData.append('sample_size', '1000');  // Initial sample size

        SourceManager.updateSourceStatus(locationId, 'loading');

        try {
            const response = await apiFetch('/data-imports/', {
                method: 'POST',
                body: formData
            });

            // Update source config
            await ImportConfigManager.applySourceConfig(locationId, {
                type: 'file',
                format: this.detectFileFormat(file.name, response.preview_content),
                config: {
                    filename: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified
                }
            });

            // Update source info in state
            StateManager.set(locationId, {
                sourceInfo: {
                    ...StateManager.get(locationId, 'sourceInfo'),
                    fileInfo: {
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        lastModified: file.lastModified
                    },
                    importId: response.import_id,
                    dataSourceId: response.data_source_id
                }
            });

            // Detect and apply file properties
            const fileProperties = this.detectFileProperties(response.preview_content);
            await ImportConfigManager.applyStructureConfig(locationId, fileProperties);

            SourceManager.updateSourceStatus(locationId, 'success');
            return response;

        } catch (error) {
            SourceManager.updateSourceStatus(locationId, 'error', error.message);
            throw error;
        }
    },

    async readMoreContent(locationId, startByte, size) {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        if (!sourceInfo?.importId) return null;

        try {
            const response = await apiFetch(`/data-imports/${sourceInfo.importId}/content/`, {
                method: 'POST',
                body: JSON.stringify({
                    start: startByte,
                    size: size
                })
            });

            // Update progress through SourceManager
            SourceManager.updateProgress(
                locationId,
                startByte + response.content.length,
                sourceInfo.fileInfo.size
            );

            return response;

        } catch (error) {
            console.error('Error reading more content:', error);
            throw error;
        }
    },

    detectFileFormat(filename, content) {
        // Check file extension first
        const ext = filename.toLowerCase().split('.').pop();
        if (['json', 'xml'].includes(ext)) {
            return ext;
        }

        // Check content
        const trimmed = content.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return 'json';
        }
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
            return 'xml';
        }

        // Default to delimited for text files
        return 'delimited';
    },

    detectFileProperties(content) {
        const lines = content.split('\n');
        const sampleLines = lines.slice(0, Math.min(lines.length, 10));

        return {
            delimiter: this.detectDelimiter(sampleLines),
            encoding: this.detectEncoding(content),
            hasHeaders: this.detectHeaders(sampleLines),
            dataStartLine: this.detectDataStart(sampleLines)
        };
    },

    detectDelimiter(sampleLines) {
        const delimiters = [',', '\t', '|', ';'];
        const counts = delimiters.map(d => ({
            delimiter: d,
            consistency: this.checkDelimiterConsistency(sampleLines, d)
        }));
        
        const bestMatch = counts.reduce((best, current) => 
            current.consistency > best.consistency ? current : best
        );

        return bestMatch.consistency > 0.8 ? bestMatch.delimiter : null;
    },

    checkDelimiterConsistency(lines, delimiter) {
        if (lines.length < 2) return 0;
        
        const counts = lines.map(line => 
            (line.match(new RegExp(delimiter === '|' ? '\\|' : delimiter, 'g')) || []).length
        );
        
        const mode = counts.reduce((a, b) => 
            counts.filter(v => v === a).length >= counts.filter(v => v === b).length ? a : b
        );
        
        return counts.filter(c => c === mode).length / counts.length;
    },

    detectEncoding(content) {
        // Basic encoding detection
        const hasUnicode = /[\u0080-\uFFFF]/.test(content);
        return hasUnicode ? 'utf-8' : 'ascii';
    },

    detectHeaders(sampleLines) {
        if (sampleLines.length < 2) return false;
        
        const firstLine = sampleLines[0];
        const secondLine = sampleLines[1];
        
        // Check if first line looks like headers
        const hasNumbers = /\d/.test(firstLine);
        const isTextOnly = /^[a-zA-Z_\s,|\t;]+$/.test(firstLine);
        
        return isTextOnly && !hasNumbers;
    },

    detectDataStart(sampleLines) {
        // Look for first line that appears to be data
        for (let i = 0; i < sampleLines.length; i++) {
            const line = sampleLines[i].trim();
            if (line && /\d/.test(line)) {
                return i;
            }
        }
        return null;
    },

    updateDisplay(locationId, status, message = '') {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        const fileInfo = sourceInfo?.fileInfo;
        if (!fileInfo) return;

        const displayConfig = {
            success: {
                icon: 'bi-file-earmark-check',
                class: 'w3-pale-green w3-border-green',
                text: fileInfo.name
            },
            loading: {
                icon: 'bi-arrow-clockwise',
                class: 'w3-pale-yellow w3-border-yellow',
                text: `Loading ${fileInfo.name}...`
            },
            error: {
                icon: 'bi-exclamation-triangle',
                class: 'w3-pale-red w3-border-red',
                text: message || `Error processing ${fileInfo.name}`
            },
            processing: {
                icon: 'bi-gear-wide-connected',
                class: 'w3-pale-blue w3-border-blue',
                text: `Processing ${fileInfo.name}`
            }
        };

        const indicator = document.getElementById(`id_source_indicator-${locationId}`);
        if (!indicator) return;

        const config = displayConfig[status];
        indicator.innerHTML = `<i class="bi ${config.icon}"></i> ${config.text}`;
        indicator.className = `w3-panel w3-leftbar ${config.class}`;
    },

    triggerFileSelect(locationId) {
        const fileInput = document.getElementById(`id_file_input-${locationId}`);
        if (fileInput) {
            fileInput.click();
        }
    }
};

// API-specific source manager
const ApiManager = {
    async loadSample(locationId) {
        const config = await this.getConnectionConfig(locationId);
        if (!config) throw new Error('API not configured');

        try {
            SourceManager.updateSourceStatus(locationId, 'loading');

            // Make initial API request
            const response = await this.makeRequest(locationId, {
                ...config,
                pagination: {
                    ...config.pagination,
                    pageSize: 1000  // Initial sample size
                }
            });

            // Update source config
            await ImportConfigManager.applySourceConfig(locationId, {
                type: 'api',
                format: this.detectResponseFormat(response.data),
                config: {
                    endpoint: config.endpoint,
                    method: config.method,
                    authType: config.auth?.type,
                    pagination: config.pagination
                }
            });

            // Update source info
            StateManager.set(locationId, {
                sourceInfo: {
                    ...StateManager.get(locationId, 'sourceInfo'),
                    apiInfo: {
                        endpoint: config.endpoint,
                        method: config.method,
                        totalRecords: response.total_count
                    },
                    importId: response.import_id,
                    dataSourceId: response.data_source_id
                }
            });

            // Apply structure configuration
            const structureConfig = this.detectStructure(response.data);
            await ImportConfigManager.applyStructureConfig(locationId, structureConfig);

            SourceManager.updateSourceStatus(locationId, 'success');
            return response;

        } catch (error) {
            SourceManager.updateSourceStatus(locationId, 'error', error.message);
            throw error;
        }
    },

    async makeRequest(locationId, config) {
        const { endpoint, method, headers, body, pagination } = config;
        
        // Build request URL with pagination parameters
        let url = endpoint;
        if (pagination) {
            const params = new URLSearchParams();
            if (pagination.startToken) {
                params.append(pagination.tokenParam, pagination.startToken);
            }
            if (pagination.pageSize) {
                params.append(pagination.sizeParam, pagination.pageSize);
            }
            if (params.toString()) {
                url += `?${params.toString()}`;
            }
        }

        // Apply authentication
        const requestHeaders = {
            ...headers,
            'Content-Type': 'application/json'
        };

        if (config.auth) {
            this.applyAuthentication(requestHeaders, config.auth);
        }

        // Make the request
        const response = await apiFetch(url, {
            method,
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined
        });

        return response;
    },

    applyAuthentication(headers, auth) {
        switch (auth.type) {
            case 'basic':
                headers['Authorization'] = 'Basic ' + btoa(
                    `${auth.username}:${auth.password}`
                );
                break;
            case 'bearer':
                headers['Authorization'] = `Bearer ${auth.token}`;
                break;
            case 'apiKey':
                if (auth.location === 'header') {
                    headers[auth.name] = auth.value;
                }
                break;
        }
    },

    async readMoreContent(locationId, startToken, size) {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        if (!sourceInfo?.apiInfo) return null;

        try {
            const config = await this.getConnectionConfig(locationId);
            const response = await this.makeRequest(locationId, {
                ...config,
                pagination: {
                    ...config.pagination,
                    startToken,
                    pageSize: size
                }
            });

            // Update progress through SourceManager
            if (sourceInfo.apiInfo.totalRecords) {
                SourceManager.updateProgress(
                    locationId,
                    response.processed_count,
                    sourceInfo.apiInfo.totalRecords
                );
            }

            return response;

        } catch (error) {
            console.error('Error reading more content:', error);
            throw error;
        }
    },

    detectResponseFormat(data) {
        if (typeof data === 'string') {
            if (data.trimStart().startsWith('<')) return 'xml';
            try {
                JSON.parse(data);
                return 'json';
            } catch {
                return 'text';
            }
        }
        return 'json';  // Default for parsed data
    },

    detectStructure(data) {
        return {
            format: this.detectResponseFormat(data),
            path: this.detectDataPath(data),
            dataStartLine: 0,  // APIs don't typically have header rows
            fields: this.detectFields(data)
        };
    },

    detectDataPath(data) {
        // Find the array in the response that looks like the main data
        if (Array.isArray(data)) return '';
        
        const findArrayPath = (obj, path = '') => {
            if (Array.isArray(obj)) return path;
            if (typeof obj !== 'object' || !obj) return null;
            
            for (const [key, value] of Object.entries(obj)) {
                const newPath = path ? `${path}.${key}` : key;
                if (Array.isArray(value)) return newPath;
                const arrayPath = findArrayPath(value, newPath);
                if (arrayPath) return arrayPath;
            }
            return null;
        };

        return findArrayPath(data) || '';
    },

    detectFields(data) {
        // Extract field information from the response
        const sampleRecord = Array.isArray(data) ? data[0] : data;
        if (!sampleRecord) return [];

        return Object.keys(sampleRecord).map(field => ({
            name: field,
            type: typeof sampleRecord[field]
        }));
    },

    async configureConnection(locationId) {
        // Show configuration modal
        const modal = document.getElementById(`id_api_config_modal-${locationId}`);
        if (!modal) return;

        // Create configuration form if it doesn't exist
        if (!document.getElementById(`id_api_config_form-${locationId}`)) {
            modal.innerHTML = this.getConfigurationForm(locationId);
            this.attachConfigHandlers(locationId);
        }

        modal.style.display = 'block';
    },

    getConfigurationForm(locationId) {
        // ... (Same as before)
    },

    attachConfigHandlers(locationId) {
        // ... (Same as before)
    },

    async saveConfiguration(locationId, config) {
        try {
            await apiFetch('/api/source-config/', {
                method: 'POST',
                body: JSON.stringify({
                    location_id: locationId,
                    type: 'api',
                    config: config
                })
            });
        } catch (error) {
            throw new Error(`Failed to save configuration: ${error.message}`);
        }
    },

    async getConnectionConfig(locationId) {
        try {
            const response = await apiFetch(`/api/source-config/${locationId}/`);
            return response.config;
        } catch (error) {
            throw new Error(`Failed to get configuration: ${error.message}`);
        }
    },

    updateDisplay(locationId, status, message = '') {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        const apiInfo = sourceInfo?.apiInfo;
        if (!apiInfo) return;

        const displayConfig = {
            success: {
                icon: 'bi-cloud-check',
                class: 'w3-pale-green w3-border-green',
                text: apiInfo.endpoint
            },
            loading: {
                icon: 'bi-cloud-arrow-down',
                class: 'w3-pale-yellow w3-border-yellow',
                text: message || 'Loading data...'
            },
            error: {
                icon: 'bi-cloud-slash',
                class: 'w3-pale-red w3-border-red',
                text: message || 'API Error'
            },
            processing: {
                icon: 'bi-cloud-arrow-down',
                class: 'w3-pale-blue w3-border-blue',
                text: 'Processing API response'
            }
        };

        const indicator = document.getElementById(`id_source_indicator-${locationId}`);
        if (!indicator) return;

        const config = displayConfig[status];
        indicator.innerHTML = `<i class="bi ${config.icon}"></i> ${config.text}`;
        indicator.className = `w3-panel w3-leftbar ${config.class}`;
    }
};

// Database-specific source manager
const DatabaseManager = {
    async loadSample(locationId) {
        const config = await this.getConnectionConfig(locationId);
        if (!config) throw new Error('Database not configured');

        try {
            SourceManager.updateSourceStatus(locationId, 'loading');

            // Execute initial query
            const response = await this.executeQuery(locationId, config, {
                offset: 0,
                limit: 1000  // Initial sample size
            });

            // Update source config
            await ImportConfigManager.applySourceConfig(locationId, {
                type: 'database',
                format: 'tabular',  // Database results are always tabular
                config: {
                    connectionId: config.connectionId,
                    query: config.query,
                    parameters: config.parameters
                }
            });

            // Update source info
            StateManager.set(locationId, {
                sourceInfo: {
                    ...StateManager.get(locationId, 'sourceInfo'),
                    dbInfo: {
                        connectionId: config.connectionId,
                        query: config.query,
                        estimatedRows: response.total_count,
                        columnInfo: response.column_info
                    },
                    importId: response.import_id,
                    dataSourceId: response.data_source_id
                }
            });

            // Apply structure configuration based on query metadata
            const structureConfig = this.detectStructure(response);
            await ImportConfigManager.applyStructureConfig(locationId, structureConfig);

            SourceManager.updateSourceStatus(locationId, 'success');
            return response;

        } catch (error) {
            SourceManager.updateSourceStatus(locationId, 'error', error.message);
            throw error;
        }
    },

    async executeQuery(locationId, config, pagination) {
        const response = await apiFetch('/api/db-query/', {
            method: 'POST',
            body: JSON.stringify({
                connection_id: config.connectionId,
                query: this.buildPaginatedQuery(config.query, pagination),
                parameters: config.parameters
            })
        });

        return response;
    },

    buildPaginatedQuery(query, pagination) {
        // Remove any existing LIMIT/OFFSET
        let cleanQuery = query.replace(/\bLIMIT\b.*?\bOFFSET\b.*?(?=[;]|$)/i, '')
                             .replace(/\bOFFSET\b.*?\bLIMIT\b.*?(?=[;]|$)/i, '')
                             .replace(/\bLIMIT\b.*?(?=[;]|$)/i, '')
                             .trim();

        // Add new pagination
        return `${cleanQuery} LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;
    },

    async readMoreContent(locationId, offset, size) {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        if (!sourceInfo?.dbInfo) return null;

        try {
            const config = await this.getConnectionConfig(locationId);
            const response = await this.executeQuery(locationId, config, {
                offset,
                limit: size
            });

            // Update progress through SourceManager
            if (sourceInfo.dbInfo.estimatedRows) {
                SourceManager.updateProgress(
                    locationId,
                    offset + response.data.length,
                    sourceInfo.dbInfo.estimatedRows
                );
            }

            return response;

        } catch (error) {
            console.error('Error reading more content:', error);
            throw error;
        }
    },

    detectStructure(response) {
        return {
            format: 'tabular',
            dataStartLine: 0,  // No header rows in database results
            fields: this.detectFields(response.column_info),
            metadata: {
                totalRows: response.total_count,
                columnTypes: response.column_info.map(col => col.type)
            }
        };
    },

    detectFields(columnInfo) {
        return columnInfo.map(column => ({
            name: column.name,
            type: this.mapDbTypeToGeneric(column.type),
            nullable: column.nullable,
            precision: column.precision,
            scale: column.scale
        }));
    },

    mapDbTypeToGeneric(dbType) {
        // Map database-specific types to generic types
        const typeMap = {
            'integer': 'integer',
            'bigint': 'integer',
            'smallint': 'integer',
            'decimal': 'float',
            'numeric': 'float',
            'real': 'float',
            'double precision': 'float',
            'character varying': 'string',
            'varchar': 'string',
            'text': 'string',
            'boolean': 'boolean',
            'date': 'date',
            'timestamp': 'datetime',
            'time': 'time'
        };

        // Clean up type name (remove length specifications etc)
        const baseType = dbType.toLowerCase().split('(')[0].trim();
        return typeMap[baseType] || 'string';
    },

    async configureConnection(locationId) {
        // Show configuration modal
        const modal = document.getElementById(`id_db_config_modal-${locationId}`);
        if (!modal) return;

        // Create configuration form if it doesn't exist
        if (!document.getElementById(`id_db_config_form-${locationId}`)) {
            modal.innerHTML = this.getConfigurationForm(locationId);
            await this.loadConnections(locationId);
            this.attachConfigHandlers(locationId);
        }

        modal.style.display = 'block';
    },

    async loadConnections(locationId) {
        try {
            const response = await apiFetch('/api/db-connections/');
            const select = document.querySelector(
                `#id_db_config_form-${locationId} [name="connectionId"]`
            );
            
            response.connections.forEach(conn => {
                const option = document.createElement('option');
                option.value = conn.id;
                option.textContent = `${conn.name} (${conn.type})`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading connections:', error);
        }
    },

    async testQuery(locationId) {
        const form = document.getElementById(`id_db_config_form-${locationId}`);
        const resultDiv = document.getElementById(`id_query_result-${locationId}`);
        
        try {
            // Get form data
            const config = {
                connectionId: form.connectionId.value,
                query: form.query.value,
                parameters: JSON.parse(form.parameters.value || '{}')
            };

            // Execute test query
            resultDiv.innerHTML = '<i class="bi bi-hourglass"></i> Testing query...';
            resultDiv.className = 'w3-panel w3-pale-yellow';
            resultDiv.style.display = 'block';

            const response = await this.executeQuery(locationId, config, {
                offset: 0,
                limit: 5
            });

            // Show success result
            resultDiv.innerHTML = `
                <p><i class="bi bi-check-circle"></i> Query successful:</p>
                <ul>
                    <li>Total rows: ${response.total_count}</li>
                    <li>Column count: ${response.column_info.length}</li>
                    <li>Sample row: <pre>${JSON.stringify(response.data[0], null, 2)}</pre></li>
                </ul>
            `;
            resultDiv.className = 'w3-panel w3-pale-green';

        } catch (error) {
            resultDiv.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${error.message}`;
            resultDiv.className = 'w3-panel w3-pale-red';
        }
    },

    attachConfigHandlers(locationId) {
        const form = document.getElementById(`id_db_config_form-${locationId}`);
        if (!form) return;

        form.onsubmit = async (e) => {
            e.preventDefault();
            const config = {
                connectionId: form.connectionId.value,
                query: form.query.value,
                parameters: JSON.parse(form.parameters.value || '{}')
            };

            try {
                await this.saveConfiguration(locationId, config);
                document.getElementById(`id_db_config_modal-${locationId}`).style.display = 'none';
                SourceManager.updateSourceStatus(locationId, 'success', 'Database configured successfully');
            } catch (error) {
                SourceManager.updateSourceStatus(locationId, 'error', error.message);
            }
        };
    },

    async saveConfiguration(locationId, config) {
        try {
            await apiFetch('/api/source-config/', {
                method: 'POST',
                body: JSON.stringify({
                    location_id: locationId,
                    type: 'database',
                    config: config
                })
            });
        } catch (error) {
            throw new Error(`Failed to save configuration: ${error.message}`);
        }
    },

    async getConnectionConfig(locationId) {
        try {
            const response = await apiFetch(`/api/source-config/${locationId}/`);
            return response.config;
        } catch (error) {
            throw new Error(`Failed to get configuration: ${error.message}`);
        }
    },

    updateDisplay(locationId, status, message = '') {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        const dbInfo = sourceInfo?.dbInfo;
        if (!dbInfo) return;

        const displayConfig = {
            success: {
                icon: 'bi-database-check',
                class: 'w3-pale-green w3-border-green',
                text: `Query configured (${dbInfo.estimatedRows} rows)`
            },
            loading: {
                icon: 'bi-database-down',
                class: 'w3-pale-yellow w3-border-yellow',
                text: message || 'Loading data...'
            },
            error: {
                icon: 'bi-database-slash',
                class: 'w3-pale-red w3-border-red',
                text: message || 'Database Error'
            },
            processing: {
                icon: 'bi-database-down',
                class: 'w3-pale-blue w3-border-blue',
                text: 'Processing query results'
            }
        };

        const indicator = document.getElementById(`id_source_indicator-${locationId}`);
        if (!indicator) return;

        const config = displayConfig[status];
        indicator.innerHTML = `<i class="bi ${config.icon}"></i> ${config.text}`;
        indicator.className = `w3-panel w3-leftbar ${config.class}`;
    }
};

// Dataset Management
const DatasetManager = {
    async initialize(locationId) {
        const container = document.getElementById(`id_dataset_name_container-${locationId}`);
        if (!container) return;

        // Create dataset name input if it doesn't exist
        if (!document.getElementById(`id_dataset_name-${locationId}`)) {
            container.innerHTML = this.createDatasetNameInput(locationId);
        }

        container.style.display = 'block';
        
        // Initialize state
        StateManager.set(locationId, { 
            dataset: {
                name: null,
                isExisting: false
            }
        });

        // Load existing datasets for this location
        await this.loadExistingDatasets(locationId);
    },

    createDatasetNameInput(locationId) {
        return `
            <div class="w3-container">
                <label class="w3-text-grey">Dataset Name</label>
                <div class="w3-row-padding">
                    <div class="w3-col m12">
                        <input type="text" 
                               id="id_dataset_name-${locationId}"
                               class="w3-input w3-border"
                               list="dataset_list-${locationId}"
                               oninput="crud.DatasetManager.handleNameInput(event, '${locationId}')"
                               placeholder="Enter or select dataset name">
                        <datalist id="dataset_list-${locationId}"></datalist>
                        <small id="id_dataset_name_help-${locationId}" 
                               class="w3-text-grey"></small>
                    </div>
                </div>
            </div>
        `;
    },

    async loadExistingDatasets(locationId) {
        try {
            // Get dataSourceId from state or another reliable source
            const dataSourceId = StateManager.get(locationId, 'importInfo')?.dataSourceId;
            if (!dataSourceId) return;

            const response = await apiFetch(`/data-sources/${dataSourceId}/datasets/`);
            const datalist = document.getElementById(`dataset_list-${locationId}`);
            if (datalist) {
                datalist.innerHTML = response.datasets
                    .map(ds => `<option value="${ds.name}">`)
                    .join('');
            }

            // Store datasets in state for validation
            StateManager.set(locationId, { 
                existingDatasets: response.datasets 
            });

        } catch (error) {
            console.error('Error loading datasets:', error);
        }
    },

    handleNameInput(event, locationId) {
        const value = event.target.value.trim();
        const validation = this.validateName(value, locationId);
        
        // Update input styling
        event.target.className = `w3-input w3-border ${validation.isValid ? '' : 'w3-border-red'}`;
        
        // Update help text
        const helpText = document.getElementById(`id_dataset_name_help-${locationId}`);
        if (helpText) {
            if (!validation.isValid) {
                helpText.textContent = validation.errors.join('. ');
                helpText.className = 'w3-text-red';
            } else if (validation.isExisting) {
                helpText.textContent = 'Will update existing dataset';
                helpText.className = 'w3-text-blue';
            } else {
                helpText.textContent = 'Will create new dataset';
                helpText.className = 'w3-text-green';
            }
        }

        // Update state
        this.updateDatasetInfo(locationId, {
            name: validation.isValid ? value : null,
            isExisting: validation.isExisting
        });

        // Update next button state through ImportConfigManager
        ImportConfigManager.updateNextButtonState(locationId);
    },

    validateName(name, locationId) {
        if (!name) {
            return {
                isValid: false,
                isExisting: false,
                errors: ['Name is required']
            };
        }

        const errors = [];
        
        // Check format
        if (!/^[a-zA-Z0-9-_ ]+$/.test(name)) {
            errors.push('Name can only contain letters, numbers, spaces, hyphens and underscores');
        }

        // Check length
        if (name.length < 3) {
            errors.push('Name must be at least 3 characters long');
        }

        // Check existing datasets
        const existingDatasets = StateManager.get(locationId, 'existingDatasets') || [];
        const isExisting = existingDatasets.some(ds => 
            ds.name.toLowerCase() === name.toLowerCase()
        );

        return {
            isValid: errors.length === 0,
            isExisting,
            errors
        };
    },

    updateDatasetInfo(locationId, updates) {
        const current = StateManager.get(locationId, 'dataset') || {};
        StateManager.set(locationId, {
            dataset: { ...current, ...updates }
        });
    },

    getCurrentDataset(locationId) {
        return StateManager.get(locationId, 'dataset');
    }
};

// Preview Management
const PreviewManager = {
    async initialize(locationId, content) {
        await this.loadCodeMirror();
        const cmContainer = document.getElementById(`id_codemirror_container-${locationId}`);
        if (!cmContainer) return null;

        cmContainer.style.display = 'block';

        // Initialize preview state
        StateManager.set(locationId, {
            preview: {
                sampleSize: 1000,
                isPartial: false,
                startOffset: 0,
                endOffset: null,
                contentType: this.detectContentType(content),
                markerTypes: new Map(),
                selectedRanges: new Map()
            }
        });

        return this.setupCodeMirror(locationId, content);
    },

    async loadCodeMirror() {
        if (StateManager.isCodeMirrorLoaded()) return;
        
        if (!window.CodeMirror) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        StateManager.setCodeMirrorLoaded(true);
    },

    detectContentType(content) {
        const trimmed = content.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';
        return 'text';
    },

    setupCodeMirror(locationId, content) {
        const instanceId = `${locationId}-${Date.now()}`;
        const textarea = document.getElementById(`id_codemirror_editor-${locationId}`);
        if (!textarea) return null;

        const previewState = StateManager.get(locationId, 'preview');
        const contentType = previewState?.contentType || 'text';

        // Configure editor
        const cm = CodeMirror.fromTextArea(textarea, {
            mode: this.getEditorMode(contentType),
            theme: 'default',
            lineNumbers: true,
            readOnly: false,
            viewportMargin: Infinity,
            lineWrapping: false,
            scrollbarStyle: 'native',
            fixedGutter: true,
            gutters: [
                "CodeMirror-linenumbers", 
                "CodeMirror-linedata",
                "CodeMirror-linemarkers"
            ],
            extraKeys: {
                "Ctrl-F": "findPersistent",
                "Cmd-F": "findPersistent"
            }
        });

        cm.setValue(content);
        cm.refresh();

        // Store instance
        StateManager.setCodeMirrorInstance(locationId, cm);

        // Set up event handlers
        this.setupEventHandlers(locationId, cm);

        // Add preview markers if partial content
        if (previewState?.isPartial) {
            this.addPreviewMarkers(locationId, cm);
        }

        return cm;
    },

    setupEventHandlers(locationId, cm) {
        // Line selection handler
        cm.on("gutterClick", (cm, line, gutter) => {
            if (gutter === "CodeMirror-linedata") {
                LineDefinitionManager.handleLineClick(locationId, line);
            }
        });

        // Text selection handler
        cm.on("beforeSelectionChange", (cm, change) => {
            if (change.ranges && change.ranges[0]) {
                const range = change.ranges[0];
                if (!range.empty()) {
                    this.handleSelection(locationId, range);
                }
            }
        });

        // Scroll handler for loading more content
        cm.on("scroll", () => {
            this.handleScroll(locationId, cm);
        });
    },

    handleSelection(locationId, range) {
        const previewState = StateManager.get(locationId, 'preview');
        if (!previewState) return;

        // Store selection
        const selections = previewState.selectedRanges;
        selections.set('current', range);
        
        // Update state
        StateManager.set(locationId, {
            preview: {
                ...previewState,
                selectedRanges: selections
            }
        });

        // Notify column definition manager
        ColumnDefinitionManager.handleSelection(locationId, range);
    },

    async handleScroll(locationId, cm) {
        const info = cm.getScrollInfo();
        const previewState = StateManager.get(locationId, 'preview');
        
        // Check if we're near the bottom and have more content
        if (previewState?.isPartial && 
            info.top + info.clientHeight > info.height - 100) {
            await this.loadMoreContent(locationId);
        }
    },

    async loadMoreContent(locationId) {
        const previewState = StateManager.get(locationId, 'preview');
        if (!previewState?.isPartial) return;

        const sourceManager = SourceManager.getSourceManager(
            StateManager.get(locationId, 'sourceInfo')?.type
        );

        if (!sourceManager) return;

        try {
            const response = await sourceManager.readMoreContent(
                locationId,
                previewState.endOffset,
                previewState.sampleSize
            );

            if (response?.content) {
                // Append content to editor
                const cm = StateManager.getCodeMirrorInstance(locationId);
                const currentContent = cm.getValue();
                cm.setValue(currentContent + response.content);

                // Update preview state
                StateManager.set(locationId, {
                    preview: {
                        ...previewState,
                        endOffset: previewState.endOffset + response.content.length,
                        isPartial: response.has_more
                    }
                });

                // Refresh markers
                this.refreshMarkers(locationId);
            }
        } catch (error) {
            console.error('Error loading more content:', error);
        }
    },

    getEditorMode(contentType) {
        switch(contentType) {
            case 'json': return 'application/json';
            case 'xml': return 'application/xml';
            default: return 'text/plain';
        }
    },

    addMarker(locationId, line, type, options = {}) {
        const cm = StateManager.getCodeMirrorInstance(locationId);
        if (!cm) return;

        const marker = document.createElement('div');
        marker.className = `marker-${type}`;
        marker.innerHTML = options.icon ? 
            `<i class="bi bi-${options.icon}"></i> ${options.text || type}` :
            options.text || type;

        if (options.style) {
            Object.assign(marker.style, options.style);
        }

        cm.setGutterMarker(line, "CodeMirror-linemarkers", marker);

        // Store marker type
        const previewState = StateManager.get(locationId, 'preview');
        if (previewState) {
            const markers = previewState.markerTypes;
            markers.set(line, type);
            StateManager.set(locationId, {
                preview: {
                    ...previewState,
                    markerTypes: markers
                }
            });
        }
    },

    removeMarker(locationId, line) {
        const cm = StateManager.getCodeMirrorInstance(locationId);
        if (!cm) return;

        cm.setGutterMarker(line, "CodeMirror-linemarkers", null);

        // Remove from stored markers
        const previewState = StateManager.get(locationId, 'preview');
        if (previewState) {
            const markers = previewState.markerTypes;
            markers.delete(line);
            StateManager.set(locationId, {
                preview: {
                    ...previewState,
                    markerTypes: markers
                }
            });
        }
    },

    refreshMarkers(locationId) {
        const previewState = StateManager.get(locationId, 'preview');
        if (!previewState?.markerTypes) return;

        previewState.markerTypes.forEach((type, line) => {
            this.addMarker(locationId, line, type);
        });
    },

    cleanup(locationId) {
        const cm = StateManager.getCodeMirrorInstance(locationId);
        if (cm) {
            cm.toTextArea();
        }
        StateManager.clear(locationId);
    }
};

// Import Configuration Management
const ImportConfigManager = {
    async initialize(locationId) {
        // Initialize base configuration
        StateManager.set(locationId, {
            importConfig: {
                // Source configuration
                source: {
                    type: null,      // 'file', 'api', 'database'
                    format: null,    // 'delimited', 'fixed', 'json', 'xml'
                    config: {}       // Source-specific configuration
                },

                // Structure configuration
                structure: {
                    delimiter: null,
                    encoding: 'utf-8',
                    dataStartLine: null,
                    headerRows: []
                },

                // Time handling
                time: {
                    timezone: 'UTC',
                    format: null,
                    columns: []
                },

                // Processing configuration
                processing: {
                    batchSize: 1000,
                    validateData: true,
                    skipInvalid: false,
                    transformations: []
                },

                // Import status tracking
                status: {
                    sourceReady: false,
                    structureDefined: false,
                    timeConfigured: false,
                    mappingComplete: false,
                    validationPassed: false
                }
            }
        });
    },

    getConfig(locationId) {
        return StateManager.get(locationId, 'importConfig');
    },

    updateConfig(locationId, updates, section = null) {
        const current = this.getConfig(locationId);
        if (!current) return;

        let newConfig;
        if (section) {
            newConfig = {
                ...current,
                [section]: {
                    ...current[section],
                    ...updates
                }
            };
        } else {
            newConfig = {
                ...current,
                ...updates
            };
        }

        // Update status based on configuration
        newConfig.status = this.computeStatus(newConfig);

        StateManager.set(locationId, { importConfig: newConfig });
        this.updateStatusDisplay(locationId);
        return newConfig;
    },

    computeStatus(config) {
        return {
            sourceReady: Boolean(
                config.source.type && 
                config.source.format && 
                Object.keys(config.source.config).length > 0
            ),
            structureDefined: Boolean(
                config.structure.dataStartLine !== null &&
                (config.source.format !== 'delimited' || config.structure.delimiter)
            ),
            timeConfigured: Boolean(
                config.time.format &&
                config.time.columns.length > 0
            ),
            mappingComplete: Boolean(
                MappingManager.getMappings(locationId)?.columnMappings &&
                Object.keys(MappingManager.getMappings(locationId).columnMappings).length > 0
            ),
            validationPassed: false  // Set by ValidationManager
        };
    },

    updateStatusDisplay(locationId) {
        const config = this.getConfig(locationId);
        if (!config) return;

        const statusElements = {
            sourceReady: document.getElementById(`id_source_status-${locationId}`),
            structureDefined: document.getElementById(`id_structure_status-${locationId}`),
            timeConfigured: document.getElementById(`id_time_status-${locationId}`),
            mappingComplete: document.getElementById(`id_mapping_status-${locationId}`),
            validationPassed: document.getElementById(`id_validation_status-${locationId}`)
        };

        Object.entries(config.status).forEach(([key, isComplete]) => {
            const element = statusElements[key];
            if (element) {
                element.innerHTML = `[<i class="bi bi-${isComplete ? 'check' : 'x'}"></i>]`;
                element.className = `w3-text-${isComplete ? 'green' : 'grey'}`;
            }
        });

        // Update next button state
        this.updateNextButtonState(locationId);
    },

    updateNextButtonState(locationId) {
        const nextButton = document.querySelector(`button[onclick*="processDataSource('${locationId}')"]`);
        if (!nextButton) return;

        const config = this.getConfig(locationId);
        const canProceed = config?.status.sourceReady && 
                          config?.status.structureDefined &&
                          (config?.status.timeConfigured || config?.source.type === 'api');

        nextButton.disabled = !canProceed;
    },

    // Integration with source managers
    async applySourceConfig(locationId, sourceConfig) {
        return this.updateConfig(locationId, sourceConfig, 'source');
    },

    // Integration with definition managers
    async applyStructureConfig(locationId, structureConfig) {
        return this.updateConfig(locationId, structureConfig, 'structure');
    },

    // Integration with time handling
    async applyTimeConfig(locationId, timeConfig) {
        return this.updateConfig(locationId, timeConfig, 'time');
    },

    // Integration with processing configuration
    async applyProcessingConfig(locationId, processingConfig) {
        return this.updateConfig(locationId, processingConfig, 'processing');
    },

    // Export configuration for processing
    getProcessingConfig(locationId) {
        const config = this.getConfig(locationId);
        if (!config) return null;

        return {
            source: {
                type: config.source.type,
                format: config.source.format,
                config: config.source.config
            },
            structure: config.structure,
            time: config.time,
            processing: config.processing,
            mappings: MappingManager.getMappings(locationId)
        };
    },

    // Validation integration
    async validate(locationId) {
        const config = this.getConfig(locationId);
        if (!config) return { isValid: false, errors: ['No configuration found'] };

        const validation = await ValidationManager.validateConfig(locationId);
        
        // Update validation status
        this.updateConfig(locationId, {
            status: {
                ...config.status,
                validationPassed: validation.isValid
            }
        });

        return validation;
    }
};

// Validation Management
const ValidationManager = {
    async validateConfig(locationId) {
        // Get configurations from all managers
        const importConfig = ImportConfigManager.getConfig(locationId);
        const mappings = MappingManager.getMappings(locationId);
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');

        const errors = [];
        const warnings = [];

        // Add results from all validation checks
        const results = await Promise.all([
            this.validateSource(locationId),
            this.validateStructure(locationId),
            this.validateTime(locationId),
            this.validateMappings(locationId)
        ]);

        results.forEach(result => {
            if (result.errors) errors.push(...result.errors);
            if (result.warnings) warnings.push(...result.warnings);
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            details: {
                source: results[0],
                structure: results[1],
                time: results[2],
                mappings: results[3]
            }
        };
    },

    async validateSource(locationId) {
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        const importConfig = ImportConfigManager.getConfig(locationId);
        const errors = [];
        const warnings = [];

        if (!sourceInfo?.type) {
            errors.push('Source type not defined');
            return { isValid: false, errors, warnings };
        }

        // Source-specific validation
        switch (sourceInfo.type) {
            case 'file':
                if (!importConfig?.source?.config?.file) {
                    errors.push('No file selected');
                }
                break;
            case 'api':
                if (!importConfig?.source?.config?.endpoint) {
                    errors.push('API endpoint not configured');
                }
                break;
            case 'database':
                if (!importConfig?.source?.config?.query) {
                    errors.push('Database query not configured');
                }
                break;
            default:
                errors.push(`Unknown source type: ${sourceInfo.type}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    },

    async validateStructure(locationId) {
        const importConfig = ImportConfigManager.getConfig(locationId);
        const errors = [];
        const warnings = [];

        if (!importConfig?.structure) {
            errors.push('Structure configuration missing');
            return { isValid: false, errors };
        }

        // Data start validation
        if (importConfig.structure.dataStartLine === null) {
            errors.push('Data start line not defined');
        }

        // Format-specific validation
        switch (importConfig.source.format) {
            case 'delimited':
                if (!importConfig.structure.delimiter) {
                    errors.push('Delimiter not defined');
                }
                break;
            case 'fixed':
                if (!ColumnDefinitionManager.getDefinitions(locationId)?.columns?.length) {
                    errors.push('Fixed width columns not defined');
                }
                break;
            case 'json':
            case 'xml':
                if (!importConfig.structure.path) {
                    warnings.push('No data path specified, will use root');
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    },

    async validateTime(locationId) {
        const importConfig = ImportConfigManager.getConfig(locationId);
        const errors = [];
        const warnings = [];

        if (!importConfig?.time) {
            errors.push('Time configuration missing');
            return { isValid: false, errors };
        }

        // Timezone validation
        if (!importConfig.time.timezone) {
            warnings.push('No timezone specified, using UTC');
        }

        // Time columns validation
        if (!importConfig.time.columns || importConfig.time.columns.length === 0) {
            errors.push('No time columns mapped');
        } else {
            if (!importConfig.time.format) {
                errors.push('Time format not specified');
            }
            // Validate each time column exists
            importConfig.time.columns.forEach(col => {
                if (!ColumnDefinitionManager.getDefinitions(locationId)?.columns
                    .some(c => c.index === col)) {
                    errors.push(`Time column ${col} not found in data`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    },

    async validateMappings(locationId) {
        const mappings = MappingManager.getMappings(locationId);
        const columnDefs = ColumnDefinitionManager.getDefinitions(locationId);
        const errors = [];
        const warnings = [];

        if (!mappings || !columnDefs) {
            errors.push('Mapping or column definitions missing');
            return { isValid: false, errors };
        }

        // Check each column has a valid mapping or is explicitly marked as ignored
        columnDefs.columns.forEach(column => {
            const mapping = mappings.columnMappings[column.index];
            if (!mapping && !mappings.unmappedColumns.includes(column.index)) {
                warnings.push(`Column "${column.name}" has no mapping`);
            }
        });

        // Validate data types match measurement requirements
        Object.entries(mappings.columnMappings).forEach(([colIndex, mapping]) => {
            const columnType = DataTypeManager.getColumnTypeInfo(locationId, colIndex)?.detected;
            if (!this.isTypeCompatible(columnType, mapping.measurementId)) {
                errors.push(`Data type mismatch for column "${columnDefs.columns[colIndex]?.name}"`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    },

    isTypeCompatible(columnType, measurementId) {
        // This would check if the column type is compatible with the measurement
        // Placeholder implementation
        return true;
    },

    canQuickImport(locationId) {
        const importConfig = ImportConfigManager.getConfig(locationId);
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');

        // Basic requirements for all sources
        const hasBasicConfig = Boolean(
            sourceInfo?.type &&
            importConfig?.structure?.dataStartLine !== null
        );

        if (!hasBasicConfig) {
            return {
                canProceed: false,
                reason: 'Missing basic configuration'
            };
        }

        // Source-specific requirements
        switch (sourceInfo.type) {
            case 'file':
                return this.canQuickImportFile(locationId);
            case 'api':
                return this.canQuickImportApi(locationId);
            case 'database':
                return this.canQuickImportDatabase(locationId);
            default:
                return {
                    canProceed: false,
                    reason: `Unknown source type: ${sourceInfo.type}`
                };
        }
    },

    canQuickImportFile(locationId) {
        const importConfig = ImportConfigManager.getConfig(locationId);
        
        if (importConfig.source.format === 'delimited' && !importConfig.structure.delimiter) {
            return {
                canProceed: false,
                reason: 'Delimiter not detected or specified'
            };
        }

        return {
            canProceed: true,
            isUpdate: false
        };
    },

    canQuickImportApi(locationId) {
        const importConfig = ImportConfigManager.getConfig(locationId);
        
        if (!importConfig.source.config.endpoint) {
            return {
                canProceed: false,
                reason: 'API endpoint not configured'
            };
        }

        return {
            canProceed: true,
            isUpdate: false
        };
    },

    canQuickImportDatabase(locationId) {
        const importConfig = ImportConfigManager.getConfig(locationId);
        
        if (!importConfig.source.config.query) {
            return {
                canProceed: false,
                reason: 'Database query not configured'
            };
        }

        return {
            canProceed: true,
            isUpdate: false
        };
    }
};

// Line Definition Management
const LineDefinitionManager = {
    initialize(locationId) {
        StateManager.set(locationId, {
            lineDefinitions: {
                dataStart: null,
                headers: [],    // Array of header line numbers
                fieldTypes: {}, // Map of line number to field type definitions
                ignored: [],    // Array of ignored line numbers
                markers: {}     // Map of line number to marker type
            }
        });
    },

    getDefinitions(locationId) {
        return StateManager.get(locationId, 'lineDefinitions');
    },

    handleLineClick(locationId, lineNumber) {
        const definitions = this.getDefinitions(locationId);
        if (!definitions) return;

        // Show line type menu
        this.showLineTypeMenu(locationId, lineNumber, definitions.markers[lineNumber]);
    },

    showLineTypeMenu(locationId, lineNumber, currentType) {
        // Remove any existing menus
        document.querySelectorAll('.line-type-menu').forEach(menu => menu.remove());

        // Create menu
        const menu = document.createElement('div');
        menu.className = 'line-type-menu w3-card';
        menu.innerHTML = `
            <div class="w3-bar-block">
                <a href="#" class="w3-bar-item w3-button" data-type="data-start">
                    <i class="bi bi-arrow-right-circle"></i> Data Start
                </a>
                <a href="#" class="w3-bar-item w3-button" data-type="header">
                    <i class="bi bi-tag"></i> Header Row
                </a>
                <a href="#" class="w3-bar-item w3-button" data-type="field-type">
                    <i class="bi bi-code-square"></i> Field Type
                </a>
                <a href="#" class="w3-bar-item w3-button" data-type="ignore">
                    <i class="bi bi-eye-slash"></i> Ignore Line
                </a>
                ${currentType ? `
                    <div class="w3-bar-item w3-border-top">
                        <a href="#" class="w3-bar-item w3-button" data-type="clear">
                            <i class="bi bi-x"></i> Clear
                        </a>
                    </div>
                ` : ''}
            </div>
        `;

        // Position menu
        const editor = StateManager.getCodeMirrorInstance(locationId);
        const coords = editor.charCoords({ line: lineNumber, ch: 0 }, 'local');
        const editorPos = editor.getWrapperElement().getBoundingClientRect();

        menu.style.position = 'absolute';
        menu.style.left = (editorPos.left + 50) + 'px';
        menu.style.top = (editorPos.top + coords.top) + 'px';

        // Add click handlers
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-type]');
            if (!item) return;

            e.preventDefault();
            const type = item.dataset.type;

            if (type === 'clear') {
                this.clearLineType(locationId, lineNumber);
            } else {
                this.setLineType(locationId, lineNumber, type);
            }

            menu.remove();
        });

        document.body.appendChild(menu);

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },

    setLineType(locationId, lineNumber, type) {
        const definitions = this.getDefinitions(locationId);
        if (!definitions) return;

        const updates = { ...definitions };

        // Remove line from all current assignments
        updates.headers = updates.headers.filter(l => l !== lineNumber);
        updates.ignored = updates.ignored.filter(l => l !== lineNumber);
        if (updates.dataStart === lineNumber) updates.dataStart = null;
        delete updates.fieldTypes[lineNumber];

        // Add new assignment
        switch (type) {
            case 'data-start':
                updates.dataStart = lineNumber;
                // Update ImportConfigManager
                ImportConfigManager.updateConfig(locationId, {
                    structure: { dataStartLine: lineNumber }
                });
                break;
            case 'header':
                updates.headers.push(lineNumber);
                updates.headers.sort((a, b) => a - b);
                break;
            case 'field-type':
                updates.fieldTypes[lineNumber] = {};
                break;
            case 'ignore':
                updates.ignored.push(lineNumber);
                updates.ignored.sort((a, b) => a - b);
                break;
        }

        // Update markers
        updates.markers = {
            ...updates.markers,
            [lineNumber]: type
        };

        // Update state
        StateManager.set(locationId, { lineDefinitions: updates });

        // Update visual markers
        this.refreshMarkers(locationId);
    },

    clearLineType(locationId, lineNumber) {
        const definitions = this.getDefinitions(locationId);
        if (!definitions) return;

        const updates = {
            ...definitions,
            headers: definitions.headers.filter(l => l !== lineNumber),
            ignored: definitions.ignored.filter(l => l !== lineNumber),
            dataStart: definitions.dataStart === lineNumber ? null : definitions.dataStart
        };

        delete updates.fieldTypes[lineNumber];
        delete updates.markers[lineNumber];

        // Update state
        StateManager.set(locationId, { lineDefinitions: updates });

        // Update ImportConfigManager if clearing data start
        if (definitions.dataStart === lineNumber) {
            ImportConfigManager.updateConfig(locationId, {
                structure: { dataStartLine: null }
            });
        }

        // Update visual markers
        this.refreshMarkers(locationId);
    },

    refreshMarkers(locationId) {
        const definitions = this.getDefinitions(locationId);
        if (!definitions) return;

        const editor = StateManager.getCodeMirrorInstance(locationId);
        if (!editor) return;

        // Clear all markers
        editor.clearGutter('CodeMirror-linemarkers');

        // Add markers for each defined line
        Object.entries(definitions.markers).forEach(([line, type]) => {
            PreviewManager.addMarker(locationId, parseInt(line), type, {
                icon: this.getMarkerIcon(type),
                text: this.getMarkerText(type),
                style: this.getMarkerStyle(type)
            });
        });
    },

    getMarkerIcon(type) {
        const icons = {
            'data-start': 'arrow-right-circle',
            'header': 'tag',
            'field-type': 'code-square',
            'ignore': 'eye-slash'
        };
        return icons[type] || 'question';
    },

    getMarkerText(type) {
        const text = {
            'data-start': 'Data Start',
            'header': 'Header',
            'field-type': 'Field Types',
            'ignore': 'Ignored'
        };
        return text[type] || type;
    },

    getMarkerStyle(type) {
        const styles = {
            'data-start': { color: '#2196F3' },
            'header': { color: '#4CAF50' },
            'field-type': { color: '#9C27B0' },
            'ignore': { color: '#757575' }
        };
        return styles[type] || {};
    }
};

// Column Definition Management
const ColumnDefinitionManager = {
    initialize(locationId) {
        StateManager.set(locationId, {
            columnDefinitions: {
                format: 'delimited',  // 'delimited', 'fixed'
                columns: [],          // Array of column definitions
                selectedColumn: null, // Currently selected column
                markers: {},         // Column markers/highlights
                timestamp: {         // Timestamp column info
                    columns: [],
                    format: null
                }
            }
        });

        // Create column marker container
        this.createMarkerContainer(locationId);
    },

    createMarkerContainer(locationId) {
        const editor = StateManager.getCodeMirrorInstance(locationId);
        if (!editor) return;

        const wrapper = editor.getWrapperElement();
        const container = document.createElement('div');
        container.className = 'column-markers';
        container.id = `column-markers-${locationId}`;
        container.style.cssText = `
            position: relative;
            height: 20px;
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
            overflow: hidden;
            user-select: none;
        `;
        wrapper.insertBefore(container, wrapper.firstChild);
    },

    getDefinitions(locationId) {
        return StateManager.get(locationId, 'columnDefinitions');
    },

    handleSelection(locationId, range) {
        const editor = StateManager.getCodeMirrorInstance(locationId);
        if (!editor) return;

        const defs = this.getDefinitions(locationId);
        if (!defs) return;

        // Get text from selection
        const text = editor.getRange(range.from(), range.to());
        if (!text.trim()) return;

        // Show column action menu
        this.showColumnActionMenu(locationId, range, text);
    },

    showColumnActionMenu(locationId, range, text) {
        // Remove any existing menus
        document.querySelectorAll('.column-menu').forEach(menu => menu.remove());

        const editor = StateManager.getCodeMirrorInstance(locationId);
        const coords = editor.charCoords(range.to(), 'window');

        const menu = document.createElement('div');
        menu.className = 'column-menu w3-card';
        menu.style.cssText = `
            position: fixed;
            top: ${coords.top}px;
            left: ${coords.left + 20}px;
            z-index: 1100;
        `;

        menu.innerHTML = `
            <div class="w3-bar-block">
                <a href="#" class="w3-bar-item w3-button" data-action="create-column">
                    <i class="bi bi-columns"></i> Define Column
                </a>
                <a href="#" class="w3-bar-item w3-button" data-action="timestamp">
                    <i class="bi bi-clock"></i> Set as Timestamp
                </a>
                <a href="#" class="w3-bar-item w3-button" data-action="map-measurement">
                    <i class="bi bi-graph-up"></i> Map to Measurement
                </a>
            </div>
        `;

        menu.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;

            e.preventDefault();
            this.handleColumnAction(locationId, action, {
                range,
                text,
                position: {
                    start: range.from().ch,
                    end: range.to().ch
                }
            });

            menu.remove();
        });

        document.body.appendChild(menu);

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },

    handleColumnAction(locationId, action, selectionInfo) {
        switch (action) {
            case 'create-column':
                this.defineColumn(locationId, selectionInfo);
                break;
            case 'timestamp':
                this.defineTimestampColumn(locationId, selectionInfo);
                break;
            case 'map-measurement':
                this.mapColumnToMeasurement(locationId, selectionInfo);
                break;
        }
    },

    defineColumn(locationId, selectionInfo) {
        const defs = this.getDefinitions(locationId);
        if (!defs) return;

        // Create new column definition
        const newColumn = {
            id: Date.now(),
            name: this.suggestColumnName(defs.columns.length),
            start: selectionInfo.position.start,
            end: selectionInfo.position.end,
            type: DataTypeManager.detectValueType(selectionInfo.text),
            sample: selectionInfo.text
        };

        // Update definitions
        const updates = {
            ...defs,
            columns: [...defs.columns, newColumn],
            selectedColumn: newColumn.id
        };

        StateManager.set(locationId, { columnDefinitions: updates });
        this.refreshColumnMarkers(locationId);
    },

    defineTimestampColumn(locationId, selectionInfo) {
        const defs = this.getDefinitions(locationId);
        if (!defs) return;

        // Add to timestamp columns
        const updates = {
            ...defs,
            timestamp: {
                ...defs.timestamp,
                columns: [...defs.timestamp.columns, {
                    start: selectionInfo.position.start,
                    end: selectionInfo.position.end,
                    sample: selectionInfo.text
                }]
            }
        };

        StateManager.set(locationId, { columnDefinitions: updates });
        this.refreshColumnMarkers(locationId);

        // Update ImportConfigManager
        ImportConfigManager.updateConfig(locationId, {
            time: { columns: updates.timestamp.columns }
        });
    },

    mapColumnToMeasurement(locationId, selectionInfo) {
        // This would open the measurement mapping dialog
        MappingManager.showMappingDialog(locationId, selectionInfo);
    },

    suggestColumnName(index) {
        return `Column${index + 1}`;
    },

    refreshColumnMarkers(locationId) {
        const defs = this.getDefinitions(locationId);
        if (!defs) return;

        const container = document.getElementById(`column-markers-${locationId}`);
        if (!container) return;

        container.innerHTML = '';

        // Add markers for each column
        defs.columns.forEach(column => {
            const marker = document.createElement('div');
            marker.className = 'column-marker';
            marker.style.cssText = `
                position: absolute;
                left: ${column.start * 8}px;
                width: ${(column.end - column.start) * 8}px;
                height: 100%;
                background: ${this.getColumnColor(column)};
                border-right: 1px solid #999;
                cursor: col-resize;
            `;
            marker.setAttribute('data-column-id', column.id);
            
            // Add resize handling
            this.addResizeHandling(marker, locationId, column);
            
            container.appendChild(marker);
        });

        // Add timestamp markers
        defs.timestamp.columns.forEach(column => {
            const marker = document.createElement('div');
            marker.className = 'timestamp-marker';
            marker.style.cssText = `
                position: absolute;
                left: ${column.start * 8}px;
                width: ${(column.end - column.start) * 8}px;
                height: 100%;
                background: #FFE0B2;
                border-right: 1px solid #FB8C00;
            `;
            container.appendChild(marker);
        });
    },

    getColumnColor(column) {
        if (column.id === this.getDefinitions(locationId)?.selectedColumn) {
            return '#E3F2FD';
        }
        return '#F5F5F5';
    },

    addResizeHandling(marker, locationId, column) {
        let startX, startWidth;
        
        const startResize = (e) => {
            startX = e.clientX;
            startWidth = column.end - column.start;
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        };

        const doResize = (e) => {
            const diff = Math.round((e.clientX - startX) / 8);
            this.updateColumnWidth(locationId, column.id, startWidth + diff);
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        };

        marker.addEventListener('mousedown', startResize);
    },

    updateColumnWidth(locationId, columnId, newWidth) {
        const defs = this.getDefinitions(locationId);
        if (!defs) return;

        const columnIndex = defs.columns.findIndex(c => c.id === columnId);
        if (columnIndex === -1) return;

        const updates = {
            ...defs,
            columns: [...defs.columns]
        };

        const column = updates.columns[columnIndex];
        column.end = column.start + Math.max(1, newWidth);

        StateManager.set(locationId, { columnDefinitions: updates });
        this.refreshColumnMarkers(locationId);
    }
};

// Data Type Management
const DataTypeManager = {
    // Standard data types
    TYPES: {
        STRING: 'string',
        INTEGER: 'integer',
        FLOAT: 'float',
        BOOLEAN: 'boolean',
        DATE: 'date',
        DATETIME: 'datetime',
        TIME: 'time',
        NULL: 'null'
    },

    // Initialize type detection for a location
    initialize(locationId) {
        StateManager.set(locationId, {
            typeInfo: {
                detectedTypes: {},     // Map of column index/name to detected type
                confirmedTypes: {},     // User-confirmed types
                typeConfidence: {},     // Confidence scores for detected types
                sampleValues: {}        // Sample values used for detection
            }
        });
    },

    // Detect type for a single value
    detectValueType(value) {
        if (value === null || value === undefined || value.trim() === '') {
            return this.TYPES.NULL;
        }

        // Try numeric types first
        if (!isNaN(value) && value.trim() !== '') {
            return value.includes('.') ? this.TYPES.FLOAT : this.TYPES.INTEGER;
        }

        // Try boolean
        const lowerValue = value.toLowerCase().trim();
        if (['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
            return this.TYPES.BOOLEAN;
        }

        // Try date/time
        if (this.isDateTimeString(value)) {
            if (this.isTimeOnlyString(value)) {
                return this.TYPES.TIME;
            }
            return value.includes(':') ? this.TYPES.DATETIME : this.TYPES.DATE;
        }

        // Default to string
        return this.TYPES.STRING;
    },

    // Detect types for a set of columns
    detectColumnTypes(locationId, sampleData, columnInfo) {
        const typeInfo = {
            detectedTypes: {},
            typeConfidence: {},
            sampleValues: {}
        };

        // Process each column
        columnInfo.forEach(column => {
            const values = sampleData.map(row => row[column.index]);
            const analysis = this.analyzeColumnValues(values);
            
            typeInfo.detectedTypes[column.index] = analysis.detectedType;
            typeInfo.typeConfidence[column.index] = analysis.confidence;
            typeInfo.sampleValues[column.index] = analysis.samples;
        });

        // Update state
        StateManager.set(locationId, { typeInfo });
        return typeInfo;
    },

    // Analyze values in a column to determine type
    analyzeColumnValues(values) {
        const typeStats = {};
        const nonNullValues = values.filter(v => v !== null && v !== undefined && v.trim() !== '');
        
        if (nonNullValues.length === 0) {
            return {
                detectedType: this.TYPES.NULL,
                confidence: 1,
                samples: []
            };
        }

        // Count occurrences of each type
        nonNullValues.forEach(value => {
            const type = this.detectValueType(value);
            typeStats[type] = (typeStats[type] || 0) + 1;
        });

        // Calculate dominant type
        const totalValues = nonNullValues.length;
        let dominantType = this.TYPES.STRING;
        let maxCount = 0;

        Object.entries(typeStats).forEach(([type, count]) => {
            if (count > maxCount) {
                maxCount = count;
                dominantType = type;
            }
        });

        return {
            detectedType: dominantType,
            confidence: maxCount / totalValues,
            samples: this.selectRepresentativeSamples(nonNullValues, dominantType)
        };
    },

    // Select representative sample values for a type
    selectRepresentativeSamples(values, type, maxSamples = 5) {
        // Filter values matching the detected type
        const matchingValues = values.filter(v => 
            this.detectValueType(v) === type
        );

        // Take samples from start, middle, and end
        const samples = new Set();
        if (matchingValues.length <= maxSamples) {
            matchingValues.forEach(v => samples.add(v));
        } else {
            samples.add(matchingValues[0]);
            samples.add(matchingValues[matchingValues.length - 1]);
            
            // Add some values from the middle
            const mid = Math.floor(matchingValues.length / 2);
            const offset = Math.floor(maxSamples / 2);
            for (let i = -offset; i <= offset; i++) {
                if (samples.size < maxSamples) {
                    const idx = mid + i;
                    if (idx > 0 && idx < matchingValues.length) {
                        samples.add(matchingValues[idx]);
                    }
                }
            }
        }

        return Array.from(samples);
    },

    // Validate if a string could be a date/time
    isDateTimeString(value) {
        // Common date/time patterns
        const patterns = [
            /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
            /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
            /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
            /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
            /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/, // YYYY-MM-DD HH:mm:ss
            /^\d{2}:\d{2}:\d{2}$/, // HH:mm:ss
            /^\d{2}:\d{2}$/ // HH:mm
        ];

        return patterns.some(pattern => pattern.test(value.trim()));
    },

    // Check if string is time only
    isTimeOnlyString(value) {
        const timePatterns = [
            /^\d{2}:\d{2}:\d{2}$/, // HH:mm:ss
            /^\d{2}:\d{2}$/ // HH:mm
        ];

        return timePatterns.some(pattern => pattern.test(value.trim()));
    },

    // Get type information for a column
    getColumnTypeInfo(locationId, columnIndex) {
        const typeInfo = StateManager.get(locationId, 'typeInfo');
        if (!typeInfo) return null;

        return {
            detected: typeInfo.detectedTypes[columnIndex],
            confirmed: typeInfo.confirmedTypes[columnIndex],
            confidence: typeInfo.typeConfidence[columnIndex],
            samples: typeInfo.sampleValues[columnIndex]
        };
    },

    // Set confirmed type for a column
    setColumnType(locationId, columnIndex, type) {
        const typeInfo = StateManager.get(locationId, 'typeInfo');
        if (!typeInfo) return;

        const updates = {
            ...typeInfo,
            confirmedTypes: {
                ...typeInfo.confirmedTypes,
                [columnIndex]: type
            }
        };

        StateManager.set(locationId, { typeInfo: updates });
    },

    // Get suggested type conversions
    getSuggestedConversions(fromType, toType) {
        const conversions = {
            [`${this.TYPES.STRING}->${this.TYPES.INTEGER}`]: 'parseInt',
            [`${this.TYPES.STRING}->${this.TYPES.FLOAT}`]: 'parseFloat',
            [`${this.TYPES.STRING}->${this.TYPES.BOOLEAN}`]: 'parseBoolean',
            [`${this.TYPES.STRING}->${this.TYPES.DATE}`]: 'parseDate',
            [`${this.TYPES.STRING}->${this.TYPES.DATETIME}`]: 'parseDateTime',
            [`${this.TYPES.INTEGER}->${this.TYPES.FLOAT}`]: 'toFloat',
            [`${this.TYPES.FLOAT}->${this.TYPES.INTEGER}`]: 'toInteger'
        };

        return conversions[`${fromType}->${toType}`] || null;
    }
};

// Mapping Management
const MappingManager = {
    initialize(locationId) {
        StateManager.set(locationId, {
            mappingInfo: {
                columnMappings: {},      // Map of column index to measurement
                derivedColumns: {},      // Columns created from transformations
                transformations: {},      // Data transformations by column
                unmappedColumns: [],     // Columns without mappings
                timestampColumns: {}     // Special handling for timestamp columns
            }
        });
    },

    // Get all current mappings
    getMappings(locationId) {
        return StateManager.get(locationId, 'mappingInfo');
    },

    // Map a column to a measurement
    mapColumnToMeasurement(locationId, columnIndex, measurementId, options = {}) {
        const mappingInfo = this.getMappings(locationId);
        if (!mappingInfo) return;

        const updates = {
            ...mappingInfo,
            columnMappings: {
                ...mappingInfo.columnMappings,
                [columnIndex]: {
                    measurementId,
                    options: {
                        transform: options.transform || null,
                        scaling: options.scaling || null,
                        validation: options.validation || null
                    }
                }
            },
            unmappedColumns: mappingInfo.unmappedColumns.filter(col => col !== columnIndex)
        };

        StateManager.set(locationId, { mappingInfo: updates });
    },

    // Set up timestamp columns
    mapTimestampColumns(locationId, columnConfig) {
        const mappingInfo = this.getMappings(locationId);
        if (!mappingInfo) return;

        const updates = {
            ...mappingInfo,
            timestampColumns: {
                ...columnConfig,
                format: columnConfig.format || 'YYYY-MM-DD HH:mm:ss'
            }
        };

        StateManager.set(locationId, { mappingInfo: updates });
    },

    // Add a derived column
    addDerivedColumn(locationId, derivedConfig) {
        const mappingInfo = this.getMappings(locationId);
        if (!mappingInfo) return;

        const derivedId = `derived_${Date.now()}`;
        const updates = {
            ...mappingInfo,
            derivedColumns: {
                ...mappingInfo.derivedColumns,
                [derivedId]: {
                    name: derivedConfig.name,
                    sourceColumns: derivedConfig.sourceColumns,
                    transformation: derivedConfig.transformation,
                    resultType: derivedConfig.resultType
                }
            }
        };

        StateManager.set(locationId, { mappingInfo: updates });
        return derivedId;
    },

    // Add transformation to a column
    addTransformation(locationId, columnIndex, transformation) {
        const mappingInfo = this.getMappings(locationId);
        if (!mappingInfo) return;

        const updates = {
            ...mappingInfo,
            transformations: {
                ...mappingInfo.transformations,
                [columnIndex]: [
                    ...(mappingInfo.transformations[columnIndex] || []),
                    transformation
                ]
            }
        };

        StateManager.set(locationId, { mappingInfo: updates });
    },

    // Get suggested mappings based on column properties
    suggestMappings(locationId) {
        const mappingInfo = this.getMappings(locationId);
        const typeInfo = DataTypeManager.getColumnTypeInfo(locationId);
        const columnDefs = ColumnDefinitionManager.getDefinitions(locationId);

        if (!mappingInfo || !typeInfo || !columnDefs) return {};

        const suggestions = {};

        columnDefs.columns.forEach(column => {
            const columnType = typeInfo.detected[column.index];
            const columnName = column.name.toLowerCase();

            // Suggest timestamp mapping
            if (this.isLikelyTimestamp(columnName, columnType)) {
                suggestions[column.index] = {
                    type: 'timestamp',
                    confidence: 0.9
                };
                return;
            }

            // Suggest measurement mappings
            const measurementMatches = this.findMeasurementMatches(columnName, columnType);
            if (measurementMatches.length > 0) {
                suggestions[column.index] = {
                    type: 'measurement',
                    matches: measurementMatches
                };
            }
        });

        return suggestions;
    },

    isLikelyTimestamp(columnName, columnType) {
        const timestampPatterns = [
            'time', 'date', 'timestamp', 'datetime'
        ];
        
        return (
            timestampPatterns.some(pattern => columnName.includes(pattern)) ||
            columnType === DataTypeManager.TYPES.DATETIME ||
            columnType === DataTypeManager.TYPES.DATE
        );
    },

    findMeasurementMatches(columnName, columnType) {
        // This would integrate with your measurement system to find matches
        // based on name similarity and data type compatibility
        return []; // Placeholder
    },

    // Validate mappings
    validateMappings(locationId) {
        const mappingInfo = this.getMappings(locationId);
        if (!mappingInfo) return { isValid: false, errors: ['No mapping information found'] };

        const errors = [];
        const warnings = [];

        // Check timestamp mapping
        if (!mappingInfo.timestampColumns || Object.keys(mappingInfo.timestampColumns).length === 0) {
            errors.push('No timestamp columns mapped');
        }

        // Check measurement mappings
        const mappedColumns = Object.keys(mappingInfo.columnMappings).length;
        const totalColumns = ColumnDefinitionManager.getDefinitions(locationId)?.columns.length || 0;

        if (mappedColumns === 0) {
            errors.push('No columns mapped to measurements');
        } else if (mappedColumns < totalColumns) {
            warnings.push(`${totalColumns - mappedColumns} columns unmapped`);
        }

        // Check transformations
        Object.entries(mappingInfo.transformations).forEach(([columnIndex, transforms]) => {
            if (transforms.length > 0) {
                const lastTransform = transforms[transforms.length - 1];
                const mapping = mappingInfo.columnMappings[columnIndex];
                
                if (!mapping) {
                    warnings.push(`Column ${columnIndex} has transformations but no measurement mapping`);
                } else if (!this.isTransformationCompatible(lastTransform, mapping)) {
                    errors.push(`Transformation result not compatible with measurement for column ${columnIndex}`);
                }
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    },

    isTransformationCompatible(transform, mapping) {
        // This would check if transformation output matches measurement requirements
        return true; // Placeholder
    },

    // Get computed value for a cell based on mappings
    computeMappedValue(locationId, columnIndex, value) {
        const mappingInfo = this.getMappings(locationId);
        if (!mappingInfo) return value;

        // Apply transformations
        const transforms = mappingInfo.transformations[columnIndex] || [];
        let transformedValue = value;

        for (const transform of transforms) {
            transformedValue = this.applyTransformation(transform, transformedValue);
        }

        return transformedValue;
    },

    applyTransformation(transform, value) {
        switch (transform.type) {
            case 'multiply':
                return value * transform.factor;
            case 'divide':
                return value / transform.factor;
            case 'add':
                return value + transform.amount;
            case 'subtract':
                return value - transform.amount;
            case 'replace':
                return value.replace(transform.find, transform.replace);
            case 'custom':
                return transform.function(value);
            default:
                return value;
        }
    }
};

export const processMeasurementChoices = (data) => {
    if (data?.measurement?.fields) {
        const unitField = data.measurement.fields.find(f => f.name === 'unit_id');
        if (unitField) {
            // Organize measurement choices hierarchically
            const categories = unitField.choices?.categories || [];
            const units = unitField.choices?.units || [];
            
            // Add unit information to each category
            categories.forEach(category => {
                category.units = units.filter(unit => unit.category_id === category.id);
            });

            // Update the choices structure
            unitField.choices = {
                categories,
                units,
                structured: categories // Categories with nested units
            };
        }
    }
    return data;
};

export const processDataSource = async (locationId) => {
    try {
        // 1. Validate readiness for processing
        const validationResult = ValidationManager.canQuickImport(locationId);
        if (!validationResult.canProceed) {
            throw new Error(validationResult.reason || 'Missing required configuration');
        }

        // 2. Get configurations from all managers
        const sourceInfo = StateManager.get(locationId, 'sourceInfo');
        const importConfig = ImportConfigManager.getConfig(locationId);
        const lineDefinitions = LineDefinitionManager.getDefinitions(locationId);
        const columnDefinitions = ColumnDefinitionManager.getDefinitions(locationId);
        const mappings = MappingManager.getMappings(locationId);

        // 3. Combine configurations for processing
        const processingConfig = {
            source: {
                type: sourceInfo.type,
                info: sourceInfo[`${sourceInfo.type}Info`],
                config: importConfig.source.config
            },
            structure: {
                format: importConfig.structure.format,
                dataStartLine: lineDefinitions.dataStart,
                headerRows: lineDefinitions.headers,
                columns: columnDefinitions.columns,
                delimiter: importConfig.structure.delimiter
            },
            time: {
                timezone: importConfig.time.timezone,
                format: importConfig.time.format,
                columns: columnDefinitions.timestamp.columns
            },
            mappings: {
                columns: mappings.columnMappings,
                transformations: mappings.transformations
            },
            processing: {
                batchSize: importConfig.processing.batchSize || 1000,
                validateData: importConfig.processing.validateData !== false,
                skipInvalid: importConfig.processing.skipInvalid || false
            }
        };

        // 4. Start processing
        const sourceManager = SourceManager.getSourceManager(sourceInfo.type);
        if (!sourceManager) {
            throw new Error(`Unsupported source type: ${sourceInfo.type}`);
        }

        // 5. Set up progress tracking
        let processedCount = 0;
        const updateProgress = (processed, total) => {
            processedCount = processed;
            SourceManager.updateProgress(locationId, processed, total);
        };

        // 6. Process in streaming fashion
        let hasMore = true;
        let position = 0;

        while (hasMore) {
            // Request next batch
            const response = await sourceManager.readMoreContent(
                locationId,
                position,
                processingConfig.processing.batchSize
            );

            if (!response) {
                throw new Error('Failed to read from source');
            }

            // Process batch
            const result = await apiFetch('/api/process-batch/', {
                method: 'POST',
                body: JSON.stringify({
                    config: processingConfig,
                    data: response.content,
                    position: position,
                    isFirst: position === 0,
                    isLast: !response.has_more
                })
            });

            // Update progress
            position += response.content.length;
            hasMore = response.has_more;
            updateProgress(processedCount + result.processed, result.total);

            // Handle any errors
            if (result.errors && result.errors.length > 0) {
                if (!processingConfig.processing.skipInvalid) {
                    throw new Error(`Processing errors encountered: ${result.errors[0]}`);
                }
                // Log errors if continuing
                console.warn('Processing errors:', result.errors);
            }
        }

        // 7. Show success message
        SourceManager.updateSourceStatus(
            locationId, 
            'success', 
            'Processing completed successfully'
        );

        // 8. Clean up
        if (validationResult.isUpdate) {
            // Show update success message
            PreviewManager.addNotice(locationId, {
                type: 'success',
                message: 'Dataset updated successfully'
            });
        } else {
            // Close modal for new datasets
            hideMeasurementModal(locationId);
        }

    } catch (error) {
        // Show error in UI
        SourceManager.updateSourceStatus(locationId, 'error', error.message);
        PreviewManager.addNotice(locationId, {
            type: 'error',
            message: error.message
        });
        throw error;
    }
};

// Initialize MODEL_FIELDS from API
export const initializeModelFields = async () => {
    if (modelFieldsPromise) {
        return modelFieldsPromise;
    }

    modelFieldsPromise = apiFetch('/model-fields/')
        .then(data => {
            // Process measurement choices before storing
            MODEL_FIELDS = processMeasurementChoices(data);
            return MODEL_FIELDS;
        })
        .catch(error => {
            console.error('Error initializing MODEL_FIELDS:', error);
            throw error;
        });

    return modelFieldsPromise;
};
// Helper function to ensure MODEL_FIELDS is initialized
const ensureInitialized = async () => {
    if (!MODEL_FIELDS) {
        await initializeModelFields();
    }
    return MODEL_FIELDS;
};


// Generalizing the input type mapping
const getInputType = (fieldConfig) => {
    // Base type mappings
    const typeMap = {
        'CharField': 'text',
        'TextField': 'text',
        'IntegerField': 'number',
        'DecimalField': 'number',
        'BooleanField': 'checkbox',
        'DateField': 'date',
        'DateTimeField': 'datetime-local',
        'EmailField': 'email',
        'URLField': 'url'
    };

    // Handle special cases
    if (fieldConfig.is_foreign_key || fieldConfig.type === 'choice') {
        return 'select';
    }

    return typeMap[fieldConfig.type] || 'text';
};

// Helper function for consistent field ID generation
export const getFieldId = (type, field, id) => {
    const fieldName = typeof field === 'string' ? field : field.name;
    return `field_${type}_${fieldName}_${id}`;
};

const hideColumnSelectionMenus = (locationId) => {
    if (columnSelectionMenus[locationId]) {
        if (columnSelectionMenus[locationId].actionMenu) {
            columnSelectionMenus[locationId].actionMenu.remove();
        }
        if (columnSelectionMenus[locationId].dropdownMenu) {
            columnSelectionMenus[locationId].dropdownMenu.remove();
        }
        delete columnSelectionMenus[locationId];
    }
};

const showColumnActionMenu = (editor, locationId) => {
    hideColumnSelectionMenus(locationId);

    const selection = editor.getSelection();
    if (!selection) return;

    const to = editor.getCursor('to');
    const coords = editor.charCoords(to, 'window');
    
    console.log('Menu coordinates:', coords);
    console.log('Creating menu at:', {
        top: coords.top,
        left: coords.left + 20
    });

    const menu = document.createElement('div');
    menu.className = 'action-menu';
    menu.style.cssText = `
        position: fixed;  /* Changed from absolute */
        top: ${coords.top}px;
        left: ${(coords.left + 20)}px;
        z-index: 1100;   /* Increased z-index */
        background: white;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        cursor: pointer;
        padding: 2px;
    `;

    // Add a visible background and border
    menu.innerHTML = `
        <button class="w3-button w3-white w3-border" style="padding: 4px; min-width: 30px;">
            <i class="bi bi-three-dots-vertical"></i>
        </button>
    `;

    menu.onclick = (e) => {
        console.log('Menu clicked');
        e.stopPropagation();
        showColumnDropdownMenu(editor, coords, locationId);
    };

    document.body.appendChild(menu);
    console.log('Menu added to document');
    
    columnSelectionMenus[locationId] = {
        actionMenu: menu,
        dropdownMenu: null
    };
};

const showColumnDropdownMenu = (editor, coords, locationId) => {
    if (columnSelectionMenus[locationId]?.dropdownMenu) {
        columnSelectionMenus[locationId].dropdownMenu.remove();
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'w3-card w3-white';
    dropdown.style.cssText = `
        position: absolute;
        top: ${coords.top}px;
        left: ${coords.left + 40}px;
        z-index: 1001;
        min-width: 150px;
    `;

    dropdown.innerHTML = `
        <div class="w3-bar-block">
            <a href="#" class="w3-bar-item w3-button" data-action="data-start">
                <i class="bi bi-arrow-right-circle"></i> Data Start
            </a>
            <a href="#" class="w3-bar-item w3-button" data-action="data-type">
                <i class="bi bi-graph-up"></i> Data Type
            </a>
            <a href="#" class="w3-bar-item w3-button" data-action="timestamp">
                <i class="bi bi-clock"></i> Time Stamp
            </a>
        </div>
    `;

    dropdown.querySelectorAll('.w3-bar-item').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const action = e.currentTarget.dataset.action;
            console.log('Selected action:', action);
            hideColumnSelectionMenus(locationId);
        };
    });

    document.body.appendChild(dropdown);
    columnSelectionMenus[locationId].dropdownMenu = dropdown;
};

const initializeColumnSelection = (locationId) => {
    const instanceId = getModalInstanceId(locationId);
    console.log('Initializing column selection for instance:', instanceId);
    
    const editor = codeMirrorInstances[instanceId];
    console.log('Editor found:', editor);
    
    if (!editor) {
        console.log('No editor found for locationId:', locationId);
        return;
    }

    console.log('Setting up selection events');

    // Try multiple event types to see which one fires
    editor.on('cursorActivity', () => {
        console.log('Cursor Activity');
        const selection = editor.getSelection();
        console.log('Selection from cursor:', selection);
    });

    editor.on('select', () => {
        console.log('Select Event');
        const selection = editor.getSelection();
        console.log('Selection from select:', selection);
    });

    editor.getWrapperElement().addEventListener('mouseup', () => {
        console.log('Mouse Up on wrapper');
        setTimeout(() => {
            const selection = editor.getSelection();
            console.log('Selection from mouseup:', selection);
            if (selection && selection.trim()) {
                showColumnActionMenu(editor, locationId);
            }
        }, 50);  // Slight delay to ensure selection is complete
    });

    // Add explicit test method to editor
    editor.testSelection = () => {
        console.log('Manual test of selection');
        const selection = editor.getSelection();
        console.log('Current selection:', selection);
        if (selection && selection.trim()) {
            showColumnActionMenu(editor, locationId);
        }
    };
};

// Modal management functions
export const showMeasurementModal = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    // Generate and store instance ID
    const instanceId = PreviewManager.generateInstanceId(locationId);
    modal.dataset.instanceId = instanceId;

    // Show modal
    modal.style.display = 'block';
    
    // Set up resize observer for CodeMirror refresh
    const modalContent = modal.querySelector('.w3-modal-content');
    if (modalContent) {
        const resizeObserver = new ResizeObserver(entries => {
            // Refresh CodeMirror when modal is resized
            const editor = StateManager.get(locationId, 'editor')?.instance;
            if (editor) {
                editor.refresh();
            }
        });
        
        resizeObserver.observe(modalContent);

        // Clean up observer when modal is closed
        const cleanup = () => {
            resizeObserver.disconnect();
            modal.removeEventListener('hide', cleanup);
        };
        
        modal.addEventListener('hide', cleanup);
    }

    // Handle Escape key
    const handleEscape = (event) => {
        if (event.key === 'Escape') {
            hideMeasurementModal(locationId);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle click outside modal
    const handleOutsideClick = (event) => {
        if (event.target === modal) {
            hideMeasurementModal(locationId);
            modal.removeEventListener('click', handleOutsideClick);
        }
    };
    modal.addEventListener('click', handleOutsideClick);
};

export const hideMeasurementModal = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    const instanceId = modal.dataset.instanceId;
    if (instanceId && codeMirrorInstances[instanceId]) {
        codeMirrorInstances[instanceId].toTextArea();
        delete codeMirrorInstances[instanceId];
    }

    // Clean up column selection
    hideColumnSelectionMenus(locationId);

    delete modal.dataset.instanceId;
    modal.style.display = 'none';
    
    // Clear both IDs and file input
    const fileInput = document.getElementById(`id_file_input-${locationId}`);
    const datasetIdInput = document.getElementById(`id_dataset_id-${locationId}`);
    const importIdInput = document.getElementById(`id_import_id-${locationId}`);
    
    if (fileInput) fileInput.value = '';
    if (datasetIdInput) datasetIdInput.value = '';
    if (importIdInput) importIdInput.value = '';
    
    // Reset file display
    const fileDisplay = document.getElementById(`id_file_display-${locationId}`);
    if (fileDisplay) {
        fileDisplay.innerHTML = '<i class="bi bi-file-earmark"></i> No file selected';
        fileDisplay.className = 'w3-panel w3-pale-blue w3-leftbar w3-border-blue file-display';
    }
    
    const cmContainer = document.getElementById(`id_codemirror_container-${locationId}`);
    if (cmContainer) {
        cmContainer.style.display = 'none';
        const notice = cmContainer.querySelector('.w3-panel');
        if (notice) notice.remove();
    }

    const nextButton = document.querySelector(`button[onclick*="processFile('${locationId}')"]`);
    if (nextButton) {
        nextButton.disabled = true;
    }
};

// Add our new file handling functions here
export const handleFileSelect = (locationId) => {
    const fileInput = document.getElementById(`id_file_input-${locationId}`);
    if (fileInput) {
        fileInput.click();
    }
};

export const handleFileChange = async (event, locationId) => {
    console.log('handleFileChange CALLED', { 
        event, 
        locationId, 
        target: event.target, 
        files: event.target.files,
        targetId: event.target.id
    });

    const file = event.target.files[0];
    if (!file) return;

    try {
        // Update display to loading
        FileManager.updateFileDisplay(locationId, file, 'loading');

        // Handle file upload
        const response = await FileManager.handleUpload(file, locationId);

        // Update display to success
        FileManager.updateFileDisplay(locationId, file, 'success');

        // Initialize dataset name input
        await DatasetManager.initialize(locationId);
        
        // Setup preview with CodeMirror
        const editor = await PreviewManager.initialize(locationId, response.preview_content);
        
        if (editor && response.preview_content) {
            // Initialize managers
            ImportConfigManager.initialize(locationId);
            LineDefinitionManager.initialize(locationId);
            ColumnDefinitionManager.initialize(locationId);
            
            // Detect and update file properties
            const fileProperties = FileManager.detectFileProperties(response.preview_content);
            ImportConfigManager.updateConfig(locationId, fileProperties);

            // Show import controls
            const importControls = document.getElementById(`id_import_controls-${locationId}`);
            if (importControls) {
                importControls.style.display = 'block';
                importControls.classList.remove('w3-hide');
                importControls.classList.add('w3-show');
            }

            if (response.preview_truncated) {
                const cmContainer = document.getElementById(`id_codemirror_container-${locationId}`);
                if (cmContainer) {
                    const notice = document.createElement('div');
                    notice.className = 'w3-panel w3-pale-yellow w3-leftbar w3-border-yellow';
                    notice.innerHTML = '<i class="bi bi-info-circle"></i> File content truncated for preview';
                    cmContainer.appendChild(notice);
                }
            }
        }

    } catch (error) {
        console.error('Error in handleFileChange:', error);
        FileManager.updateFileDisplay(locationId, file, 'error', error.message);
    }
};

export const processFile = async (locationId) => {
    try {
        if (!ValidationManager.canQuickImport(locationId)) {
            throw new Error('Missing required configuration');
        }

        const config = ImportConfigManager.getConfig(locationId);
        const datasetId = StateManager.get(locationId, 'dataset')?.id;
        
        if (!datasetId) {
            throw new Error('Dataset ID not found');
        }

        await apiFetch(`/datasets/${datasetId}/analyze/`, {
            method: 'POST',
            body: JSON.stringify(config)
        });

    } catch (error) {
        console.error('Error in processFile:', error);
        throw error;
    }
};



const getUnitDisplayInfo = (type, unitId, modelFields) => {
    if (!unitId || !modelFields) return null;

    const unitField = modelFields[type]?.fields.find(f => f.name === 'unit_id');
    if (!unitField?.choices?.units) return null;

    const unit = unitField.choices.units.find(u => u.id === parseInt(unitId, 10));
    if (!unit) return null;

    return {
        unit: unit.display_name,
        category: unitField.choices.categories.find(c => c.id === unit.category_id)?.display_name,
        type: `${unit.type_name} (${unit.type_symbol})`
    };
};

export const validateMeasurementForm = (data) => {
    const errors = {};

    if (!data.unit_id) {
        errors.unit_id = 'Unit is required';
    }

    if (!data.name) {
        errors.name = 'Name is required';
    }

    // New validation for multiplier
    if (data.multiplier && !data.type_supports_multipliers) {
        errors.multiplier = 'This measurement type does not support multipliers';
    }

    // Timezone validation (defaults to UTC if not provided)
    if (data.source_timezone) {
        try {
            Intl.DateTimeFormat(undefined, {timeZone: data.source_timezone});
        } catch (e) {
            errors.source_timezone = 'Invalid timezone';
        }
    }

    return Object.keys(errors).length > 0 ? errors : null;
};
const validateUnitConsistency = (type, selectedUnit, modelFields) => {
    if (!selectedUnit || !modelFields) return true;

    const unitField = modelFields[type]?.fields.find(f => f.name === 'unit_id');
    if (!unitField?.choices?.units) return true;

    const unit = unitField.choices.units.find(u => u.id === parseInt(selectedUnit, 10));
    if (!unit) return false;

    // Add validation to ensure unit matches type
    if (unit.type_id !== modelFields.selected_type_id) {
        return false;
    }

    return true;
};

export const clearFormErrors = (type, id) => {
    const form = document.getElementById(`id_${type}Form-${id}`);
    if (!form) return;

    // Remove error display
    const errorDisplay = document.getElementById(`id_${type}Error-${form.id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }

    // Remove error highlighting from fields
    const fields = form.querySelectorAll('input, select');
    fields.forEach(field => {
        field.classList.remove('error');
    });
};
// Display form errors
const showFormError = (form, error, type) => {
    // Remove any existing error displays
    const existingError = document.getElementById(`id_${type}Error-${form.id}`);
    if (existingError) {
        existingError.remove();
    }

    // Create error display
    const errorDisplay = document.createElement('div');
    errorDisplay.id = `id_${type}Error-${form.id}`;
    errorDisplay.className = 'w3-text-red';
    errorDisplay.style.marginTop = '4px';

    // Handle different error formats
    let errorMessage = '';
    if (error.message) {
        errorMessage = error.message;
    } else if (typeof error === 'object') {
        // Handle validation errors for measurement fields
        const messages = [];
        Object.entries(error).forEach(([field, msg]) => {
            if (field === 'unit_id') {
                messages.push('Please select a valid unit');
            } else if (field === 'category') {
                messages.push('Invalid measurement category');
            } else if (field === 'type') {
                messages.push('Invalid measurement type');
            } else {
                messages.push(`${field}: ${msg}`);
            }
        });
        errorMessage = messages.join('\n');
    } else {
        errorMessage = String(error);
    }

    errorDisplay.textContent = errorMessage;

    // Add error highlighting to relevant fields
    fields.forEach(field => {
        const element = document.getElementById(getFieldId(type, field, form.id));
        if (element) {
            if (error[field]) {
                element.classList.add('error');
            } else {
                element.classList.remove('error');
            }
        }
    });

    form.appendChild(errorDisplay);
};

const createField = (field, type, tempId, fieldInfo) => {
    // Create select for choice fields, input for others
    const element = fieldInfo?.type === 'choice' ? 'select' : 'input';
    const input = document.createElement(element);
    
    // Set common attributes
    input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
    input.name = field;
    input.className = 'tree-item-field editing';
    
    if (fieldInfo?.type === 'choice' && fieldInfo.choices) {
        // Add empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
        input.appendChild(emptyOption);

        // Add choices
        fieldInfo.choices.forEach(choice => {
            const option = document.createElement('option');
            option.value = choice.id;
            option.textContent = choice.display_name;
            input.appendChild(option);
        });
    } else {
        // Regular input field
        input.type = fieldInfo?.type === 'date' ? 'date' : 'text';
        input.placeholder = field.replace(/_/g, ' ');
    }

    // Make sure field is visible during edit/create
    input.style.display = 'inline';

    if (fieldInfo?.required) {
        input.required = true;
    }

    return input;
};

// Create edit controls for forms
const createEditControls = (type, id) => {
    const controls = document.createElement('span');
    controls.id = `id_${type}EditControls-${id}`;
    controls.style.display = 'inline-flex';
    controls.innerHTML = `
        <button type="submit" class="w3-button" style="padding: 0 4px;">
            <i class="bi bi-check w3-large"></i>
        </button>
        <button type="button" class="w3-button" style="padding: 0 4px;">
            <i class="bi bi-x w3-large"></i>
        </button>
    `;
    return controls;
};

// Collect and validate form data
const collectFormData = (type, id, fields, modelInfo) => {
    const data = {};
    fields.forEach(field => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (element) {
            const value = element.value.trim();
            const fieldConfig = modelInfo.fields.find(f => f.name === field);

            if (!value && fieldConfig?.required) {
                throw new Error(`${field.replace(/_/g, ' ')} is required`);
            }

            // Handle unit selection
            if (field === 'unit_id') {
                if (value) {
                    data.unit_id = parseInt(value, 10);
                    const selectedOption = element.options[element.selectedIndex];
                    if (selectedOption) {
                        data.category_id = parseInt(selectedOption.dataset.categoryId, 10);
                        data.type_id = parseInt(selectedOption.dataset.typeId, 10);
                        // Add support for multiplier validation
                        data.type_supports_multipliers = selectedOption.dataset.supportsMultipliers === 'true';
                    }
                } else {
                    data.unit_id = null;
                }
            }
            // Handle multiplier field
            else if (field === 'multiplier') {
                data.multiplier = value || null;
            }
            // Handle timezone field - ensure UTC default
            else if (field === 'source_timezone') {
                data.source_timezone = value || 'UTC';
            }
            // Handle other fields
            else if (fieldConfig?.is_foreign_key) {
                data[field] = value ? parseInt(value, 10) : null;
            }
            else if (fieldConfig?.type === 'choice') {
                data[field] = value || null;
            }
            else {
                data[field] = value || null;
            }
        }
    });
    return data;
};




// Utility functions for handling measurement units

export const handleUnitChange = (unitElement, type, id) => {
    if (!unitElement) return;

    const selectedOption = unitElement.options[unitElement.selectedIndex];
    if (!selectedOption) return;

    const categoryDisplay = document.getElementById(getFieldId(type, 'category', id));
    const typeDisplay = document.getElementById(getFieldId(type, 'type', id));
    const displayDiv = document.getElementById(getFieldId(type, 'unit_display', id));

    if (selectedOption.value) {
        // Update displays
        if (categoryDisplay) {
            categoryDisplay.textContent = selectedOption.dataset.categoryName || '';
            categoryDisplay.style.display = 'inline-block';
        }
        
        if (typeDisplay) {
            typeDisplay.textContent = selectedOption.dataset.typeName || '';
            typeDisplay.style.display = 'inline-block';
        }

        if (displayDiv) {
            displayDiv.textContent = selectedOption.text;
            displayDiv.style.display = 'inline-block';
        }

        // Store the selected values
        unitElement.dataset.selectedCategoryId = selectedOption.dataset.categoryId;
        unitElement.dataset.selectedTypeId = selectedOption.dataset.typeId;
        unitElement.dataset.selectedDisplay = selectedOption.text;
    } else {
        // Clear displays if no unit selected
        if (categoryDisplay) {
            categoryDisplay.textContent = '';
            categoryDisplay.style.display = 'none';
        }
        
        if (typeDisplay) {
            typeDisplay.textContent = '';
            typeDisplay.style.display = 'none';
        }

        if (displayDiv) {
            displayDiv.textContent = '';
            displayDiv.style.display = 'none';
        }

        // Clear stored values
        delete unitElement.dataset.selectedCategoryId;
        delete unitElement.dataset.selectedTypeId;
        delete unitElement.dataset.selectedDisplay;
    }
};

export const attachUnitChangeHandler = (element, type, id) => {
    if (!element) return;

    const changeHandler = () => handleUnitChange(element, type, id);
    element.addEventListener('change', changeHandler);

    // Store the handler reference for potential cleanup
    element.dataset.changeHandler = changeHandler;

    // Initial update
    handleUnitChange(element, type, id);

    return changeHandler;
};

export const removeUnitChangeHandler = (element) => {
    if (!element || !element.dataset.changeHandler) return;

    element.removeEventListener('change', element.dataset.changeHandler);
    delete element.dataset.changeHandler;
};

export const setupMeasurementHandlers = (type, id) => {
    const unitElement = document.getElementById(getFieldId(type, 'unit_id', id));
    if (unitElement) {
        attachUnitChangeHandler(unitElement, type, id);
    }
};

export const cleanupMeasurementHandlers = (type, id) => {
    const unitElement = document.getElementById(getFieldId(type, 'unit_id', id));
    if (unitElement) {
        removeUnitChangeHandler(unitElement);
    }
};

// Add new item function
export const addItem = async (type, fields, parentId = null) => {
    try {
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        // Create temporary form container with unique ID
        const tempId = `temp-${type}-${Date.now()}`;
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        // Create form wrapper div
        const formWrapper = document.createElement('div');
        formWrapper.className = 'tree-text';
        formWrapper.id = `id_form-${type}-${tempId}`;

        // Create form
        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;

        // Add CSRF token
        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = 'csrfmiddlewaretoken';
        csrfInput.value = CSRF_TOKEN;
        form.appendChild(csrfInput);

        // Add type ID if needed
        const typeIdInput = document.createElement('input');
        typeIdInput.type = 'hidden';
        typeIdInput.name = `${type}_id`;
        typeIdInput.value = tempId;
        form.appendChild(typeIdInput);

        // Add parent ID if needed
        if (parentId && modelInfo.parent_type) {
            const parentInput = document.createElement('input');
            parentInput.type = 'hidden';
            parentInput.name = 'parent_id';
            parentInput.value = parentId;
            form.appendChild(parentInput);
        }

        // Create fields container
        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'fields-container';
        fieldsContainer.style.display = 'inline-flex';

        // Create and add fields
        fields.forEach(field => {
            const fieldConfig = modelInfo.fields.find(f => f.name === field);
            const fieldElement = createField(field, type, tempId, fieldConfig);
            fieldsContainer.appendChild(fieldElement);
        });

        form.appendChild(fieldsContainer);

        // Add edit controls
        const controls = document.createElement('span');
        controls.id = `id_${type}EditControls-${tempId}`;
        controls.style.display = 'inline-flex';
        controls.style.marginLeft = '4px';
        controls.innerHTML = `
            <button type="submit" class="w3-button" style="padding: 0 4px;" onclick="event.stopPropagation()">
                <i class="bi bi-check w3-large"></i>
            </button>
            <button type="button" class="w3-button" style="padding: 0 4px;">
                <i class="bi bi-x w3-large"></i>
            </button>
        `;
        form.appendChild(controls);

        // Assemble the structure
        formWrapper.appendChild(form);
        tempContainer.appendChild(formWrapper);

        // Find parent container
        const parentContainer = parentId ?
            document.getElementById(`id_${modelInfo.parent_type}-${parentId}`) :
            document.querySelector('.tree-headings');

        if (!parentContainer) {
            throw new Error('Parent container not found');
        }

        // Insert in appropriate location
        if (parentId) {
            parentContainer.classList.remove('w3-hide');
            parentContainer.classList.add('w3-show');
            parentContainer.insertAdjacentElement('afterbegin', tempContainer);
            
            const chevronIcon = document.getElementById(`id_chevronIcon-id_${modelInfo.parent_type}-${parentId}`);
            if (chevronIcon) {
                chevronIcon.className = "bi bi-chevron-down";
            }
        } else {
            parentContainer.insertAdjacentElement('afterend', tempContainer);
        }

        // Handle form submission
        form.onsubmit = async (event) => {
            event.preventDefault();
            try {
                const data = {};
                fields.forEach(field => {
                    const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`);
                    if (element) {
                        data[field] = element.value;
                    }
                });

                if (parentId && modelInfo.parent_type) {
                    data[modelInfo.parent_type] = parseInt(parentId, 10);
                }

                const response = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                // Create temp div to hold new HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = response.html;
                
                // Find and replace tree item
                const treeItem = tempDiv.querySelector('.tree-item');
                if (treeItem) {
                    tempContainer.replaceWith(treeItem);
                    const containerDiv = Array.from(tempDiv.children).find(
                        child => child.classList.contains('w3-container')
                    );
                    if (containerDiv) {
                        treeItem.after(containerDiv);
                    }
                } else {
                    console.error('No tree item found in response HTML');
                }

            } catch (error) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'w3-text-red';
                errorDiv.style.marginTop = '4px';
                errorDiv.textContent = error.message;
                form.appendChild(errorDiv);
            }
        };

        // Handle cancel
        const cancelButton = controls.querySelector('button[type="button"]');
        cancelButton.onclick = () => tempContainer.remove();

        // Focus first field
        form.querySelector('input, select')?.focus();

    } catch (error) {
        console.error('Error in addItem:', error);
        alert(error.message || 'Failed to initialize form. Please try again.');
    }
};

// Update existing functions to use the new ID pattern
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();
    clearFormErrors(type, id);
    
    try {
        const modelFields = await ensureInitialized();
        const typeConfig = modelFields[type];
        const data = {};
        let hasErrors = false;

        const parentIdInput = event.target.querySelector('input[name="parent_id"]');
        
        if (typeConfig.parent_type) {
            if (parentIdInput && parentIdInput.value) {
                data[typeConfig.parent_type] = parseInt(parentIdInput.value, 10);
            } else {
                throw new Error(`Parent ${typeConfig.parent_type} is required for ${type}`);
            }
        }

        fields.forEach((field) => {
            const element = document.getElementById(getFieldId(type, field, id));
            if (element) {
                const value = element.value.trim();
                const fieldConfig = typeConfig.fields.find(f => f.name === field);

                if (!value && fieldConfig?.required) {
                    element.classList.add('error');
                    hasErrors = true;
                } else {
                    element.classList.remove('error');
                    
                    // Handle unit updates with validation
                    if (field === 'unit_id' && value) {
                        const isValidUnit = validateUnitConsistency(type, value, modelFields);
                        if (!isValidUnit) {
                            element.classList.add('error');
                            hasErrors = true;
                            throw new Error('Invalid unit selection');
                        }
                        data.unit_id = parseInt(value, 10);
                        
                        const unitInfo = getUnitDisplayInfo(type, value, modelFields);
                        if (unitInfo) {
                            const categoryElement = document.getElementById(getFieldId(type, 'category', id));
                            const typeElement = document.getElementById(getFieldId(type, 'type', id));
                            
                            if (categoryElement) categoryElement.textContent = unitInfo.category;
                            if (typeElement) typeElement.textContent = unitInfo.type;
                        }
                    }
                    // Handle other foreign keys
                    else if (fieldConfig?.is_foreign_key) {
                        data[field] = value ? parseInt(value, 10) : null;
                    }
                    // Handle choices
                    else if (fieldConfig?.type === 'choice') {
                        data[field] = value;
                    }
                    // Handle regular fields
                    else {
                        data[field] = value;
                    }
                }
            }
        });

        if (hasErrors) {
            throw new Error('Please fill in all required fields correctly');
        }

        // For measurements, perform additional validation
        if (type === 'measurement') {
            const validationErrors = validateMeasurementForm(data);
            if (validationErrors) {
                throw validationErrors;
            }
        }

        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        // Update displays after successful update
        if (type === 'measurement' && response.unit) {
            const unitInfo = getUnitDisplayInfo(type, response.unit.id, modelFields);
            if (unitInfo) {
                const categoryElement = document.getElementById(getFieldId(type, 'category', id));
                const typeElement = document.getElementById(getFieldId(type, 'type', id));
                const unitDisplay = document.getElementById(getFieldId(type, 'unit_display', id));

                if (categoryElement) categoryElement.textContent = unitInfo.category;
                if (typeElement) typeElement.textContent = unitInfo.type;
                if (unitDisplay) unitDisplay.textContent = unitInfo.unit;
            }
        }

        resetFields(type, id, fields);
        return response;

    } catch (error) {
        showFormError(document.getElementById(`id_${type}Form-${id}`), error, type);
        throw error;
    }
};

// Delete item function
export const deleteItem = async (type, id) => {
    if (!confirm('Are you sure you want to delete this item? This will also delete all related items.')) {
        return;
    }

    // Find elements first and immediately start fade out
    const itemElement = document.getElementById(`id_form-${type}-${id}`).closest('.tree-item');
    const containerElement = document.getElementById(`id_${type}-${id}`);
    
    // Immediately start fade out and disable interactions
    if (itemElement) {
        itemElement.style.transition = 'opacity 0.3s';
        itemElement.style.opacity = '0.5';
        itemElement.style.pointerEvents = 'none';
    }
    if (containerElement) {
        containerElement.style.transition = 'opacity 0.3s';
        containerElement.style.opacity = '0.5';
        containerElement.style.pointerEvents = 'none';
    }

    try {
        // Send delete request to server
        await ensureInitialized();
        await apiFetch(`/${type}s/${id}/`, { method: 'DELETE' });
        
        // Remove elements from DOM after server confirms deletion
        if (itemElement) itemElement.remove();
        if (containerElement) containerElement.remove();
    } catch (error) {
        // Restore elements if delete fails
        if (itemElement) {
            itemElement.style.opacity = '1';
            itemElement.style.pointerEvents = 'auto';
        }
        if (containerElement) {
            containerElement.style.opacity = '1';
            containerElement.style.pointerEvents = 'auto';
        }
        console.error('Delete failed:', error);
        alert(error.message || 'Failed to delete the item. Please try again.');
    }
};

export const editItem = async (type, id, fields) => {
    try {
        const modelFields = await ensureInitialized();
        const typeConfig = modelFields[type];

        // Cleanup any existing handlers first
        cleanupMeasurementHandlers(type, id);

        fields.forEach((field) => {
            const element = document.getElementById(getFieldId(type, field, id));
            if (element) {
                element.dataset.originalValue = element.value;
                
                if (element.tagName.toLowerCase() === 'select') {
                    element.removeAttribute('disabled');
                    element.style.display = "inline-block";
                    element.classList.add('editing');
                    
                    // Store additional data for measurement fields
                    if (field === 'unit_id') {
                        const selectedOption = element.options[element.selectedIndex];
                        if (selectedOption) {
                            element.dataset.originalCategoryId = selectedOption.dataset.categoryId;
                            element.dataset.originalTypeId = selectedOption.dataset.typeId;
                            element.dataset.originalDisplayValue = selectedOption.text;
                        }
                    } else {
                        const selectedOption = element.options[element.selectedIndex];
                        element.dataset.originalDisplayValue = selectedOption ? selectedOption.text : '';
                    }
                } else {
                    element.removeAttribute('readonly');
                    element.style.display = "inline-block";
                    element.classList.add('editing');
                }
            }
        });

        // Setup measurement handlers if this is a measurement
        if (type === 'measurement') {
            setupMeasurementHandlers(type, id);
        }

        const editControls = document.getElementById(`id_${type}EditControls-${id}`);
        if (editControls) {
            editControls.style.display = "inline-flex";
        }

        // Focus the name field
        const nameField = document.getElementById(getFieldId(type, 'name', id));
        if (nameField) {
            nameField.focus();
        }

    } catch (error) {
        console.error('Error in editItem:', error);
        alert(error.message || 'An error occurred while editing. Please try again.');
    }
};


// Cancel edit function
export const cancelEdit = (event, type, id, fields) => {
    event.preventDefault();
    
    fields.forEach((field) => {
        const element = document.getElementById(getFieldId(type, field, id));
        if (element) {
            // Restore original value
            if (field === 'unit_id') {
                // Restore unit selection
                element.value = element.dataset.originalValue || '';
                
                // Restore category and type displays
                const categoryDisplay = document.getElementById(getFieldId(type, 'category', id));
                const typeDisplay = document.getElementById(getFieldId(type, 'type', id));
                
                if (categoryDisplay && element.dataset.originalCategoryId) {
                    const selectedOption = element.options[element.selectedIndex];
                    if (selectedOption) {
                        categoryDisplay.textContent = selectedOption.dataset.categoryName || '';
                    }
                }
                
                if (typeDisplay && element.dataset.originalTypeId) {
                    const selectedOption = element.options[element.selectedIndex];
                    if (selectedOption) {
                        typeDisplay.textContent = selectedOption.dataset.typeName || '';
                    }
                }
            } else {
                // Handle regular fields and other selects
                element.value = element.dataset.originalValue || '';
                if (element.tagName.toLowerCase() === 'select' && element.dataset.originalDisplayValue) {
                    const option = Array.from(element.options)
                        .find(opt => opt.text === element.dataset.originalDisplayValue);
                    if (option) {
                        element.value = option.value;
                    }
                }
            }

            // Clear error states
            element.classList.remove('error');
            
            // Clean up stored data
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
            delete element.dataset.originalCategoryId;
            delete element.dataset.originalTypeId;
        }
    });
    
    // Clear any error messages
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }

    // Remove any event listeners from unit selection
    const unitField = document.getElementById(getFieldId(type, 'unit_id', id));
    if (unitField) {
        unitField.replaceWith(unitField.cloneNode(true));
    }
    
    resetFields(type, id, fields);
};


export const resetFields = (type, id, fields) => {
    // Clean up measurement handlers first
    cleanupMeasurementHandlers(type, id);

    fields.forEach((field) => {
        const element = document.getElementById(getFieldId(type, field, id));
        if (element) {
            // Reset to original value
            if (element.tagName.toLowerCase() === 'select') {
                element.setAttribute('disabled', 'disabled');
                
                // Special handling for unit selection
                if (field === 'unit_id') {
                    // Restore unit selection and related displays
                    element.value = element.dataset.originalValue || '';
                    handleUnitChange(element, type, id);
                } else {
                    // Handle other select fields
                    if (element.dataset.originalDisplayValue) {
                        const option = Array.from(element.options)
                            .find(opt => opt.text === element.dataset.originalDisplayValue);
                        if (option) {
                            element.value = option.value;
                        }
                    }
                }
            } else {
                element.setAttribute('readonly', 'readonly');
                element.value = element.dataset.originalValue || '';
            }

            // Reset display and classes
            element.classList.remove('editing', 'error');
            if (field !== 'name') {
                element.style.display = "none";
            } else {
                element.style.display = "inline-block";
            }
            
            // Clean up stored data
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
            delete element.dataset.originalCategoryId;
            delete element.dataset.originalTypeId;
        }
    });

    // Reset edit controls
    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "none";
    }

    // Clear any error messages
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
};



