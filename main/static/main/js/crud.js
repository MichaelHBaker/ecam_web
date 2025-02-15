// crud.js
// Core CRUD operations for tree items

import { API } from './api.js';
import { State } from './state.js';
import { Forms } from './forms.js';
import { TreeUI, StatusUI, NotificationUI } from './ui.js';
import { Modal } from './modals.js';

/**
 * Handles CRUD operations for tree items
 */
class TreeItemManager {
    constructor() {
        this.pendingOperations = new Map();
    }

    /**
     * Creates a new tree item
     * @param {string} type - Item type (project/location/measurement)
     * @param {Array} fields - Field configuration array
     * @param {string|null} parentId - Optional parent ID
     */
    async addItem(type, fields, parentId = null) {
        try {
            // Create temporary container with unique ID
            const tempId = `temp-${type}-${Date.now()}`;
            const tempForm = await this._createTempForm(type, tempId, fields, parentId);
            
            // Find and update parent container
            const parentContainer = this._getParentContainer(type, parentId);
            if (!parentContainer) {
                throw new Error('Parent container not found');
            }

            // Insert form in appropriate location
            this._insertForm(tempForm, parentContainer, parentId);

            // Set up form submission handling
            this._setupFormSubmission(tempForm, type, tempId, fields, parentId);

            // Focus first field
            tempForm.querySelector('input,select')?.focus();

        } catch (error) {
            console.error('Error in addItem:', error);
            NotificationUI.show({
                message: `Failed to create ${type}: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Updates an existing tree item
     * @param {Event} event - Form submission event
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Array} fields - Field configuration array
     */
    async updateItem(event, type, id, fields) {
        event.preventDefault();
        Forms.clearErrors(type, id);

        try {
            // Validate form
            if (!Forms.validate(type, id, fields)) {
                return;
            }

            // Collect and validate data
            const data = Forms.collectData(type, id, fields);
            if (!data) {
                throw new Error('Invalid form data');
            }

            // Disable form during update
            const form = event.target;
            this._disableForm(form, true);

            // Make API call
            StatusUI.show(`Updating ${type}...`);
            const response = await API[`${type}s`].update(id, data);

            // Update UI with response
            await this._updateUIFromResponse(response, type, id);

            NotificationUI.show({
                message: `${type} updated successfully`,
                type: 'success'
            });

        } catch (error) {
            console.error('Error in updateItem:', error);
            Forms.showError(type, id, error.message);
            
        } finally {
            // Re-enable form
            const form = document.getElementById(`${type}Form-${id}`);
            this._disableForm(form, false);
            StatusUI.hide();
        }
    }

    /**
     * Deletes a tree item
     * @param {string} type - Item type
     * @param {string} id - Item ID
     */
    async deleteItem(type, id) {
        if (!confirm(`Are you sure you want to delete this ${type}? This action cannot be undone.`)) {
            return;
        }

        const treeItem = document.getElementById(`id_form-${type}-${id}`)?.closest('.tree-item');
        const container = document.getElementById(`id_${type}-${id}`);
        
        try {
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

        } catch (error) {
            console.error('Error in deleteItem:', error);
            
            // Restore elements
            [treeItem, container].forEach(el => {
                if (el) {
                    el.style.opacity = '1';
                    el.style.pointerEvents = 'auto';
                }
            });

            NotificationUI.show({
                message: `Failed to delete ${type}: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Enables edit mode for a tree item
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Array} fields - Field configuration array
     */
    async editItem(type, id, fields) {
        try {
            const form = document.getElementById(`${type}Form-${id}`);
            if (!form) throw new Error('Form not found');

            // Store original values
            fields.forEach(field => {
                const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
                if (!element) return;

                element.dataset.originalValue = element.value;
                if (element.tagName === 'SELECT') {
                    element.dataset.originalText = element.options[element.selectedIndex]?.text;
                }

                // Make editable
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

        } catch (error) {
            console.error('Error in editItem:', error);
            NotificationUI.show({
                message: `Failed to edit ${type}: ${error.message}`,
                type: 'error'
            });
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

            Forms.clearErrors(type, id);

        } catch (error) {
            console.error('Error in cancelEdit:', error);
            NotificationUI.show({
                message: `Failed to cancel edit: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Shows measurement modal
     * @param {string} locationId - Location ID
     */
    showMeasurementModal(locationId) {
        try {
            Modal.show(locationId);
        } catch (error) {
            console.error('Error showing modal:', error);
            NotificationUI.show({
                message: `Failed to show modal: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Hides measurement modal
     * @param {string} locationId - Location ID
     */
    hideMeasurementModal(locationId) {
        try {
            Modal.hide(locationId);
        } catch (error) {
            console.error('Error hiding modal:', error);
            NotificationUI.show({
                message: `Failed to hide modal: ${error.message}`,
                type: 'error'
            });
        }
    }

    // Private helper methods

    /**
     * Creates a temporary form for new items
     * @private
     */
    async _createTempForm(type, tempId, fields, parentId) {
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
            const input = await Forms.createField(field, type, tempId);
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
    _getParentContainer(type, parentId) {
        return parentId
            ? document.getElementById(`id_${type}-${parentId}`)
            : document.querySelector('.tree-headings');
    }

    /**
     * Inserts form into DOM
     * @private
     */
    _insertForm(form, parentContainer, parentId) {
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
     * Sets up form submission handling
     * @private
     */
    _setupFormSubmission(form, type, tempId, fields, parentId) {
        form.onsubmit = async (event) => {
            event.preventDefault();
            
            try {
                this._disableForm(form, true);

                const data = Forms.collectData(type, tempId, fields);
                if (parentId) {
                    data[`${type}_id`] = parentId;
                }

                const response = await API[`${type}s`].create(data);
                await this._updateUIFromResponse(response, type, tempId);

                NotificationUI.show({
                    message: `${type} created successfully`,
                    type: 'success'
                });

            } catch (error) {
                console.error('Error in form submission:', error);
                Forms.showError(type, tempId, error.message);

            } finally {
                this._disableForm(form, false);
            }
        };
    }

    /**
     * Updates UI with API response
     * @private
     */
    async _updateUIFromResponse(response, type, id) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = response.html;

        const oldElement = document.getElementById(`id_form-${type}-${id}`)?.closest('.tree-item');
        if (oldElement && tempDiv.firstElementChild) {
            oldElement.replaceWith(tempDiv.firstElementChild);
        }
    }

    /**
     * Disables/enables form inputs
     * @private
     */
    _disableForm(form, disabled) {
        if (!form) return;
        
        form.querySelectorAll('input, select, button').forEach(element => {
            element.disabled = disabled;
        });
    }
}

// Export singleton instance
export const crud = new TreeItemManager();