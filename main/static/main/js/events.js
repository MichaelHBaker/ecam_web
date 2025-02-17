// events.js
// Enhanced event management and delegation module

import { crud } from './crud.js';
import { State } from './state.js';
import { NotificationUI } from './ui.js';

const EVENTS_STATE_KEY = 'events_state';

/**
 * Enhanced event delegation and management class
 */
class EventManager {
    constructor() {
        this.handlers = new Map();
        this.initialized = false;
        this.debounceTimers = new Map();
        
        // Bind methods
        this.handleTreeClick = this.handleTreeClick.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleFileInput = this.handleFileInput.bind(this);
        this.handleDropZone = this.handleDropZone.bind(this);
        this.handleKeyboardShortcuts = this.handleKeyboardShortcuts.bind(this);
        this.handleGlobalClick = this.handleGlobalClick.bind(this);
        this.handleWindowResize = this.debounce(this.handleWindowResize.bind(this), 250);
    }

    /**
     * Initialize event listeners with error handling
     */
    initialize() {
        if (this.initialized) return;

        try {
            // Initialize event state
            State.set(EVENTS_STATE_KEY, {
                activeHandlers: new Set(),
                lastEvent: null,
                error: null
            });

            // Tree item click delegation
            document.addEventListener('click', this.handleTreeClick, { passive: false });

            // Form submission delegation
            document.addEventListener('submit', this.handleFormSubmit);

            // Global click handler for dropdowns, modals, etc.
            document.addEventListener('click', this.handleGlobalClick);

            // Window resize handler
            window.addEventListener('resize', this.handleWindowResize);

            // File handling
            this.initializeFileHandlers();

            // Keyboard shortcuts
            document.addEventListener('keydown', this.handleKeyboardShortcuts);

            this.initialized = true;
            this.updateEventState('initialized');
        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Handle clicks within tree structure with improved delegation
     * @param {Event} event - Click event
     */
    handleTreeClick(event) {
        try {
            this.updateEventState('treeClick', { target: event.target });
            const target = event.target;

            // Handle chevron clicks for expanding/collapsing
            if (target.closest('.bi-chevron-right, .bi-chevron-down')) {
                const treeItem = target.closest('.tree-item');
                if (treeItem) {
                    const nodeId = treeItem.dataset.nodeId;
                    if (nodeId) {
                        this.toggleTreeNode(nodeId);
                        event.stopPropagation();
                        return;
                    }
                }
            }

            // Handle action menu clicks
            if (target.closest('.item-actions')) {
                const actionButton = target.closest('[data-action]');
                if (actionButton) {
                    this.handleActionClick(actionButton, event);
                    return;
                }
            }

            // Handle edit controls
            if (target.closest('.edit-controls')) {
                this.handleEditControlClick(target, event);
            }

        } catch (error) {
            this.handleError('Tree Click Error', error);
        }
    }

    /**
     * Handle form submissions with validation and error handling
     * @param {Event} event - Submit event
     */
    handleFormSubmit(event) {
        try {
            this.updateEventState('formSubmit', { form: event.target });
            const form = event.target;
            const type = form.dataset.type;
            const id = form.dataset.id;

            if (type && id) {
                this.validateAndSubmitForm(event, type, id);
            }
        } catch (error) {
            this.handleError('Form Submit Error', error);
        }
    }

    /**
     * Create a debounced function
     * @private
     */
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Update event state
     * @private
     */
    updateEventState(eventType, data = {}) {
        State.update(EVENTS_STATE_KEY, {
            lastEvent: {
                type: eventType,
                timestamp: new Date(),
                data
            }
        });
    }

    /**
     * Handle operation errors
     * @private
     */
    handleError(context, error) {
        console.error(`${context}:`, error);
        
        NotificationUI.show({
            message: `${context}: ${error.message}`,
            type: 'error'
        });

        State.update(EVENTS_STATE_KEY, {
            error: {
                context,
                message: error.message,
                timestamp: new Date()
            }
        });
    }

// events.js - Part 2
// File handling and keyboard shortcuts

// Continuing the EventManager class...

    /**
     * Initialize file input and drop zone handlers with error handling
     */
    initializeFileHandlers() {
        try {
            // File input change events
            document.querySelectorAll('input[type="file"]').forEach(input => {
                input.addEventListener('change', this.handleFileInput);
                
                // Add data attributes for file validation
                input.dataset.maxSize = '50MB';
                input.dataset.allowedTypes = 'text/csv,application/vnd.ms-excel';
            });

            // Drop zone events
            document.querySelectorAll('.drop-zone').forEach(zone => {
                this.setupDropZone(zone);
            });

            this.updateEventState('fileHandlersInitialized');
        } catch (error) {
            this.handleError('File Handler Initialization Error', error);
        }
    }

    /**
     * Handle file input changes with validation
     * @param {Event} event - Change event
     */
    handleFileInput(event) {
        try {
            this.updateEventState('fileInput', { input: event.target });
            const input = event.target;
            const locationId = input.dataset.locationId;

            if (locationId) {
                const file = input.files[0];
                if (file) {
                    if (this.validateFile(file, input)) {
                        crud.handleFileUpload(locationId, file);
                    }
                }
            }
        } catch (error) {
            this.handleError('File Input Error', error);
        }
    }

    /**
     * Set up drop zone event handlers with error handling
     * @param {HTMLElement} zone - Drop zone element
     */
    setupDropZone(zone) {
        try {
            const locationId = zone.dataset.locationId;
            if (!locationId) return;

            // Enhanced drag event handling
            const dragEvents = ['dragenter', 'dragover', 'dragleave', 'drop'];
            
            dragEvents.forEach(eventName => {
                zone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.updateEventState(`dropZone${eventName}`, { zone });
                });
            });

            // Visual feedback with transition
            zone.style.transition = 'all 0.3s ease';
            
            zone.addEventListener('dragenter', () => {
                zone.classList.add('drop-zone-active');
                zone.classList.add('w3-pale-blue');
            });

            zone.addEventListener('dragover', () => {
                zone.classList.add('drop-zone-active');
                zone.classList.add('w3-pale-blue');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drop-zone-active');
                zone.classList.remove('w3-pale-blue');
            });

            // Handle drops with additional feedback
            zone.addEventListener('drop', (e) => {
                this.handleDropZone(e);
                zone.classList.remove('drop-zone-active');
                zone.classList.remove('w3-pale-blue');
                
                // Show success feedback
                zone.classList.add('w3-pale-green');
                setTimeout(() => {
                    zone.classList.remove('w3-pale-green');
                }, 1000);
            });

            this.updateEventState('dropZoneSetup', { zone });
        } catch (error) {
            this.handleError('Drop Zone Setup Error', error);
        }
    }

