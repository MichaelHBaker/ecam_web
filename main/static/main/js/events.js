// events.js
// Event management and delegation

import { crud } from './crud.js';
import { State } from './state.js';
import { NotificationUI, TreeUI } from './ui.js';

/**
 * Event delegation and management class
 */
class EventManager {
    constructor() {
        this.handlers = new Map();
        this.initialized = false;
        
        // Bind methods
        this.handleTreeClick = this.handleTreeClick.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleFileInput = this.handleFileInput.bind(this);
        this.handleDropZone = this.handleDropZone.bind(this);
        this.handleKeyboardShortcuts = this.handleKeyboardShortcuts.bind(this);
    }

    /**
     * Initialize event listeners
     */
    initialize() {
        if (this.initialized) return;

        // Tree item click delegation
        document.addEventListener('click', this.handleTreeClick);

        // Form submission delegation
        document.addEventListener('submit', this.handleFormSubmit);

        // File handling
        this.initializeFileHandlers();

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts);

        this.initialized = true;
    }

    /**
     * Handle clicks within tree structure
     * @param {Event} event - Click event
     */
    handleTreeClick(event) {
        const target = event.target;

        // Handle chevron clicks for expanding/collapsing
        if (target.closest('.bi-chevron-right, .bi-chevron-down')) {
            const treeItem = target.closest('.tree-item');
            if (treeItem) {
                const nodeId = treeItem.dataset.nodeId;
                if (nodeId) {
                    TreeUI.toggleNode(nodeId);
                }
                event.stopPropagation();
                return;
            }
        }

        // Handle action menu clicks
        if (target.closest('.item-actions')) {
            const actionButton = target.closest('[data-action]');
            if (actionButton) {
                const action = actionButton.dataset.action;
                const type = actionButton.dataset.type;
                const id = actionButton.dataset.id;

                this.handleAction(action, type, id);
                event.preventDefault();
                event.stopPropagation();
            }
        }

        // Handle edit controls
        if (target.closest('.edit-controls')) {
            const button = target.closest('button');
            if (button) {
                const form = button.closest('form');
                const type = form.dataset.type;
                const id = form.dataset.id;

                if (button.type === 'submit') {
                    // Submit handled by form submit handler
                    return;
                }

                if (button.dataset.action === 'cancel') {
                    crud.cancelEdit(event, type, id, this.getFieldsForType(type));
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        }
    }

    /**
     * Handle form submissions
     * @param {Event} event - Submit event
     */
    handleFormSubmit(event) {
        const form = event.target;
        const type = form.dataset.type;
        const id = form.dataset.id;

        if (type && id) {
            crud.updateItem(event, type, id, this.getFieldsForType(type));
        }
    }

    /**
     * Initialize file input and drop zone handlers
     */
    initializeFileHandlers() {
        // File input change events
        document.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener('change', this.handleFileInput);
        });

        // Drop zone events
        document.querySelectorAll('.drop-zone').forEach(zone => {
            this.setupDropZone(zone);
        });
    }

    /**
     * Handle file input changes
     * @param {Event} event - Change event
     */
    handleFileInput(event) {
        const input = event.target;
        const locationId = input.dataset.locationId;

        if (locationId) {
            const file = input.files[0];
            if (file) {
                crud.handleFileUpload(locationId, file);
            }
        }
    }

    /**
     * Set up drop zone event handlers
     * @param {HTMLElement} zone - Drop zone element
     */
    setupDropZone(zone) {
        const locationId = zone.dataset.locationId;
        if (!locationId) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Visual feedback
        zone.addEventListener('dragenter', () => {
            zone.classList.add('drop-zone-active');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drop-zone-active');
        });

        // Handle drops
        zone.addEventListener('drop', this.handleDropZone);
    }

    /**
     * Handle file drops
     * @param {DragEvent} event - Drop event
     */
    handleDropZone(event) {
        const zone = event.target.closest('.drop-zone');
        if (!zone) return;

        zone.classList.remove('drop-zone-active');

        const locationId = zone.dataset.locationId;
        const files = event.dataTransfer.files;

        if (locationId && files.length) {
            crud.handleFileUpload(locationId, files[0]);
        }
    }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyboardShortcuts(event) {
        // Avoid handling when in input/textarea
        if (event.target.matches('input, textarea')) {
            return;
        }

        const modKey = event.metaKey || event.ctrlKey;

        // Common shortcuts
        switch (event.key.toLowerCase()) {
            case 's':
                if (modKey) {
                    // Save active item
                    const activeForm = document.querySelector('form.editing');
                    if (activeForm) {
                        event.preventDefault();
                        activeForm.requestSubmit();
                    }
                }
                break;

            case 'escape':
                // Cancel active edit
                const activeEdit = document.querySelector('.edit-controls[style*="display: inline-flex"]');
                if (activeEdit) {
                    const form = activeEdit.closest('form');
                    const type = form.dataset.type;
                    const id = form.dataset.id;
                    crud.cancelEdit(event, type, id, this.getFieldsForType(type));
                }
                break;
        }
    }

    /**
     * Handle menu actions
     * @param {string} action - Action type
     * @param {string} type - Item type
     * @param {string} id - Item ID
     */
    handleAction(action, type, id) {
        switch (action) {
            case 'edit':
                crud.editItem(type, id, this.getFieldsForType(type));
                break;

            case 'delete':
                crud.deleteItem(type, id);
                break;

            case 'add-child':
                crud.addItem(this.getChildType(type), this.getFieldsForType(type), id);
                break;

            case 'show-modal':
                crud.showMeasurementModal(id);
                break;
        }
    }

    /**
     * Get fields configuration for a type
     * @param {string} type - Item type
     * @returns {Array} Field configuration
     */
    getFieldsForType(type) {
        const modelFields = State.get('modelFields');
        return modelFields?.[type]?.fields || [];
    }

    /**
     * Get child type for a parent type
     * @param {string} parentType - Parent type
     * @returns {string|null} Child type
     */
    getChildType(parentType) {
        const modelFields = State.get('modelFields');
        return modelFields?.[parentType]?.child_type || null;
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        if (!this.initialized) return;

        document.removeEventListener('click', this.handleTreeClick);
        document.removeEventListener('submit', this.handleFormSubmit);
        document.removeEventListener('keydown', this.handleKeyboardShortcuts);

        // Clean up file handlers
        document.querySelectorAll('input[type="file"]').forEach(input => {
            input.removeEventListener('change', this.handleFileInput);
        });

        this.initialized = false;
    }
}

// Export singleton instance
export const Events = new EventManager();