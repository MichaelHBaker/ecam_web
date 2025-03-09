// codemirror.js
// Enhanced CodeMirror management with proper initialization and safety checks

import { State } from './state.js';
import { DOM } from './dom.js';
import { NotificationUI } from './ui.js';

const CODEMIRROR_STATE_KEY = 'codemirror_state';

class CodeMirrorManager {
    constructor() {
        this.initialized = false;
        this.instances = new Map();
        this.options = {
            theme: 'default',
            lineNumbers: true,
            lineWrapping: true,
            mode: 'text/plain'
        };
    }

    /**
     * Initialize CodeMirror manager with dependency checks
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            console.warn('CodeMirrorManager already initialized');
            return this;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before CodeMirrorManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before CodeMirrorManager');
            }

            // Initialize state
            State.set(CODEMIRROR_STATE_KEY, {
                instances: [],
                lastAction: null,
                error: null,
                options: this.options,
                lastUpdate: new Date()
            });

            // Check if CodeMirror is loaded
            if (typeof CodeMirror === 'undefined') {
                console.warn('CodeMirror library not loaded, will attempt lazy loading');
                // Here you could optionally implement dynamic loading of CodeMirror
            }

            this.initialized = true;
            console.log('CodeMirrorManager initialized');

            return this;
        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Check if manager is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Create a new CodeMirror instance
     * @param {string|HTMLElement} elementOrId - Target textarea or its ID
     * @param {Object} options - CodeMirror options
     * @returns {Promise<Object>} CodeMirror instance
     */
    async create(elementOrId, options = {}) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            // Get element
            let element;
            if (typeof elementOrId === 'string') {
                element = document.getElementById(elementOrId);
            } else {
                element = elementOrId;
            }

            if (!element) {
                throw new Error(`Element not found: ${elementOrId}`);
            }

            // Check if instance already exists
            const instanceId = element.id || `cm-${Date.now()}`;
            if (this.instances.has(instanceId)) {
                return this.instances.get(instanceId);
            }

            // Merge options
            const mergedOptions = {
                ...this.options,
                ...options
            };

            // Lazy-load CodeMirror if needed
            if (typeof CodeMirror === 'undefined') {
                await this.loadCodeMirror();
            }

            // Create instance
            const instance = CodeMirror.fromTextArea(element, mergedOptions);

            // Store instance
            this.instances.set(instanceId, {
                id: instanceId,
                instance,
                element,
                options: mergedOptions,
                created: new Date()
            });

            // Update state
            this.updateState('created', { instanceId, options: mergedOptions });