    /**
     * Handle file drops with validation
     * @param {DragEvent} event - Drop event
     */
    handleDropZone(event) {
        try {
            this.updateEventState('fileDrop', { target: event.target });
            const zone = event.target.closest('.drop-zone');
            if (!zone) return;

            const locationId = zone.dataset.locationId;
            const files = event.dataTransfer.files;

            if (locationId && files.length) {
                const file = files[0];
                if (this.validateFile(file, zone)) {
                    crud.handleFileUpload(locationId, file);
                }
            }
        } catch (error) {
            this.handleError('File Drop Error', error);
        }
    }

    /**
     * Handle keyboard shortcuts with improved mapping
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyboardShortcuts(event) {
        try {
            // Skip if focusing input elements
            if (event.target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea')) {
                return;
            }

            this.updateEventState('keyboardShortcut', { 
                key: event.key,
                modifiers: {
                    ctrl: event.ctrlKey,
                    alt: event.altKey,
                    shift: event.shiftKey,
                    meta: event.metaKey
                }
            });

            const modKey = event.metaKey || event.ctrlKey;

            // Enhanced shortcut mapping
            const shortcuts = {
                's': {
                    modKey: true,
                    handler: () => {
                        const activeForm = document.querySelector('form.editing');
                        if (activeForm) {
                            event.preventDefault();
                            activeForm.requestSubmit();
                            return true;
                        }
                        return false;
                    }
                },
                'Escape': {
                    modKey: false,
                    handler: () => {
                        const activeEdit = document.querySelector('.edit-controls[style*="display: inline-flex"]');
                        if (activeEdit) {
                            const form = activeEdit.closest('form');
                            const type = form.dataset.type;
                            const id = form.dataset.id;
                            crud.cancelEdit(event, type, id, this.getFieldsForType(type));
                            return true;
                        }
                        
                        // Handle modal close
                        const activeModal = document.querySelector('.modal[style*="display: block"]');
                        if (activeModal) {
                            activeModal.style.display = 'none';
                            return true;
                        }
                        
                        return false;
                    }
                },
                'Enter': {
                    modKey: false,
                    handler: () => {
                        const activeItem = document.querySelector('.tree-item.active');
                        if (activeItem) {
                            const editButton = activeItem.querySelector('[data-action="edit"]');
                            if (editButton) {
                                editButton.click();
                                return true;
                            }
                        }
                        return false;
                    }
                }
            };

            // Execute shortcut if conditions match
            const shortcut = shortcuts[event.key];
            if (shortcut && shortcut.modKey === modKey) {
                const handled = shortcut.handler();
                if (handled) {
                    event.preventDefault();
                    this.updateEventState('shortcutExecuted', { key: event.key });
                }
            }

        } catch (error) {
            this.handleError('Keyboard Shortcut Error', error);
        }
    }

    /**
     * Validate file before upload
     * @private
     * @param {File} file - File to validate
     * @param {HTMLElement} element - Input or drop zone element
     * @returns {boolean} Validation result
     */
    validateFile(file, element) {
        try {
            // Get validation rules from data attributes or defaults
            const maxSize = parseInt(element.dataset.maxSize) || 50 * 1024 * 1024; // 50MB default
            const allowedTypes = (element.dataset.allowedTypes || 'text/csv').split(',');
            
            // Size validation
            if (file.size > maxSize) {
                const sizeMB = Math.round(maxSize / (1024 * 1024));
                NotificationUI.show({
                    message: `File size exceeds ${sizeMB}MB limit`,
                    type: 'error',
                    duration: 5000
                });
                return false;
            }

            // Type validation
            if (!allowedTypes.includes(file.type)) {
                NotificationUI.show({
                    message: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
                    type: 'error',
                    duration: 5000
                });
                return false;
            }

            // Additional CSV validation
            if (file.type === 'text/csv') {
                // Check file extension
                if (!file.name.toLowerCase().endsWith('.csv')) {
                    NotificationUI.show({
                        message: 'File must have .csv extension',
                        type: 'error',
                        duration: 5000
                    });
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.handleError('File Validation Error', error);
            return false;
        }
    }
// events.js - Part 3
// Global events, window handling, and cleanup

    /**
     * Handle global click events for UI components
     * @param {Event} event - Click event
     */
    handleGlobalClick(event) {
        try {
            this.updateEventState('globalClick', { target: event.target });

            // Handle dropdown menus
            if (!event.target.closest('.dropdown-toggle')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                    menu.classList.add('w3-hide');
                });
            }

            // Handle modal backdrop clicks
            if (event.target.classList.contains('modal')) {
                const modalId = event.target.id;
                this.handleModalClose(modalId);
            }

            // Handle outside clicks for active menus
            if (!event.target.closest('.item-actions')) {
                document.querySelectorAll('.item-actions .w3-dropdown-content').forEach(menu => {
                    menu.style.display = 'none';
                });
            }

            // Close tooltips
            if (!event.target.closest('[data-tooltip]')) {
                document.querySelectorAll('.tooltip.show').forEach(tooltip => {
                    tooltip.classList.remove('show');
                });
            }

        } catch (error) {
            this.handleError('Global Click Error', error);
        }
    }

