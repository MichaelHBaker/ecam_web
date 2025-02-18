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
     * @param {string} type - Item type
     * @param {string} id - Item ID
     * @param {Object} data - Update data
     * @returns {Promise<void>}
     */
async updateItem(type, id, data) {
    try {
        this.startOperation('update', type);

        // Get item container
        const item = document.querySelector(`[data-type="${type}"][data-id="${id}"]`);
        if (!item) {
            throw new Error('Item not found');
        }

        // Save current state for rollback
        const previousState = this.saveItemState(item);

        // Update UI optimistically
        this.updateItemUI(item, data);

        try {
            // Send API request
            const response = await API[`${type}s`].update(id, data);
            
            // Update state and UI with response data
            this.finalizeUpdate(item, response);
            
            NotificationUI.show({
                message: `${type} updated successfully`,
                type: 'success'
            });

        } catch (error) {
            // Rollback UI changes on error
            this.rollbackItemState(item, previousState);
            throw error;
        }

        this.completeOperation('update', type);
    } catch (error) {
        this.handleError('Update Error', error);
        this.completeOperation('update', type, error);
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

        // Get item container
        const item = document.querySelector(`[data-type="${type}"][data-id="${id}"]`);
        if (!item) {
            throw new Error('Item not found');
        }

        // Save state for potential rollback
        const parentContainer = item.parentElement;
        const nextSibling = item.nextSibling;
        const itemState = this.saveItemState(item);

        // Remove item optimistically
        item.classList.add('w3-animate-opacity');
        await new Promise(resolve => setTimeout(resolve, 300));
        item.remove();

        try {
            // Send API request
            await API[`${type}s`].delete(id);
            
            NotificationUI.show({
                message: `${type} deleted successfully`,
                type: 'success'
            });

        } catch (error) {
            // Rollback on error
            this.rollbackDelete(parentContainer, nextSibling, item, itemState);
            throw error;
        }

        this.completeOperation('delete', type);
    } catch (error) {
        this.handleError('Delete Error', error);
        this.completeOperation('delete', type, error);
    }
}
/**
     * Creates a temporary form for new items
     * @private
     */
async createTempForm(type, tempId, fields, parentId) {
    const form = document.createElement('form');
    form.className = 'tree-item temp-item w3-animate-opacity';
    form.dataset.type = type;
    form.dataset.id = tempId;

    // Add fields
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'fields-container';

    for (const field of fields) {
        const input = document.createElement('input');
        input.type = field.type || 'text';
        input.name = field.name;
        input.className = 'tree-item-field w3-input';
        input.placeholder = field.label || field.name;
        input.required = field.required || false;
        
        if (field.pattern) {
            input.pattern = field.pattern;
        }
        
        fieldsContainer.appendChild(input);
    }

    // Add hidden parent ID if provided
    if (parentId) {
        const parentInput = document.createElement('input');
        parentInput.type = 'hidden';
        parentInput.name = 'parent_id';
        parentInput.value = parentId;
        fieldsContainer.appendChild(parentInput);
    }

    // Add action buttons
    const actions = document.createElement('div');
    actions.className = 'edit-controls w3-right';
    actions.innerHTML = `
        <button type="submit" class="w3-button w3-green">
            <i class="bi bi-check"></i> Save
        </button>
        <button type="button" class="w3-button w3-red" data-action="cancel">
            <i class="bi bi-x"></i> Cancel
        </button>
    `;

    // Add event listeners
    form.addEventListener('submit', (e) => this.handleSubmit(e, type));
    actions.querySelector('[data-action="cancel"]').addEventListener('click', 
        () => this.handleCancel(form));

    form.appendChild(fieldsContainer);
    form.appendChild(actions);

    return form;
}

/**
 * Find appropriate parent container for new item
 * @private
 */
getParentContainer(type, parentId) {
    if (!parentId) {
        return document.querySelector('.tree-container');
    }

    const parentItem = document.querySelector(`[data-id="${parentId}"]`);
    if (!parentItem) return null;

    let container = parentItem.querySelector('.children-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'children-container';
        parentItem.appendChild(container);
    }

    return container;
}

/**
 * Insert form into container
 * @private
 */
insertForm(form, container, parentId) {
    if (parentId) {
        // Insert at top of children container
        container.insertBefore(form, container.firstChild);
    } else {
        // Insert at bottom of main container
        container.appendChild(form);
    }

    // Trigger animation
    requestAnimationFrame(() => {
        form.style.opacity = '1';
    });
}

/**
 * Save item state for potential rollback
 * @private
 */
