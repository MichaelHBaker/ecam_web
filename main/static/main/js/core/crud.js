// crud.js
// Enhanced CRUD operations module with improved state management and error handling

import { API } from './api.js';
import { State } from './state.js';
import { NotificationUI} from './ui.js';
import { DOM } from './dom.js';
import { Tree } from './tree.js';

const CRUD_STATE_KEY = 'crud_state';

/**
 * Enhanced CRUD Operation Manager for tree items with proper initialization and safety checks
 */
class TreeItemManager {
    constructor() {
        this.initialized = false;
        this.pendingOperations = new Map();
        
        // Operation tracking
        this.activeOperations = new Set();
        this.operationTimers = new Map();
       
    }

    /**
     * Check if CRUD manager is initialized
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
            throw new Error('CRUD Manager must be initialized before use');
        }
    }

    /**
     * Initialize CRUD manager with dependency checks
     * @returns {Promise<TreeItemManager>} Initialized instance
     */
    async initialize() {
        if (this.initialized) {
            console.warn('CRUD Manager already initialized');
            return this;
        }
    
        try {
            // No method binding here - do it where the methods are defined
    
            // Initialize state
            await this.initializeState();
            
            // Setup state subscriptions
            await this.setupStateSubscriptions();
    
            this.initialized = true;
            console.log('CRUD Manager initialized');
    
            return this;
    
        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize CRUD state with enhanced structure
     * @private
     */
    async initializeState() {
        try {
            const initialState = {
                activeOperations: new Set(),
                operationHistory: [],
                lastOperation: null,
                error: null,
                stats: {
                    completed: 0,
                    failed: 0,
                    pending: 0,
                    byType: {}
                },
                lastUpdate: new Date()
            };

            State.set(CRUD_STATE_KEY, initialState);

        } catch (error) {
            this.handleError('State Initialization Error', error);
            throw error;
        }
    }

    /**
     * Setup state subscriptions with enhanced error handling
     * @private
     */
    async setupStateSubscriptions() {
        try {
            // Subscribe to API state changes
            State.subscribe('api_state', async (newState) => {
                try {
                    if (newState.error) {
                        await this.handleApiError(newState.error);
                    }
                } catch (error) {
                    this.handleError('API State Subscription Error', error);
                }
            });

            // Subscribe to tree state changes for coordination
            State.subscribe('tree_state', async (newState, oldState) => {
                try {
                    if (newState.activeNode !== oldState?.activeNode) {
                        await this.handleActiveNodeChange(newState.activeNode);
                    }
                } catch (error) {
                    this.handleError('Tree State Subscription Error', error);
                }
            });

        } catch (error) {
            this.handleError('State Subscription Error', error);
            throw error;
        }
    }

    /**
     * Handle API errors with enhanced context
     * @private
     */
    async handleApiError(error) {
        const context = 'API Operation Error';
        
        try {
            // Check for specific API error types
            if (error.status === 409) {
                await this.handleConcurrencyError(error);
            } else if (error.status === 403) {
                await this.handlePermissionError(error);
            } else {
                this.handleError(context, error);
            }

            // Update operation status if related to active operation
            const activeOp = this.findRelatedOperation(error);
            if (activeOp) {
                await this.completeOperation(activeOp.id, 'error', error);
            }

        } catch (handlingError) {
            this.handleError('Error Handler Error', handlingError);
            console.error('Original error:', error);
        }
    }

    /**
     * Handle concurrency conflicts
     * @private
     */
    async handleConcurrencyError(error) {
        try {
            const { itemType, itemId, serverVersion } = error.details;
            
            // Get affected item
            const item = DOM.getElement(`[data-type="${itemType}"][data-id="${itemId}"]`);
            if (!item) return;

            // Show conflict resolution UI
            await this.showConflictResolution(item, serverVersion);

        } catch (error) {
            this.handleError('Concurrency Handler Error', error);
        }
    }

    /**
     * Handle errors consistently
     * @private
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        console.error(`CRUD Error (${context}):`, error);
        
        NotificationUI.show({
            message: `Operation Error: ${error.message}`,
            type: 'error',
            duration: 5000
        });

        try {
            State.update(CRUD_STATE_KEY, {
                error: {
                    context,
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                }
            });
        } catch (stateError) {
            console.error('Error updating state with error:', stateError);
        }
    }
    /**
     * Creates a new tree item with enhanced error handling and validation
     * @param {string} type - Item type (project/location/measurement)
     * @param {Array} fields - Field configuration array
     * @param {string|null} parentId - Optional parent ID
     * @returns {Promise<void>}
     */
    async addItem(type, fields, parentId = null) {
        this._checkInitialized();

        if (!type || !Array.isArray(fields)) {
            throw new Error('Invalid parameters for item creation');
        }

        const operationId = await this.startOperation('create', type);

        try {
            // Create temporary form
            const tempId = `temp-${type}-${Date.now()}`;
            const tempForm = await this.createTempForm(type, tempId, fields, parentId);
            
            // Find and validate parent container
            const parentContainer = await this.getParentContainer(type, parentId);
            if (!parentContainer) {
                throw new Error('Parent container not found');
            }

            // Insert form with animation
            await this.insertForm(tempForm, parentContainer, parentId);

            // Focus first field for better UX
            const firstInput = tempForm.querySelector('input,select');
            if (firstInput) {
                firstInput.focus();
            }

            await this.completeOperation(operationId, 'success');
            
        } catch (error) {
            this.handleError('Create Error', error);
            await this.completeOperation(operationId, 'error', error);
            throw error;
        }
    }

    /**
     * Updates an existing tree item with optimistic updates and rollback
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Object} data - Update data
     * @returns {Promise<void>}
     */
    async updateItem(type, id, data) {
        this._checkInitialized();

        if (!type || !id || !data) {
            throw new Error('Invalid parameters for item update');
        }

        const operationId = await this.startOperation('update', type);

        try {
            // Get and validate item
            const item = DOM.getElement(`[data-type="${type}"][data-id="${id}"]`);
            if (!item) {
                throw new Error('Item not found');
            }

            // Validate update data
            await this.validateUpdateData(type, data);

            // Save current state for potential rollback
            const previousState = await this.saveItemState(item);

            // Start optimistic update
            await this.updateItemUI(item, data);

            try {
                // Attempt API update
                const response = await API[`${type}s`].update(id, data);
                
                // Update version and server-generated fields
                await this.finalizeUpdate(item, response);
                
                NotificationUI.show({
                    message: `${type} updated successfully`,
                    type: 'success'
                });

                // Update state and emit events
                await this.handleSuccessfulUpdate(type, id, response);

            } catch (error) {
                // Rollback UI on API error
                await this.rollbackItemState(item, previousState);
                throw error;
            }

            await this.completeOperation(operationId, 'success');
            
        } catch (error) {
            this.handleError('Update Error', error);
            await this.completeOperation(operationId, 'error', error);
            throw error;
        }
    }

    /**
     * Deletes a tree item with optimistic deletion and rollback
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @returns {Promise<void>}
     */
    async deleteItem(type, id) {
        this._checkInitialized();

        if (!type || !id) {
            throw new Error('Invalid parameters for item deletion');
        }

        const operationId = await this.startOperation('delete', type);

        try {
            // Get and validate item
            const item = DOM.getElement(`[data-type="${type}"][data-id="${id}"]`);
            if (!item) {
                throw new Error('Item not found');
            }

            // Check for pending child operations
            if (await this.hasActiveChildOperations(type, id)) {
                throw new Error('Cannot delete item with pending child operations');
            }

            // Save state for potential rollback
            const itemState = {
                parent: item.parentElement,
                nextSibling: item.nextSibling,
                state: await this.saveItemState(item)
            };

            // Start optimistic deletion
            await this.animateItemRemoval(item);

            try {
                // Attempt API deletion
                await API[`${type}s`].delete(id);
                
                NotificationUI.show({
                    message: `${type} deleted successfully`,
                    type: 'success'
                });

                // Update state and emit events
                await this.handleSuccessfulDeletion(type, id);

            } catch (error) {
                // Rollback on API error
                await this.rollbackDelete(itemState.parent, itemState.nextSibling, item, itemState.state);
                throw error;
            }

            await this.completeOperation(operationId, 'success');
            
        } catch (error) {
            this.handleError('Delete Error', error);
            await this.completeOperation(operationId, 'error', error);
            throw error;
        }
    }

    /**
     * Creates a temporary form for new items with enhanced validation
     * @private
     */
    async createTempForm(type, tempId, fields, parentId) {
        try {
            const form = DOM.createElement('form', {
                className: 'tree-item temp-item w3-animate-opacity',
                attributes: {
                    'data-type': type,
                    'data-id': tempId,
                    'data-temp': 'true'
                }
            });

            // Create fields container
            const fieldsContainer = DOM.createElement('div', {
                className: 'fields-container'
            });

            // Add fields with validation
            for (const field of fields) {
                await this.addFormField(fieldsContainer, field);
            }

            // Add parent ID if provided
            if (parentId) {
                fieldsContainer.appendChild(
                    DOM.createElement('input', {
                        type: 'hidden',
                        name: 'parent_id',
                        value: parentId
                    })
                );
            }

            // Add action buttons
            const actions = await this.createFormActions();

            // Add event listeners
            form.addEventListener('submit', (e) => this.handleSubmit(e, type));
            
            const cancelButton = actions.querySelector('[data-action="cancel"]');
            if (cancelButton) {
                cancelButton.addEventListener('click', () => this.handleCancel(form));
            }

            form.appendChild(fieldsContainer);
            form.appendChild(actions);

            return form;

        } catch (error) {
            this.handleError('Form Creation Error', error);
            throw error;
        }
    }

    /**
     * Add form field with validation
     * @private
     */
    async addFormField(container, field) {
        try {
            const input = DOM.createElement('input', {
                type: field.type || 'text',
                name: field.name,
                className: 'tree-item-field w3-input',
                attributes: {
                    placeholder: field.label || field.name,
                    required: field.required || false,
                    'data-field-type': field.type,
                    'aria-label': field.label || field.name
                }
            });

            if (field.pattern) {
                input.pattern = field.pattern;
            }

            if (field.validation) {
                input.dataset.validation = JSON.stringify(field.validation);
                input.addEventListener('input', () => this.validateField(input));
            }

            container.appendChild(input);

        } catch (error) {
            this.handleError('Field Creation Error', error);
            throw error;
        }
    }

    /**
     * Create form action buttons
     * @private
     */
    async createFormActions() {
        return DOM.createElement('div', {
            className: 'edit-controls w3-right',
            innerHTML: `
                <button type="submit" class="w3-button w3-green">
                    <i class="bi bi-check"></i> Save
                </button>
                <button type="button" class="w3-button w3-red" data-action="cancel">
                    <i class="bi bi-x"></i> Cancel
                </button>
            `
        });
    }

    /**
     * Find appropriate parent container with validation
     * @private
     */
    async getParentContainer(type, parentId) {
        try {
            if (!parentId) {
                const container = DOM.getElement('.tree-container');
                if (!container) {
                    throw new Error('Tree container not found');
                }
                return container;
            }

            const parentItem = DOM.getElement(`[data-id="${parentId}"]`);
            if (!parentItem) {
                throw new Error(`Parent item ${parentId} not found`);
            }

            let container = parentItem.querySelector('.children-container');
            if (!container) {
                container = DOM.createElement('div', {
                    className: 'children-container'
                });
                parentItem.appendChild(container);
            }

            return container;

        } catch (error) {
            this.handleError('Container Location Error', error);
            throw error;
        }
    }

    /**
     * Insert form with animation
     * @private
     */
    async insertForm(form, container, parentId) {
        try {
            form.style.opacity = '0';

            if (parentId) {
                container.insertBefore(form, container.firstChild);
            } else {
                container.appendChild(form);
            }

            // Trigger animation
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    form.style.opacity = '1';
                    setTimeout(resolve, 300);
                });
            });

        } catch (error) {
            this.handleError('Form Insertion Error', error);
            throw error;
        }
    }

    /**
     * Validate field value
     * @private
     */
    async validateField(input) {
        try {
            const validation = JSON.parse(input.dataset.validation || '{}');
            const value = input.value;

            let isValid = true;
            let errorMessage = '';

            if (validation.required && !value) {
                isValid = false;
                errorMessage = 'This field is required';
            } else if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
                isValid = false;
                errorMessage = validation.patternMessage || 'Invalid format';
            } else if (validation.min && value < validation.min) {
                isValid = false;
                errorMessage = `Minimum value is ${validation.min}`;
            } else if (validation.max && value > validation.max) {
                isValid = false;
                errorMessage = `Maximum value is ${validation.max}`;
            }

            input.setCustomValidity(errorMessage);
            
            const errorDisplay = input.nextElementSibling;
            if (errorDisplay?.classList.contains('field-error')) {
                errorDisplay.textContent = errorMessage;
                errorDisplay.style.display = isValid ? 'none' : 'block';
            }

            return isValid;

        } catch (error) {
            this.handleError('Field Validation Error', error);
            return false;
        }
    }
    /**
     * Start operation with enhanced tracking and timeout handling
     * @param {string} operation - Operation type
     * @param {string} itemType - Item type
     * @returns {Promise<string>} Operation ID
     * @private
     */
    async startOperation(operation, itemType) {
        this._checkInitialized();

        try {
            const operationId = `${operation}-${itemType}-${Date.now()}`;
            
            // Create operation record
            const operationData = {
                id: operationId,
                type: operation,
                itemType,
                startTime: new Date(),
                status: 'pending',
                attempts: 0,
                timeout: operation === 'delete' ? 30000 : 60000 // Different timeouts for different operations
            };

            // Store operation
            this.pendingOperations.set(operationId, operationData);
            this.activeOperations.add(operationId);

            // Set timeout handler
            const timeoutId = setTimeout(
                () => this.handleOperationTimeout(operationId),
                operationData.timeout
            );
            this.operationTimers.set(operationId, timeoutId);

            // Update state
            State.update(CRUD_STATE_KEY, {
                activeOperations: Array.from(this.activeOperations),
                lastOperation: {
                    id: operationId,
                    type: operation,
                    itemType,
                    status: 'started',
                    timestamp: new Date()
                }
            });

            // Emit operation start event
            const startEvent = new CustomEvent('crud:operation:start', {
                detail: {
                    operationId,
                    type: operation,
                    itemType,
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(startEvent);

            return operationId;

        } catch (error) {
            this.handleError('Operation Start Error', error);
            throw error;
        }
    }

    /**
     * Complete operation with state cleanup
     * @param {string} operationId - Operation ID
     * @param {string} status - Completion status
     * @param {Error} [error] - Optional error
     * @returns {Promise<void>}
     * @private
     */
    async completeOperation(operationId, status, error = null) {
        this._checkInitialized();

        try {
            const operation = this.pendingOperations.get(operationId);
            if (!operation) return;

            // Clear timeout
            const timeoutId = this.operationTimers.get(operationId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.operationTimers.delete(operationId);
            }

            // Update operation data
            operation.status = status;
            operation.endTime = new Date();
            operation.duration = operation.endTime - operation.startTime;
            if (error) {
                operation.error = {
                    message: error.message,
                    stack: error.stack,
                    code: error.code
                };
            }

            // Update state
            const state = await State.get(CRUD_STATE_KEY);
            const stats = this.updateOperationStats(state.stats, operation);

            State.update(CRUD_STATE_KEY, {
                activeOperations: Array.from(this.activeOperations),
                lastOperation: {
                    id: operationId,
                    type: operation.type,
                    itemType: operation.itemType,
                    status,
                    duration: operation.duration,
                    error: error ? error.message : null,
                    timestamp: new Date()
                },
                stats,
                lastUpdate: new Date()
            });

            // Cleanup on success or final failure
            if (status === 'success' || (status === 'error' && operation.attempts >= 3)) {
                this.pendingOperations.delete(operationId);
                this.activeOperations.delete(operationId);
            }

            // Emit completion event
            const completionEvent = new CustomEvent('crud:operation:complete', {
                detail: {
                    operationId,
                    type: operation.type,
                    itemType: operation.itemType,
                    status,
                    duration: operation.duration,
                    error: error ? error.message : null,
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(completionEvent);

        } catch (error) {
            this.handleError('Operation Completion Error', error);
            throw error;
        }
    }

    /**
     * Handle operation timeout with retry logic
     * @param {string} operationId - Operation ID
     * @private
     */
    async handleOperationTimeout(operationId) {
        try {
            const operation = this.pendingOperations.get(operationId);
            if (!operation) return;

            operation.attempts++;

            // Check if should retry
            if (operation.attempts < 3) {
                // Retry operation
                await this.retryOperation(operation);
            } else {
                // Mark as failed after max attempts
                const error = new Error(`Operation timed out after ${operation.attempts} attempts`);
                await this.completeOperation(operationId, 'error', error);

                NotificationUI.show({
                    message: `Operation failed: ${error.message}`,
                    type: 'error',
                    duration: 5000
                });
            }

        } catch (error) {
            this.handleError('Timeout Handler Error', error);
        }
    }

    /**
     * Retry failed operation
     * @param {Object} operation - Operation data
     * @private
     */
    async retryOperation(operation) {
        try {
            // Update state for retry
            const retryDelay = Math.pow(2, operation.attempts) * 1000; // Exponential backoff
            
            NotificationUI.show({
                message: `Retrying operation (attempt ${operation.attempts}/3)...`,
                type: 'warning',
                duration: 3000
            });

            // Set new timeout
            const timeoutId = setTimeout(
                () => this.handleOperationTimeout(operation.id),
                operation.timeout
            );
            this.operationTimers.set(operation.id, timeoutId);

            // Emit retry event
            const retryEvent = new CustomEvent('crud:operation:retry', {
                detail: {
                    operationId: operation.id,
                    type: operation.type,
                    itemType: operation.itemType,
                    attempt: operation.attempts,
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(retryEvent);

        } catch (error) {
            this.handleError('Operation Retry Error', error);
        }
    }

    /**
     * Update operation statistics
     * @param {Object} currentStats - Current statistics
     * @param {Object} operation - Operation data
     * @returns {Object} Updated statistics
     * @private
     */
    updateOperationStats(currentStats, operation) {
        const stats = { ...currentStats };
        const { itemType, status } = operation;

        // Initialize type stats if needed
        if (!stats.byType[itemType]) {
            stats.byType[itemType] = {
                total: 0,
                completed: 0,
                failed: 0,
                pending: 0,
                avgDuration: 0
            };
        }

        const typeStats = stats.byType[itemType];

        // Update counts
        if (status === 'success') {
            stats.completed++;
            typeStats.completed++;
        } else if (status === 'error') {
            stats.failed++;
            typeStats.failed++;
        } else {
            stats.pending++;
            typeStats.pending++;
        }

        // Update totals
        typeStats.total = typeStats.completed + typeStats.failed + typeStats.pending;
        stats.total = stats.completed + stats.failed + stats.pending;

        // Update average duration
        if (operation.duration) {
            typeStats.avgDuration = (
                (typeStats.avgDuration * (typeStats.completed - 1)) + 
                operation.duration
            ) / typeStats.completed;
        }

        return stats;
    }

    /**
     * Check for active child operations
     * @param {string} type - Parent type
     * @param {string} id - Parent ID
     * @returns {Promise<boolean>} Has active children
     * @private
     */
    async hasActiveChildOperations(type, id) {
        try {
            // Get all active operations
            const activeOps = Array.from(this.pendingOperations.values());

            // Check for operations on child items
            return activeOps.some(op => {
                const parentAttr = `data-${type}-parent`;
                const element = DOM.getElement(`[data-id="${op.itemId}"][${parentAttr}="${id}"]`);
                return !!element;
            });

        } catch (error) {
            this.handleError('Child Operation Check Error', error);
            return false;
        }
    }

    /**
     * Get operation statistics
     * @returns {Object} Operation statistics
     */
    getOperationStats() {
        this._checkInitialized();

        try {
            const state = State.get(CRUD_STATE_KEY);
            return state.stats;
        } catch (error) {
            this.handleError('Stats Retrieval Error', error);
            return {
                total: 0,
                completed: 0,
                failed: 0,
                pending: 0,
                byType: {}
            };
        }
    }

    /**
     * Check if operations are pending
     * @returns {boolean} Has pending operations
     */
    hasPendingOperations() {
        this._checkInitialized();
        return this.activeOperations.size > 0;
    }
    /**
     * Save item state for potential rollback
     * @param {HTMLElement} item - Item element
     * @returns {Promise<Object>} Saved state
     * @private
     */
    async saveItemState(item) {
        try {
            // Save DOM state
            const state = {
                innerHTML: item.innerHTML,
                className: item.className,
                style: item.getAttribute('style'),
                data: {},
                attributes: {},
                expanded: item.querySelector('.children-container')?.classList.contains('w3-hide') === false
            };

            // Save all data attributes
            Array.from(item.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .forEach(attr => {
                    state.data[attr.name] = attr.value;
                });

            // Save relevant non-data attributes
            ['id', 'role', 'aria-expanded', 'aria-level'].forEach(attr => {
                if (item.hasAttribute(attr)) {
                    state.attributes[attr] = item.getAttribute(attr);
                }
            });

            // Save form state if present
            const form = item.querySelector('form');
            if (form) {
                state.form = {
                    values: Object.fromEntries(new FormData(form).entries()),
                    validity: Array.from(form.elements).map(el => ({
                        name: el.name,
                        valid: el.validity.valid,
                        customError: el.validationMessage
                    }))
                };
            }

            return state;

        } catch (error) {
            this.handleError('State Save Error', error);
            throw error;
        }
    }

    /**
     * Rollback item state with animation
     * @param {HTMLElement} item - Item element
     * @param {Object} state - Previous state
     * @returns {Promise<void>}
     * @private
     */
    async rollbackItemState(item, state) {
        try {
            // Add transition class
            item.classList.add('w3-animate-opacity');
            item.style.opacity = '0';

            // Wait for fade out
            await new Promise(resolve => setTimeout(resolve, 150));

            // Restore DOM state
            item.innerHTML = state.innerHTML;
            item.className = state.className;
            
            if (state.style) {
                item.setAttribute('style', state.style);
            } else {
                item.removeAttribute('style');
            }
            
            // Restore data attributes
            Object.entries(state.data).forEach(([attr, value]) => {
                item.setAttribute(attr, value);
            });

            // Restore other attributes
            Object.entries(state.attributes).forEach(([attr, value]) => {
                item.setAttribute(attr, value);
            });

            // Restore expansion state if needed
            if (state.expanded) {
                const container = item.querySelector('.children-container');
                if (container) {
                    container.classList.remove('w3-hide');
                }
            }

            // Restore form state if present
            if (state.form) {
                const form = item.querySelector('form');
                if (form) {
                    Object.entries(state.form.values).forEach(([name, value]) => {
                        const input = form.elements[name];
                        if (input) {
                            input.value = value;
                        }
                    });

                    state.form.validity.forEach(({name, valid, customError}) => {
                        const input = form.elements[name];
                        if (input) {
                            input.setCustomValidity(customError || '');
                        }
                    });
                }
            }

            // Fade back in
            item.style.opacity = '1';
            await new Promise(resolve => setTimeout(resolve, 150));
            item.classList.remove('w3-animate-opacity');

        } catch (error) {
            this.handleError('State Rollback Error', error);
            throw error;
        }
    }

    /**
     * Animate item removal with proper cleanup
     * @param {HTMLElement} item - Item to remove
     * @returns {Promise<void>}
     * @private
     */
    async animateItemRemoval(item) {
        try {
            // Add fade out animation
            item.classList.add('w3-animate-opacity');
            item.style.opacity = '0';

            // Wait for animation
            await new Promise(resolve => setTimeout(resolve, 300));

            // Remove from DOM
            item.remove();

        } catch (error) {
            this.handleError('Item Removal Error', error);
            throw error;
        }
    }

    /**
     * Handle form submission with validation
     * @param {Event} event - Submit event
     * @param {string} type - Item type
     * @returns {Promise<void>}
     * @private
     */
    async handleSubmit(event, type) {
        event.preventDefault();
        const form = event.target;
        
        try {
            this._checkInitialized();
            const operationId = await this.startOperation('save', type);

            // Validate form
            if (!form.checkValidity()) {
                this.showFormErrors(form);
                throw new Error('Please correct the form errors');
            }

            // Collect and validate data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            await this.validateSubmitData(type, data);

            try {
                // Send to API
                const response = await API[`${type}s`].create(data);
                
                // Create new item UI
                const newItem = await Tree.createNodeElement({
                    type,
                    id: response.id,
                    name: response.name,
                    fields: Object.keys(data),
                    parent: data.parent_id,
                    hasChildren: type !== 'measurement'
                });

                // Replace temp form with animation
                await this.replaceTempForm(form, newItem);

                NotificationUI.show({
                    message: `${type} created successfully`,
                    type: 'success'
                });

                await this.completeOperation(operationId, 'success');
                
            } catch (error) {
                throw error;
            }

        } catch (error) {
            this.handleError('Form Submission Error', error);
            this.showFormError(form, error);
        }
    }

    /**
     * Show form validation errors
     * @param {HTMLFormElement} form - Form element
     * @private
     */
    showFormErrors(form) {
        Array.from(form.elements).forEach(element => {
            if (!element.validity.valid) {
                const errorDisplay = element.nextElementSibling;
                if (errorDisplay?.classList.contains('field-error')) {
                    errorDisplay.textContent = element.validationMessage;
                    errorDisplay.style.display = 'block';
                }
            }
        });
    }

    /**
     * Replace temporary form with new item
     * @param {HTMLFormElement} form - Temporary form
     * @param {HTMLElement} newItem - New item element
     * @returns {Promise<void>}
     * @private
     */
    async replaceTempForm(form, newItem) {
        try {
            // Fade out form
            form.classList.add('w3-animate-opacity');
            form.style.opacity = '0';
            
            await new Promise(resolve => setTimeout(resolve, 300));

            // Insert new item
            newItem.style.opacity = '0';
            form.parentNode.insertBefore(newItem, form);
            form.remove();

            // Fade in new item
            requestAnimationFrame(() => {
                newItem.classList.add('w3-animate-opacity');
                newItem.style.opacity = '1';
            });

        } catch (error) {
            this.handleError('Form Replacement Error', error);
            throw error;
        }
    }

    /**
     * Clean up all resources
     * @returns {Promise<void>}
     */
    async destroy() {
        if (!this.initialized) return;

        try {
            // Cancel all pending operations
            for (const [operationId, operation] of this.pendingOperations) {
                try {
                    await this.completeOperation(
                        operationId,
                        'cancelled',
                        new Error('Manager being destroyed')
                    );
                } catch (error) {
                    this.handleError('Operation Cleanup Error', error);
                }
            }

            // Clear all timers
            for (const timerId of this.operationTimers.values()) {
                clearTimeout(timerId);
            }

            // Clear collections
            this.pendingOperations.clear();
            this.operationTimers.clear();
            this.activeOperations.clear();

            // Reset state
            State.update(CRUD_STATE_KEY, {
                activeOperations: [],
                lastOperation: null,
                error: null,
                stats: {
                    completed: 0,
                    failed: 0,
                    pending: 0,
                    byType: {}
                },
                lastUpdate: new Date()
            });

            // Remove event listeners if any were added globally
            window.removeEventListener('crud:operation:start', this.handleOperationStart);
            window.removeEventListener('crud:operation:complete', this.handleOperationComplete);

            this.initialized = false;

            // Emit destroy event
            const destroyEvent = new CustomEvent('crud:destroy', {
                detail: {
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(destroyEvent);

        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }

    /**
     * Handle active node change
     * @private
     */
    async handleActiveNodeChange(activeNode) {
        // Placeholder implementation
        console.log('Active node changed:', activeNode);
    }

    /**
     * Find related operation for an error
     * @private
     */
    findRelatedOperation(error) {
        // Placeholder implementation
        return null;
    }

    /**
     * Handle permission error
     * @private
     */
    async handlePermissionError(error) {
        // Placeholder implementation
        console.warn('Permission error:', error);
        NotificationUI.show({
            message: 'Permission denied: ' + error.message,
            type: 'error',
            duration: 5000
        });
    }

    /**
     * Show conflict resolution UI
     * @private
     */
    async showConflictResolution(item, serverVersion) {
        // Placeholder implementation
        console.warn('Conflict resolution needed for item:', item, 'Server version:', serverVersion);
    }

    /**
     * Validate update data
     * @private
     */
    async validateUpdateData(type, data) {
        // Placeholder implementation
        return true;
    }

    /**
     * Update item UI
     * @private
     */
    async updateItemUI(item, data) {
        // Placeholder implementation
        if (data.name) {
            const nameEl = item.querySelector('.item-name');
            if (nameEl) nameEl.textContent = data.name;
        }
    }

    /**
     * Finalize update with server data
     * @private
     */
    async finalizeUpdate(item, response) {
        // Placeholder implementation
        return;
    }

    /**
     * Handle successful update
     * @private
     */
    async handleSuccessfulUpdate(type, id, response) {
        // Placeholder implementation
        return;
    }

    /**
     * Rollback delete operation
     * @private
     */
    async rollbackDelete(parent, nextSibling, item, state) {
        // Placeholder implementation
        if (parent) {
            if (nextSibling) {
                parent.insertBefore(item, nextSibling);
            } else {
                parent.appendChild(item);
            }
            await this.rollbackItemState(item, state);
        }
    }

    /**
     * Handle successful deletion
     * @private
     */
    async handleSuccessfulDeletion(type, id) {
        // Placeholder implementation
        return;
    }

    /**
     * Validate submit data
     * @private
     */
    async validateSubmitData(type, data) {
        // Placeholder implementation
        return true;
    }

    /**
     * Show form error
     * @private
     */
    showFormError(form, error) {
        // Placeholder implementation
        const errorContainer = form.querySelector('.form-error');
        if (errorContainer) {
            errorContainer.textContent = error.message;
            errorContainer.style.display = 'block';
        }
    }

    /**
     * Handle form cancel
     * @private
     */
    handleCancel(form) {
        // Placeholder implementation
        if (form && form.parentNode) {
            form.classList.add('w3-animate-opacity');
            form.style.opacity = '0';
            
            setTimeout(() => {
                form.remove();
            }, 300);
        }
    }

}

// Create and export singleton instance
export const CRUD = new TreeItemManager();