    /**
     * Handle window resize events with debouncing
     */
    handleWindowResize() {
        try {
            const dimensions = {
                width: window.innerWidth,
                height: window.innerHeight,
                timestamp: new Date()
            };

            this.updateEventState('windowResize', dimensions);
            
            // Update modal positions and sizes
            document.querySelectorAll('.modal-content').forEach(content => {
                this.adjustModalSize(content);
            });

            // Update dropdown positions
            document.querySelectorAll('.w3-dropdown-content.show').forEach(dropdown => {
                this.adjustDropdownPosition(dropdown);
            });

            // Update tree view if necessary
            const treeContainer = document.querySelector('.tree-container');
            if (treeContainer) {
                this.adjustTreeContainer(treeContainer);
            }

        } catch (error) {
            this.handleError('Window Resize Error', error);
        }
    }

    /**
     * Handle modal closing
     * @private
     * @param {string} modalId - ID of modal to close
     */
    handleModalClose(modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            // Add closing animation
            modal.classList.add('w3-animate-opacity');
            modal.style.opacity = '0';

            // Clean up after animation
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.opacity = '1';
                modal.classList.remove('w3-animate-opacity');

                // Reset form if present
                const form = modal.querySelector('form');
                if (form) {
                    form.reset();
                }

                // Clear file inputs
                modal.querySelectorAll('input[type="file"]').forEach(input => {
                    input.value = '';
                });

                this.updateEventState('modalClosed', { modalId });
            }, 300);

        } catch (error) {
            this.handleError('Modal Close Error', error);
        }
    }

    /**
     * Adjust modal size based on window size
     * @private
     * @param {HTMLElement} modalContent - Modal content element
     */
    adjustModalSize(modalContent) {
        try {
            const maxHeight = window.innerHeight * 0.9;
            const maxWidth = window.innerWidth * 0.9;
            const minHeight = 300;
            const minWidth = 400;
            
            // Calculate dimensions
            const height = Math.max(minHeight, Math.min(maxHeight, modalContent.scrollHeight));
            const width = Math.max(minWidth, Math.min(maxWidth, modalContent.scrollWidth));
            
            // Apply dimensions with smooth transition
            modalContent.style.transition = 'all 0.3s ease';
            modalContent.style.maxHeight = `${height}px`;
            modalContent.style.maxWidth = `${width}px`;
            
            // Center the modal
            modalContent.style.top = '50%';
            modalContent.style.left = '50%';
            modalContent.style.transform = 'translate(-50%, -50%)';

        } catch (error) {
            this.handleError('Modal Size Adjustment Error', error);
        }
    }

    /**
     * Adjust dropdown menu position
     * @private
     * @param {HTMLElement} dropdown - Dropdown element
     */
    adjustDropdownPosition(dropdown) {
        try {
            const rect = dropdown.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const spaceRight = window.innerWidth - rect.right;
            const spaceLeft = rect.left;

            // Adjust vertical position
            if (spaceBelow < 100 && spaceAbove > spaceBelow) {
                dropdown.style.top = 'auto';
                dropdown.style.bottom = '100%';
            } else {
                dropdown.style.top = '100%';
                dropdown.style.bottom = 'auto';
            }

            // Adjust horizontal position
            if (spaceRight < 100 && spaceLeft > spaceRight) {
                dropdown.style.right = '0';
                dropdown.style.left = 'auto';
            } else {
                dropdown.style.left = '0';
                dropdown.style.right = 'auto';
            }

        } catch (error) {
            this.handleError('Dropdown Position Adjustment Error', error);
        }
    }

    /**
     * Adjust tree container layout
     * @private
     * @param {HTMLElement} container - Tree container element
     */
    adjustTreeContainer(container) {
        try {
            const windowHeight = window.innerHeight;
            const headerHeight = document.querySelector('header')?.offsetHeight || 0;
            const footerHeight = document.querySelector('footer')?.offsetHeight || 0;
            
            // Calculate and set maximum height
            const maxHeight = windowHeight - headerHeight - footerHeight - 40; // 40px padding
            container.style.maxHeight = `${maxHeight}px`;
            container.style.overflowY = 'auto';

        } catch (error) {
            this.handleError('Tree Container Adjustment Error', error);
        }
    }

    /**
     * Clean up event listeners and resources
     */
    destroy() {
        if (!this.initialized) return;

        try {
            // Remove document level listeners
            document.removeEventListener('click', this.handleTreeClick);
            document.removeEventListener('submit', this.handleFormSubmit);
            document.removeEventListener('click', this.handleGlobalClick);
            document.removeEventListener('keydown', this.handleKeyboardShortcuts);

            // Remove window level listeners
            window.removeEventListener('resize', this.handleWindowResize);

            // Clean up file input listeners
            document.querySelectorAll('input[type="file"]').forEach(input => {
                input.removeEventListener('change', this.handleFileInput);
            });

            // Clean up drop zones
            document.querySelectorAll('.drop-zone').forEach(zone => {
                const locationId = zone.dataset.locationId;
                if (locationId) {
                    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                        zone.removeEventListener(eventName, this.handleDropZone);
                    });
                }
            });

            // Clear state
            State.remove(EVENTS_STATE_KEY);

            // Clear debounce timers
            this.debounceTimers.forEach(timer => clearTimeout(timer));
            this.debounceTimers.clear();

            // Reset instance variables
            this.handlers.clear();
            this.initialized = false;

            this.updateEventState('destroyed');
        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }
}

// Export singleton instance
export const Events = new EventManager();