saveItemState(item) {
    return {
        innerHTML: item.innerHTML,
        className: item.className,
        style: item.getAttribute('style'),
        data: Object.fromEntries(
            Array.from(item.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .map(attr => [attr.name, attr.value])
        )
    };
}
/**
     * Handle form submission
     * @private
     */
async handleSubmit(event, type) {
    event.preventDefault();
    const form = event.target;
    
    try {
        this.startOperation('save', type);
        
        // Collect form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Send to API
        const response = await API[`${type}s`].create(data);
        
        // Replace temp form with new item
        const newItem = TreeUI.createTreeItem({
            type,
            id: response.id,
            name: response.name,
            fields: Object.keys(data),
            parent: data.parent_id,
            hasChildren: type !== 'measurement'
        });

        form.parentNode.insertBefore(newItem, form);
        form.remove();

        NotificationUI.show({
            message: `${type} created successfully`,
            type: 'success'
        });

        this.completeOperation('save', type);
        
    } catch (error) {
        this.handleError('Save Error', error);
        this.completeOperation('save', type, error);
    }
}

/**
 * Handle form cancellation
 * @private
 */
handleCancel(form) {
    form.classList.add('w3-animate-opacity');
    form.style.opacity = '0';
    
    setTimeout(() => {
        form.remove();
    }, 300);
}

/**
 * Update item UI with new data
 * @private
 */
updateItemUI(item, data) {
    // Update visible fields
    Object.entries(data).forEach(([key, value]) => {
        const field = item.querySelector(`[name="${key}"]`);
        if (field) {
            field.value = value;
            
            // Update display value if read-only
            if (field.readOnly) {
                const display = item.querySelector(`[data-field="${key}"]`);
                if (display) {
                    display.textContent = value;
                }
            }
        }
    });

    // Update any dependent UI elements
    const nameField = data.name || data.title;
    if (nameField) {
        const nameDisplay = item.querySelector('.item-name');
        if (nameDisplay) {
            nameDisplay.textContent = nameField;
        }
    }
}

/**
 * Rollback item state
 * @private
 */
rollbackItemState(item, state) {
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
}

/**
 * Operation state management
 * @private
 */
startOperation(operation, type) {
    const operationId = `${operation}-${type}-${Date.now()}`;
    this.pendingOperations.set(operationId, {
        type: operation,
        itemType: type,
        startTime: new Date(),
        status: 'pending'
    });

    State.update(CRUD_STATE_KEY, {
        activeOperations: Array.from(this.pendingOperations.keys()),
        lastOperation: {
            id: operationId,
            type: operation,
            itemType: type,
            status: 'started'
        }
    });

    return operationId;
}
/**
     * Complete operation and update state
     * @private
     */
completeOperation(operation, type, error = null) {
    const operationId = Array.from(this.pendingOperations.keys())
        .find(key => {
            const op = this.pendingOperations.get(key);
            return op.type === operation && 
                   op.itemType === type && 
                   op.status === 'pending';
        });

    if (operationId) {
        const operationData = this.pendingOperations.get(operationId);
        operationData.status = error ? 'error' : 'completed';
        operationData.endTime = new Date();
        operationData.error = error;

        if (!error) {
            this.pendingOperations.delete(operationId);
        }

        State.update(CRUD_STATE_KEY, {
            activeOperations: Array.from(this.pendingOperations.keys()),
            lastOperation: {
                id: operationId,
                type: operation,
                itemType: type,
                status: operationData.status,
                duration: operationData.endTime - operationData.startTime,
                error: error ? error.message : null
            }
        });
    }
}

/**
 * Error handling with user feedback
 * @private
 */
handleError(context, error) {
    console.error(`${context}:`, error);

    // Show user notification
    NotificationUI.show({
        message: error.message || 'An error occurred',
        type: 'error',
        duration: 5000
    });

    // Update error state
    State.update(CRUD_STATE_KEY, {
        error: {
            context,
            message: error.message,
            timestamp: new Date(),
            stack: error.stack
        }
    });

    // Log to monitoring system if available
    if (window.errorMonitor) {
        window.errorMonitor.logError(context, error);
    }
}

/**
 * Finalize update with response data
 * @private
 */
finalizeUpdate(item, response) {
    // Update any server-generated fields
    if (response.updated_at) {
        const timestamp = item.querySelector('.update-timestamp');
        if (timestamp) {
            timestamp.textContent = new Date(response.updated_at)
                .toLocaleString();
        }
    }

    // Update version if tracked
    if (response.version) {
        item.dataset.version = response.version;
    }

    // Update any computed fields
    if (response.computed_fields) {
        Object.entries(response.computed_fields).forEach(([field, value]) => {
            const display = item.querySelector(`[data-computed="${field}"]`);
            if (display) {
                display.textContent = value;
            }
        });
    }
}

/**
 * Roll back a deleted item
 * @private
 */
rollbackDelete(parentContainer, nextSibling, item, state) {
    // Restore item content and attributes
    this.rollbackItemState(item, state);
    
    // Reinsert at original position
    if (nextSibling) {
        parentContainer.insertBefore(item, nextSibling);
    } else {
        parentContainer.appendChild(item);
    }

    // Restore visibility with animation
    item.style.opacity = '0';
    requestAnimationFrame(() => {
        item.classList.add('w3-animate-opacity');
        item.style.opacity = '1';
    });
}

/**
 * Check if operations are pending
 * @returns {boolean}
 */
hasPendingOperations() {
    return this.pendingOperations.size > 0;
}

/**
 * Get operation statistics
 * @returns {Object}
 */
getOperationStats() {
    const stats = {
        total: 0,
        completed: 0,
        pending: 0,
        error: 0,
        byType: {}
    };

    this.pendingOperations.forEach(op => {
        stats.total++;
        stats[op.status]++;
        
        if (!stats.byType[op.itemType]) {
            stats.byType[op.itemType] = {
                total: 0,
                completed: 0,
                pending: 0,
                error: 0
            };
        }
        
        stats.byType[op.itemType].total++;
        stats.byType[op.itemType][op.status]++;
    });

    return stats;
}
}

// Export singleton instance
export const CRUD = new TreeItemManager();