            return { instance, id: instanceId };
        } catch (error) {
            this.handleError('Create Error', error);
            throw error;
        }
    }

    /**
     * Get an existing CodeMirror instance
     * @param {string} instanceId - Instance ID
     * @returns {Object|null} CodeMirror instance
     */
    getInstance(instanceId) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        return this.instances.get(instanceId) || null;
    }

    /**
     * Set content for a CodeMirror instance
     * @param {string} instanceId - Instance ID
     * @param {string} content - Content to set
     */
    setContent(instanceId, content) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            const entry = this.instances.get(instanceId);
            if (!entry) {
                throw new Error(`CodeMirror instance not found: ${instanceId}`);
            }

            entry.instance.setValue(content);
            this.updateState('contentUpdated', { instanceId });
        } catch (error) {
            this.handleError('Set Content Error', error);
            throw error;
        }
    }

    /**
     * Get content from a CodeMirror instance
     * @param {string} instanceId - Instance ID
     * @returns {string} Content
     */
    getContent(instanceId) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            const entry = this.instances.get(instanceId);
            if (!entry) {
                throw new Error(`CodeMirror instance not found: ${instanceId}`);
            }

            return entry.instance.getValue();
        } catch (error) {
            this.handleError('Get Content Error', error);
            throw error;
        }
    }

    /**
     * Update CodeMirror options
     * @param {string} instanceId - Instance ID
     * @param {Object} options - Options to update
     */
    updateOptions(instanceId, options) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            const entry = this.instances.get(instanceId);
            if (!entry) {
                throw new Error(`CodeMirror instance not found: ${instanceId}`);
            }

            // Update options
            Object.entries(options).forEach(([key, value]) => {
                entry.instance.setOption(key, value);
            });

            // Update stored options
            entry.options = {
                ...entry.options,
                ...options
            };

            this.updateState('optionsUpdated', { instanceId, options });
        } catch (error) {
            this.handleError('Update Options Error', error);
            throw error;
        }
    }

    /**
     * Handle file loading in CodeMirror
     * @param {string} instanceId - Instance ID
     * @param {File} file - File to load
     * @returns {Promise<void>}
     */
    async loadFile(instanceId, file) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            const entry = this.instances.get(instanceId);
            if (!entry) {
                throw new Error(`CodeMirror instance not found: ${instanceId}`);
            }

            // Read file
            const content = await this.readFileContent(file);

            // Set content
            entry.instance.setValue(content);

            // Detect mode
            const mode = this.detectMode(file);
            if (mode) {
                entry.instance.setOption('mode', mode);
            }

            this.updateState('fileLoaded', { 
                instanceId, 
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            });
        } catch (error) {
            this.handleError('Load File Error', error);
            throw error;
        }
    }

    /**
     * Read file content
     * @private
     * @param {File} file - File to read
     * @returns {Promise<string>} File content
     */
    async readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (e) => {
                reject(new Error('File read error'));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Detect CodeMirror mode from file
     * @private
     * @param {File} file - File
     * @returns {string|null} CodeMirror mode
     */
    detectMode(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        
        const modeMap = {
            'js': 'javascript',
            'json': 'application/json',
            'html': 'htmlmixed',
            'xml': 'xml',
            'css': 'css',
            'py': 'python',
            'csv': 'text/plain'
        };

        return modeMap[extension] || null;
    }

    /**
     * Destroy a CodeMirror instance
     * @param {string} instanceId - Instance ID
     */
    destroy(instanceId) {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            const entry = this.instances.get(instanceId);
            if (!entry) {
                return;
            }

            // Revert textarea
            entry.instance.toTextArea();

            // Remove from instances
            this.instances.delete(instanceId);

            this.updateState('destroyed', { instanceId });
        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }

    /**
     * Destroy all CodeMirror instances
     */
    destroyAll() {
        if (!this.initialized) {
            throw new Error('CodeMirrorManager must be initialized before use');
        }

        try {
            this.instances.forEach((entry, instanceId) => {
                try {
                    entry.instance.toTextArea();
                } catch (instanceError) {
                    console.error(`Error destroying instance ${instanceId}:`, instanceError);
                }
            });

            this.instances.clear();
            this.updateState('destroyedAll', {});
        } catch (error) {
            this.handleError('Destroy All Error', error);
        }
    }

    /**
     * Lazy-load CodeMirror library
     * @private
     * @returns {Promise<void>}
     */
    async loadCodeMirror() {
        // This would be implemented if you needed dynamic loading
        // For now, we'll assume CodeMirror is already loaded
        return Promise.resolve();
    }

    /**
     * Update state
     * @private
     * @param {string} action - Action name
     * @param {Object} data - Action data
     */
    updateState(action, data = {}) {
        try {
            const state = State.get(CODEMIRROR_STATE_KEY);
            
            State.update(CODEMIRROR_STATE_KEY, {
                instances: Array.from(this.instances.keys()),
                lastAction: {
                    action,
                    data,
                    timestamp: new Date()
                },
                lastUpdate: new Date()
            });
        } catch (error) {
            console.error('State update error:', error);
        }
    }

    /**
     * Handle errors
     * @private
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        console.error(`CodeMirror Error (${context}):`, error);
        
        try {
            NotificationUI.show({
                message: `CodeMirror Error: ${error.message}`,
                type: 'error',
                duration: 5000
            });

            State.update(CODEMIRROR_STATE_KEY, {
                error: {
                    context,
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                }
            });
        } catch (stateError) {
            console.error('Error updating error state:', stateError);
        }
    }
}

// Export singleton instance
export const CodeMirror = new CodeMirrorManager();