// crud.js
// Enhanced CRUD operations module with improved state management and error handling

import { API } from './api.js';
import { State } from './state.js';
import { NotificationUI, TreeUI } from './ui.js';

const CRUD_STATE_KEY = 'crud_state';

/**
 * CRUD Operation Manager for tree items
 */
class TreeItemManager {
    constructor() {
        this.pendingOperations = new Map();
        this.initialize();
    }

    /**
     * Initialize CRUD state management
     */
    initialize() {
        State.set(CRUD_STATE_KEY, {
            activeOperations: new Set(),
            lastOperation: null,
            error: null
        });

        // Subscribe to API state changes
        State.subscribe('api_state', (newState) => {
            if (newState.error) {
                this.handleError('API Error', newState.error);
            }
        });
    }

    /**
     * Creates a new tree item
     * @param {string} type - Item type (project/location/measurement)
     * @param {Array} fields - Field configuration array
     * @param {string|null} parentId - Optional parent ID
     * @returns {Promise<void>}
     */
    async addItem(type, fields, parentId = null) {
        try {
            this.startOperation('create', type);

            // Create temporary container
            const tempId = `temp-${type}-${Date.now()}`;
            const tempForm = await this.createTempForm(type, tempId, fields, parentId);
            
            // Find parent container
            const parentContainer = this.getParentContainer(type, parentId);
            if (!parentContainer) {
                throw new Error('Parent container not found');
            }

            // Insert form
            this.insertForm(tempForm, parentContainer, parentId);

            // Focus first field
            tempForm.querySelector('input,select')?.focus();

            this.completeOperation('create', type);
        } catch (error) {
            this.handleError('Create Error', error);
            this.completeOperation('create', type, error);
        }
    }

    /**
     * Updates an existing tree item
     * @param {Event} event - Form submission event
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Array} fields - Field configuration array
     * @returns {Promise<void>}
     */
    async updateItem(event, type, id, fields) {
        event.preventDefault();
        
        try {
            this.startOperation('update', type);
            
            // Collect and validate form data
            const form = event.target;
            const data = this.collectFormData(form, fields);
            if (!this.validateFormData(data, fields)) {
                throw new Error('Invalid form data');
            }

            // Disable form during update
            this.setFormDisabled(form, true);

            // Make API call
            const response = await API[`${type}s`].update(id, data);

            // Update UI
            await this.updateUIFromResponse(response, type, id);
            
            NotificationUI.show({
                message: `${type} updated successfully`,
                type: 'success'
            });

            this.completeOperation('update', type);
        } catch (error) {
            this.handleError('Update Error', error);
            this.completeOperation('update', type, error);
        } finally {
            const form = document.getElementById(`${type}Form-${id}`);
            this.setFormDisabled(form, false);
        }
    }

    /**
     * Deletes a tree item
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @returns {Promise<void>}
     */
    async deleteItem(type, id) {
        try {
            this.startOperation('delete', type);

            const treeItem = document.getElementById(`id_form-${type}-${id}`)?.closest('.tree-item');
            const container = document.getElementById(`id_${type}-${id}`);
            
            // Start fade animation
            [treeItem, container].forEach(el => {
                if (el) {
                    el.style.transition = 'opacity 0.3s';
                    el.style.opacity = '0.5';
                    el.style.pointerEvents = 'none';
                }
            });

            // Delete via API
            await API[`${type}s`].delete(id);

            // Remove from DOM
            [treeItem, container].forEach(el => el?.remove());

            NotificationUI.show({
                message: `${type} deleted successfully`,
                type: 'success'
            });

            this.completeOperation('delete', type);
        } catch (error) {
            // Restore elements on error
            [treeItem, container].forEach(el => {
                if (el) {
                    el.style.opacity = '1';
                    el.style.pointerEvents = 'auto';
                }
            });

            this.handleError('Delete Error', error);
            this.completeOperation('delete', type, error);
        }
    }

    /**
     * Enables edit mode for a tree item
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Array} fields - Field configuration array
     * @returns {Promise<void>}
     */
    async editItem(type, id, fields) {
        try {
            this.startOperation('edit', type);

            const form = document.getElementById(`${type}Form-${id}`);
            if (!form) throw new Error('Form not found');

            // Store original values and make fields editable
            fields.forEach(field => {
                const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
                if (!element) return;

                element.dataset.originalValue = element.value;
                if (element.tagName === 'SELECT') {
                    element.dataset.originalText = element.options[element.selectedIndex]?.text;
                }

                element.removeAttribute(element.tagName === 'SELECT' ? 'disabled' : 'readonly');
                element.style.display = 'inline-block';
                element.classList.add('editing');
            });

            // Show edit controls
            const controls = document.getElementById(`id_${type}EditControls-${id}`);
            if (controls) {
                controls.style.display = 'inline-flex';
            }

            // Focus name field
            document.getElementById(`id_${type}Name-${id}`)?.focus();

            this.completeOperation('edit', type);
        } catch (error) {
            this.handleError('Edit Error', error);
            this.completeOperation('edit', type, error);
        }
    }

