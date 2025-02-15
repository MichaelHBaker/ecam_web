// modals.js
// Modal management and interaction utilities

/**
 * Map to store modal instance data
 * @type {Map<string, Object>}
 */
const modalInstances = new Map();

/**
 * Shows a modal and sets up event handlers
 * @param {string} locationId - Location identifier
 * @returns {void}
 */
export const showModal = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    // Generate and store instance ID
    const instanceId = `modal-${locationId}-${Date.now()}`;
    modal.dataset.instanceId = instanceId;

    // Set up resize observer for content adjustments
    setupResizeObserver(modal);
    
    // Set up event handlers
    setupKeyboardHandlers(modal, locationId);
    setupOutsideClickHandler(modal, locationId);

    // Show modal
    modal.style.display = 'block';

    // Store instance data
    modalInstances.set(instanceId, {
        locationId,
        observers: [],
        handlers: []
    });
};

/**
 * Hides a modal and cleans up resources
 * @param {string} locationId - Location identifier
 * @returns {void}
 */
export const hideModal = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    const instanceId = modal.dataset.instanceId;
    if (instanceId) {
        // Clean up stored instance data
        cleanupModalInstance(instanceId);
        delete modal.dataset.instanceId;
    }

    // Reset form elements
    resetModalForm(locationId);

    // Hide modal
    modal.style.display = 'none';
};

/**
 * Sets up the resize observer for a modal
 * @param {HTMLElement} modal - Modal element
 * @returns {void}
 */
const setupResizeObserver = (modal) => {
    const modalContent = modal.querySelector('.w3-modal-content');
    if (!modalContent) return;

    const resizeObserver = new ResizeObserver(entries => {
        // Refresh any dynamic content when modal is resized
        const editor = modalContent.querySelector('.CodeMirror');
        if (editor && editor.refresh) {
            editor.refresh();
        }
    });
    
    resizeObserver.observe(modalContent);

    // Store observer reference for cleanup
    const instanceId = modal.dataset.instanceId;
    if (instanceId) {
        const instance = modalInstances.get(instanceId);
        if (instance) {
            instance.observers.push(resizeObserver);
        }
    }
};

/**
 * Sets up keyboard event handlers for a modal
 * @param {HTMLElement} modal - Modal element
 * @param {string} locationId - Location identifier
 * @returns {void}
 */
const setupKeyboardHandlers = (modal, locationId) => {
    const handleEscape = (event) => {
        if (event.key === 'Escape') {
            hideModal(locationId);
        }
    };

    document.addEventListener('keydown', handleEscape);

    // Store handler reference for cleanup
    const instanceId = modal.dataset.instanceId;
    if (instanceId) {
        const instance = modalInstances.get(instanceId);
        if (instance) {
            instance.handlers.push({
                type: 'keydown',
                handler: handleEscape
            });
        }
    }
};

/**
 * Sets up click outside handler for a modal
 * @param {HTMLElement} modal - Modal element
 * @param {string} locationId - Location identifier
 * @returns {void}
 */
const setupOutsideClickHandler = (modal, locationId) => {
    const handleOutsideClick = (event) => {
        if (event.target === modal) {
            hideModal(locationId);
        }
    };

    modal.addEventListener('click', handleOutsideClick);

    // Store handler reference for cleanup
    const instanceId = modal.dataset.instanceId;
    if (instanceId) {
        const instance = modalInstances.get(instanceId);
        if (instance) {
            instance.handlers.push({
                type: 'click',
                element: modal,
                handler: handleOutsideClick
            });
        }
    }
};

/**
 * Cleans up modal instance resources
 * @param {string} instanceId - Modal instance identifier
 * @returns {void}
 */
const cleanupModalInstance = (instanceId) => {
    const instance = modalInstances.get(instanceId);
    if (!instance) return;

    // Disconnect observers
    instance.observers.forEach(observer => {
        observer.disconnect();
    });

    // Remove event listeners
    instance.handlers.forEach(({ type, element, handler }) => {
        if (element) {
            element.removeEventListener(type, handler);
        } else {
            document.removeEventListener(type, handler);
        }
    });

    modalInstances.delete(instanceId);
};

/**
 * Resets modal form elements
 * @param {string} locationId - Location identifier
 * @returns {void}
 */
const resetModalForm = (locationId) => {
    // Reset file input
    const fileInput = document.getElementById(`id_file_input-${locationId}`);
    if (fileInput) {
        fileInput.value = '';
    }

    // Reset dataset ID input
    const datasetIdInput = document.getElementById(`id_dataset_id-${locationId}`);
    if (datasetIdInput) {
        datasetIdInput.value = '';
    }

    // Reset import ID input
    const importIdInput = document.getElementById(`id_import_id-${locationId}`);
    if (importIdInput) {
        importIdInput.value = '';
    }

    // Reset file display
    const fileDisplay = document.getElementById(`id_file_display-${locationId}`);
    if (fileDisplay) {
        fileDisplay.innerHTML = '<i class="bi bi-file-earmark"></i> No file selected';
        fileDisplay.className = 'w3-panel w3-pale-blue w3-leftbar w3-border-blue file-display';
    }

    // Hide and clear CodeMirror container
    const cmContainer = document.getElementById(`id_codemirror_container-${locationId}`);
    if (cmContainer) {
        cmContainer.style.display = 'none';
        const notice = cmContainer.querySelector('.w3-panel');
        if (notice) {
            notice.remove();
        }
    }

    // Disable next button
    const nextButton = document.querySelector(`button[onclick*="processFile('${locationId}')"]`);
    if (nextButton) {
        nextButton.disabled = true;
    }
};

/**
 * Updates modal content dynamically
 * @param {string} locationId - Location identifier
 * @param {Object} updates - Content updates to apply
 * @returns {void}
 */
export const updateModalContent = (locationId, updates) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    Object.entries(updates).forEach(([selector, content]) => {
        const element = modal.querySelector(selector);
        if (element) {
            if (typeof content === 'string') {
                element.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                element.innerHTML = '';
                element.appendChild(content);
            }
        }
    });
};

/**
 * Checks if a modal is currently displayed
 * @param {string} locationId - Location identifier
 * @returns {boolean} True if modal is visible
 */
export const isModalVisible = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    return modal?.style.display === 'block';
};

/**
 * Gets the current modal instance data
 * @param {string} locationId - Location identifier
 * @returns {Object|null} Modal instance data or null if not found
 */
export const getModalInstance = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal?.dataset.instanceId) return null;
    
    return modalInstances.get(modal.dataset.instanceId) || null;
};