    /**
     * Cancels edit mode for a tree item
     * @param {Event} event - Click event
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Array} fields - Field configuration array
     */
    cancelEdit(event, type, id, fields) {
        event.preventDefault();

        try {
            this.startOperation('cancelEdit', type);

            fields.forEach(field => {
                const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
                if (!element) return;

                // Restore original value
                element.value = element.dataset.originalValue || '';

                // Restore display state
                element.setAttribute(
                    element.tagName === 'SELECT' ? 'disabled' : 'readonly',
                    'true'
                );
                element.style.display = field === 'name' ? 'inline-block' : 'none';
                element.classList.remove('editing', 'error');

                // Clean up stored data
                delete element.dataset.originalValue;
                delete element.dataset.originalText;
            });

            // Hide edit controls
            const controls = document.getElementById(`id_${type}EditControls-${id}`);
            if (controls) {
                controls.style.display = 'none';
            }

            this.clearFormErrors(type, id);
            this.completeOperation('cancelEdit', type);
        } catch (error) {
            this.handleError('Cancel Edit Error', error);
            this.completeOperation('cancelEdit', type, error);
        }
    }

    // Private helper methods

    /**
     * Creates a temporary form for new items
     * @private
     */
    async createTempForm(type, tempId, fields, parentId) {
        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;
        form.className = 'tree-item w3-hover-light-grey';

        // Add CSRF token
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
        if (csrfToken) {
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfmiddlewaretoken';
            csrfInput.value = csrfToken;
            form.appendChild(csrfInput);
        }

        // Add fields
        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'fields-container';

        for (const field of fields) {
            const input = await TreeUI.createField(field, type, tempId);
            fieldsContainer.appendChild(input);
        }

        form.appendChild(fieldsContainer);

        // Add edit controls
        const controls = TreeUI.createEditControls(type, tempId);
        form.appendChild(controls);

        return form;
    }

    /**
     * Gets parent container for new items
     * @private
     */
    getParentContainer(type, parentId) {
        return parentId
            ? document.getElementById(`id_${type}-${parentId}`)
            : document.querySelector('.tree-headings');
    }

    /**
     * Inserts form into DOM
     * @private
     */
    insertForm(form, parentContainer, parentId) {
        if (parentId) {
            parentContainer.classList.remove('w3-hide');
            parentContainer.classList.add('w3-show');
            parentContainer.insertAdjacentElement('afterbegin', form);

            const chevronIcon = document.getElementById(`id_chevronIcon-id_${parentContainer.id}`);
            if (chevronIcon) {
                chevronIcon.className = "bi bi-chevron-down";
            }
        } else {
            parentContainer.insertAdjacentElement('afterend', form);
        }
    }

    /**
     * Collects form data
     * @private
     */
    collectFormData(form, fields) {
        const data = {};
        fields.forEach(field => {
            const element = form.querySelector(`[name="${field}"]`);
            if (element) {
                data[field] = element.value;
            }
        });
        return data;
    }

    /**
     * Validates form data
     * @private
     */
    validateFormData(data, fields) {
        return fields.every(field => {
            const value = data[field];
            return value !== undefined && value !== '';
        });
    }

    /**
     * Updates UI with API response
     * @private
     */
    async updateUIFromResponse(response, type, id) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = response.html;

        const oldElement = document.getElementById(`id_form-${type}-${id}`)?.closest('.tree-item');
        if (oldElement && tempDiv.firstElementChild) {
            oldElement.replaceWith(tempDiv.firstElementChild);
        }
    }

    /**
     * Sets form disabled state
     * @private
     */
    setFormDisabled(form, disabled) {
        if (!form) return;
        
        form.querySelectorAll('input, select, button').forEach(element => {
            element.disabled = disabled;
        });
    }

    /**
     * Clears form errors
     * @private
     */
    clearFormErrors(type, id) {
        const form = document.getElementById(`${type}Form-${id}`);
        if (!form) return;

        form.querySelectorAll('.field-error').forEach(error => error.remove());
        form.querySelectorAll('.error').forEach(field => field.classList.remove('error'));
    }

    /**
     * Starts a CRUD operation
     * @private
     */
    startOperation(operation, type) {
        const activeOperations = State.get(CRUD_STATE_KEY).activeOperations;
        activeOperations.add(`${operation}_${type}`);
        State.update(CRUD_STATE_KEY, { activeOperations });
    }

    /**
     * Completes a CRUD operation
     * @private
     */
    completeOperation(operation, type, error = null) {
        const state = State.get(CRUD_STATE_KEY);
        state.activeOperations.delete(`${operation}_${type}`);
        State.update(CRUD_STATE_KEY, {
            activeOperations: state.activeOperations,
            lastOperation: {
                type: operation,
                itemType: type,
                timestamp: new Date(),
                status: error ? 'error' : 'success',
                error
            }
        });
    }

    /**
     * Handles operation errors
     * @private
     */
    handleError(context, error) {
        console.error(`${context}:`, error);
        
        NotificationUI.show({
            message: `${context}: ${error.message}`,
            type: 'error'
        });

        State.update(CRUD_STATE_KEY, { error: {
            context,
            message: error.message,
            timestamp: new Date()
        }});
    }
}

// Export singleton instance
export const crud = new TreeItemManager();