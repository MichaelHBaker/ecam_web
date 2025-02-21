// modals.js
// Enhanced modal management and interaction utilities

import { State } from './state.js';
import { NotificationUI } from './ui.js';
import { DOM } from './dom.js';

const MODALS_STATE_KEY = 'modals_state';

/**
 * Map to store modal instance data
 * @type {Map<string, Object>}
 */
const modalInstances = new Map();

/**
 * Modal Manager Class
 */
class ModalManager {
    constructor() {
        this.activeModals = new Set();
        this.observers = new Map();
        this.handlers = new Map();
        this.zIndexBase = 1000;
        
        // Initialize modal state
        State.set(MODALS_STATE_KEY, {
            activeModals: [],
            lastAction: null,
            error: null
        });

        // Bind methods
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleOutsideClick = this.handleOutsideClick.bind(this);
        this.handleResize = this.debounce(this.handleResize.bind(this), 250);

        // Set up global event listeners
        this.initializeGlobalListeners();
    }

    /**
     * Creates a new modal element
     * @private
     * @param {string} modalId - Modal identifier
     * @param {Object} config - Modal configuration
     * @returns {HTMLElement} Created modal element
     */
    createModalElement(modalId, config) {
        const modalElement = DOM.createElement('div', {
            attributes: {
                id: `id_modal-${modalId}`,
                class: 'w3-modal',
                'data-modal-type': config.type || 'default'
            }
        });

        const content = config.content || '';
        modalElement.innerHTML = `
            <div class="w3-modal-content w3-card-4 w3-animate-top">
                ${config.showCloseButton ? `
                    <div class="w3-bar w3-light-grey">
                        <span class="w3-bar-item">${config.title || ''}</span>
                        <button class="w3-bar-item w3-button w3-right modal-close">×</button>
                    </div>
                ` : ''}
                <div class="modal-body w3-container">
                    ${content}
                </div>
            </div>
        `;

        return modalElement;
    }

    /**
     * Initialize global event listeners
     * @private
     */
    initializeGlobalListeners() {
        document.addEventListener('keydown', this.handleKeyPress);
        window.addEventListener('resize', this.handleResize);
    }

    /**
         * Shows a modal with enhanced functionality
         * @param {string} modalId - Modal identifier
         * @param {Object} options - Modal options
         * @returns {Promise<string>} Instance ID
         */
    async show(modalId, options = {}) {
        try {
            let modal = document.getElementById(`id_modal-${modalId}`);
            
            // Create modal if it doesn't exist
            if (!modal) {
                modal = this.createModalElement(modalId, options);
                document.body.appendChild(modal);
            }
    
            // Generate instance ID
            const instanceId = `modal-${modalId}-${Date.now()}`;
            modal.dataset.instanceId = instanceId;
    
            // Apply options
            const config = {
                closeOnEscape: true,
                closeOnOutsideClick: true,
                showCloseButton: true,
                animate: true,
                draggable: false,
                resizable: false,
                position: 'center',
                width: 'auto',
                height: 'auto',
                ...options
            };
    
            // Store instance data
            modalInstances.set(instanceId, {
                id: modalId,
                config,
                observers: new Set(),
                handlers: new Set(),
                state: {
                    isVisible: false,
                    isDragging: false,
                    position: { x: 0, y: 0 },
                    size: { width: 0, height: 0 }
                }
            });
    
            // Set up modal
            await this.setupModal(modal, instanceId);
    
            // Show modal with position handling
            if (typeof config.position === 'object' && config.position.x !== undefined && config.position.y !== undefined) {
                // Handle dropdown-style positioning
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                const modalContent = modal.querySelector('.w3-modal-content');
                
                // Show to measure
                modal.style.display = 'block';
                modalContent.style.opacity = '0';
                
                const modalRect = modalContent.getBoundingClientRect();
                const modalHeight = modalRect.height;
                const modalWidth = modalRect.width;
                
                // Calculate position
                let { x, y } = config.position;
                
                // Adjust for viewport
                if (y + modalHeight > viewportHeight) {
                    y = Math.max(0, y - modalHeight);
                }
                if (x + modalWidth > viewportWidth) {
                    x = Math.max(0, x - modalWidth);
                }
                
                // Update position
                modalContent.style.position = 'fixed';
                modalContent.style.top = `${y}px`;
                modalContent.style.left = `${x}px`;
                modalContent.style.transform = 'none';
                modalContent.style.opacity = '';
            }
    
            // Show modal
            await this.animateModal(modal, 'show');
    
            // Update state
            this.activeModals.add(instanceId);
            this.updateModalState(instanceId, 'shown');
    
            return instanceId;
    
        } catch (error) {
            this.handleError('Show Modal Error', error);
            throw error;
        }
    }
        
    /**
     * Hides a modal with cleanup
     * @param {string} modalId - Modal identifier
     * @param {Object} options - Hide options
     * @returns {Promise<void>}
     */
    async hide(modalId, options = {}) {
        try {
            const modal = document.getElementById(`id_modal-${modalId}`);
            if (!modal) return;
    
            const instanceId = modal.dataset.instanceId;
            if (!instanceId) return;
    
            const instance = modalInstances.get(instanceId);
            if (!instance) return;
    
            // Animate out
            await this.animateModal(modal, 'hide');
    
            // Clean up
            this.cleanupModalInstance(instanceId);
    
            // Remove from DOM if dynamically created
            if (instance.config.dynamic) {
                modal.remove();
            } else {
                // Reset modal state
                modal.style.display = 'none';
                modal.style.backgroundColor = '';
                const content = modal.querySelector('.w3-modal-content');
                if (content) {
                    content.style = '';
                }
            }
    
            // Update state
            this.activeModals.delete(instanceId);
            this.updateModalState(instanceId, 'hidden');
    
            // Clean up instance data
            delete modal.dataset.instanceId;
            modalInstances.delete(instanceId);
    
            // Check if this was the last modal
            if (this.activeModals.size === 0) {
                document.body.style.overflow = '';
                document.body.style.pointerEvents = '';
            }
    
        } catch (error) {
            this.handleError('Hide Modal Error', error);
        }
    }

    /**
     * Sets up modal structure and events
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} instanceId - Instance identifier
     */
    async setupModal(modal, instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        try {
            // Set up modal structure
            this.setupModalStructure(modal, instance.config);

            // Set up observers
            this.setupResizeObserver(modal, instanceId);

            // Set up event handlers
            this.setupModalEventHandlers(modal, instanceId);

            // Position modal
            this.positionModal(modal, instance.config.position);

            // Set initial size
            this.setModalSize(modal, instance.config);

            // Set up draggable if enabled
            if (instance.config.draggable) {
                this.setupDraggable(modal, instanceId);
            }

            // Set up resizable if enabled
            if (instance.config.resizable) {
                this.setupResizable(modal, instanceId);
            }

            // Update z-index
            this.updateModalZIndex(modal);

        } catch (error) {
            this.handleError('Modal Setup Error', error);
            throw error;
        }
    }

    /**
     * Sets up modal DOM structure
     * @private
     */
    setupModalStructure(modal, config) {
        // Ensure modal has required structure
        if (!modal.querySelector('.w3-modal-content')) {
            const content = modal.innerHTML;
            modal.innerHTML = `
                <div class="w3-modal-content w3-card-4 w3-animate-top">
                    ${config.showCloseButton ? `
                        <div class="w3-bar w3-light-grey">
                            <span class="w3-bar-item">${config.title || ''}</span>
                            <button class="w3-bar-item w3-button w3-right modal-close">×</button>
                        </div>
                    ` : ''}
                    <div class="modal-body w3-container">
                        ${content}
                    </div>
                </div>
            `;
        }

        // Add necessary classes
        modal.classList.add('w3-modal');
        
        // Add data attributes
        modal.dataset.modalType = config.type || 'default';
        if (config.draggable) modal.dataset.draggable = 'true';
        if (config.resizable) modal.dataset.resizable = 'true';
    }

    /**
     * Handles modal animation
     * @private
     */
    async animateModal(modal, action) {
        return new Promise((resolve) => {
            if (!modal) {
                resolve();
                return;
            }
    
            const content = modal.querySelector('.w3-modal-content');
            if (!content) {
                resolve();
                return;
            }
    
            const handleTransitionEnd = () => {
                content.removeEventListener('transitionend', handleTransitionEnd);
                resolve();
            };
    
            content.addEventListener('transitionend', handleTransitionEnd);
    
            if (action === 'show') {
                modal.style.display = 'block';
                modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
                
                // Set pointer-events only on the modal
                document.body.style.pointerEvents = 'none';
                modal.style.pointerEvents = 'auto';
                content.style.pointerEvents = 'auto';
                
                requestAnimationFrame(() => {
                    content.classList.add('w3-show');
                    content.classList.remove('w3-hide');
                    content.style.opacity = '1';
                });
            } else {
                content.classList.remove('w3-show');
                content.classList.add('w3-hide');
                content.style.opacity = '0';
                
                modal.style.backgroundColor = 'transparent';
                
                // Restore pointer-events when all modals are closed
                if (this.activeModals.size <= 1) {
                    document.body.style.pointerEvents = '';
                }
                
                setTimeout(() => {
                    modal.style.display = 'none';
                    resolve();
                }, 300);
            }
        });
    }
    
    /**
     * Updates modal state
     * @private
     */
    updateModalState(instanceId, action, data = {}) {
        const currentState = State.get(MODALS_STATE_KEY);
        
        State.update(MODALS_STATE_KEY, {
            activeModals: Array.from(this.activeModals),
            lastAction: {
                instanceId,
                action,
                timestamp: new Date(),
                data
            }
        });
    }

    /**
     * Creates a debounced function
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
     * Handles errors in modal operations
     * @private
     */
    handleError(context, error) {
        console.error(`${context}:`, error);
        
        NotificationUI.show({
            message: `${context}: ${error.message}`,
            type: 'error'
        });

        State.update(MODALS_STATE_KEY, {
            error: {
                context,
                message: error.message,
                timestamp: new Date()
            }
        });
    }

// modals.js - Part 2
// Event handling, positioning, and size management

    /**
     * Sets up modal event handlers
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} instanceId - Instance identifier
     */
    setupModalEventHandlers(modal, instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        // Close button handler
        const closeButton = modal.querySelector('.modal-close');
        if (closeButton && instance.config.showCloseButton) {
            const closeHandler = (e) => {
                e.preventDefault();
                this.hide(instance.id);
            };
            closeButton.addEventListener('click', closeHandler);
            instance.handlers.add({ element: closeButton, type: 'click', handler: closeHandler });
        }

        // Outside click handler
        if (instance.config.closeOnOutsideClick) {
            const outsideClickHandler = (e) => {
                if (e.target === modal) {
                    this.hide(instance.id);
                }
            };
            modal.addEventListener('click', outsideClickHandler);
            instance.handlers.add({ element: modal, type: 'click', handler: outsideClickHandler });
        }

        // Form handlers
        const form = modal.querySelector('form');
        if (form) {
            const formSubmitHandler = async (e) => {
                e.preventDefault();
                if (instance.config.onSubmit) {
                    try {
                        await instance.config.onSubmit(e);
                        this.hide(instance.id);
                    } catch (error) {
                        this.handleError('Form Submit Error', error);
                    }
                }
            };
            form.addEventListener('submit', formSubmitHandler);
            instance.handlers.add({ element: form, type: 'submit', handler: formSubmitHandler });
        }

        // Focus trap
        this.setupFocusTrap(modal, instanceId);
    }

    /**
     * Sets up resize observer for modal content
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} instanceId - Instance identifier
     */
    setupResizeObserver(modal, instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        const content = modal.querySelector('.w3-modal-content');
        if (!content) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                instance.state.size = { width, height };
                this.updateModalState(instanceId, 'resized', { width, height });
            }
        });

        resizeObserver.observe(content);
        instance.observers.add(resizeObserver);
    }

    /**
     * Sets up focus trap for modal
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} instanceId - Instance identifier
     */
    setupFocusTrap(modal, instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        const trapFocusHandler = (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        };

        modal.addEventListener('keydown', trapFocusHandler);
        instance.handlers.add({ element: modal, type: 'keydown', handler: trapFocusHandler });

        // Focus first element when modal opens
        setTimeout(() => firstFocusable.focus(), 100);
    }

    /**
     * Positions modal on screen
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} position - Position preference
     */
    positionModal(modal, position = 'center') {
        const content = modal.querySelector('.w3-modal-content');
        if (!content) return;

        content.style.transition = 'all 0.3s ease-in-out';

        switch (position) {
            case 'center':
                content.style.top = '50%';
                content.style.left = '50%';
                content.style.transform = 'translate(-50%, -50%)';
                break;
            case 'top':
                content.style.top = '20px';
                content.style.left = '50%';
                content.style.transform = 'translateX(-50%)';
                break;
            case 'bottom':
                content.style.bottom = '20px';
                content.style.left = '50%';
                content.style.transform = 'translateX(-50%)';
                break;
            default:
                if (typeof position === 'object' && position.x !== undefined && position.y !== undefined) {
                    content.style.top = `${position.y}px`;
                    content.style.left = `${position.x}px`;
                    content.style.transform = 'none';
                }
        }
    }

    /**
     * Sets modal size
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {Object} config - Size configuration
     */
    setModalSize(modal, config) {
        const content = modal.querySelector('.w3-modal-content');
        if (!content) return;

        const { width, height, minWidth, minHeight, maxWidth, maxHeight } = config;

        if (width !== 'auto') content.style.width = typeof width === 'number' ? `${width}px` : width;
        if (height !== 'auto') content.style.height = typeof height === 'number' ? `${height}px` : height;
        
        if (minWidth) content.style.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;
        if (minHeight) content.style.minHeight = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
        
        if (maxWidth) content.style.maxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
        if (maxHeight) content.style.maxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
    }

    /**
     * Updates modal z-index based on stack order
     * @private
     * @param {HTMLElement} modal - Modal element
     */
    updateModalZIndex(modal) {
        const modalArray = Array.from(this.activeModals.values());
        const index = modalArray.indexOf(modal.dataset.instanceId);
        
        if (index !== -1) {
            modal.style.zIndex = this.zIndexBase + (index * 10);
        }
    }

    /**
     * Handles key press events
     * @private
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyPress(event) {
        if (event.key === 'Escape') {
            const modalArray = Array.from(this.activeModals).reverse();
            for (const instanceId of modalArray) {
                const instance = modalInstances.get(instanceId);
                if (instance && instance.config.closeOnEscape) {
                    this.hide(instance.id);
                    break;
                }
            }
        }
    }

    /**
     * Handles outside click events
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    handleOutsideClick(event) {
        const modalArray = Array.from(this.activeModals).reverse();
        for (const instanceId of modalArray) {
            const instance = modalInstances.get(instanceId);
            if (instance && instance.config.closeOnOutsideClick) {
                const modal = document.getElementById(`id_modal-${instance.id}`);
                if (modal && event.target === modal) {
                    this.hide(instance.id);
                    break;
                }
            }
        }
    }

    /**
     * Handles window resize events
     * @private
     */
    handleResize() {
        this.activeModals.forEach(instanceId => {
            const instance = modalInstances.get(instanceId);
            if (instance) {
                const modal = document.getElementById(`id_modal-${instance.id}`);
                if (modal) {
                    this.positionModal(modal, instance.config.position);
                    this.setModalSize(modal, instance.config);
                }
            }
        });
    }
// modals.js - Part 3
// Draggable, resizable functionality and cleanup

    /**
     * Sets up draggable functionality
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} instanceId - Instance identifier
     */
    setupDraggable(modal, instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        const content = modal.querySelector('.w3-modal-content');
        if (!content) return;

        // Add drag handle
        const header = content.querySelector('.w3-bar') || content.firstElementChild;
        if (header) {
            header.style.cursor = 'move';
            header.classList.add('modal-drag-handle');
        }

        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;

        const dragStart = (e) => {
            if (e.target.closest('.modal-close')) return;
            
            const touch = e.type === 'touchstart' ? e.touches[0] : e;
            initialX = touch.clientX - instance.state.position.x;
            initialY = touch.clientY - instance.state.position.y;

            if (e.target === header || e.target.closest('.modal-drag-handle')) {
                isDragging = true;
                header.classList.add('dragging');
            }
        };

        const dragEnd = () => {
            isDragging = false;
            header.classList.remove('dragging');
            
            // Update state
            this.updateModalState(instanceId, 'dragend', {
                position: instance.state.position
            });
        };

        const drag = (e) => {
            if (!isDragging) return;

            e.preventDefault();
            const touch = e.type === 'touchmove' ? e.touches[0] : e;

            currentX = touch.clientX - initialX;
            currentY = touch.clientY - initialY;

            // Boundary checking
            const modalRect = content.getBoundingClientRect();
            const parentRect = modal.getBoundingClientRect();

            currentX = Math.max(0, Math.min(currentX, parentRect.width - modalRect.width));
            currentY = Math.max(0, Math.min(currentY, parentRect.height - modalRect.height));

            // Update position
            instance.state.position = { x: currentX, y: currentY };
            content.style.transform = `translate(${currentX}px, ${currentY}px)`;

            // Update state
            this.updateModalState(instanceId, 'dragging', {
                position: instance.state.position
            });
        };

        // Add event listeners
        header.addEventListener('mousedown', dragStart);
        header.addEventListener('touchstart', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);

        // Store handlers for cleanup
        instance.handlers.add(
            { element: header, type: 'mousedown', handler: dragStart },
            { element: header, type: 'touchstart', handler: dragStart },
            { element: document, type: 'mousemove', handler: drag },
            { element: document, type: 'touchmove', handler: drag },
            { element: document, type: 'mouseup', handler: dragEnd },
            { element: document, type: 'touchend', handler: dragEnd }
        );
    }

    /**
     * Sets up resizable functionality
     * @private
     * @param {HTMLElement} modal - Modal element
     * @param {string} instanceId - Instance identifier
     */
    setupResizable(modal, instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        const content = modal.querySelector('.w3-modal-content');
        if (!content) return;

        // Add resize handles
        const handles = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${dir}`;
            handle.style.position = 'absolute';
            handle.style.width = handle.style.height = '10px';
            handle.style.background = 'transparent';
            handle.style.cursor = `${dir}-resize`;
            content.appendChild(handle);
            return handle;
        });

        let isResizing = false;
        let currentHandle = null;
        let startX, startY, startWidth, startHeight;

        const resizeStart = (e, handle) => {
            if (e.button !== 0) return; // Left click only

            isResizing = true;
            currentHandle = handle;
            startX = e.clientX;
            startY = e.clientY;

            const rect = content.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            document.body.style.cursor = window.getComputedStyle(handle).cursor;
            content.classList.add('resizing');
        };

        const resizeEnd = () => {
            isResizing = false;
            currentHandle = null;
            document.body.style.cursor = '';
            content.classList.remove('resizing');

            // Update state
            this.updateModalState(instanceId, 'resizeend', {
                size: instance.state.size
            });
        };

        const resize = (e) => {
            if (!isResizing) return;

            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const direction = currentHandle.className.split('resize-')[1];

            let newWidth = startWidth;
            let newHeight = startHeight;

            // Calculate new size based on direction
            switch (direction) {
                case 'e':
                case 'ne':
                case 'se':
                    newWidth = startWidth + dx;
                    break;
                case 'w':
                case 'nw':
                case 'sw':
                    newWidth = startWidth - dx;
                    content.style.left = `${e.clientX}px`;
                    break;
            }

            switch (direction) {
                case 'n':
                case 'ne':
                case 'nw':
                    newHeight = startHeight - dy;
                    content.style.top = `${e.clientY}px`;
                    break;
                case 's':
                case 'se':
                case 'sw':
                    newHeight = startHeight + dy;
                    break;
            }

            // Apply minimum and maximum sizes
            const { minWidth, minHeight, maxWidth, maxHeight } = instance.config;
            newWidth = Math.max(minWidth || 200, Math.min(maxWidth || 800, newWidth));
            newHeight = Math.max(minHeight || 100, Math.min(maxHeight || 600, newHeight));

            // Update size
            content.style.width = `${newWidth}px`;
            content.style.height = `${newHeight}px`;

            // Update state
            instance.state.size = { width: newWidth, height: newHeight };
            this.updateModalState(instanceId, 'resizing', {
                size: instance.state.size
            });
        };

        // Add event listeners to handles
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => resizeStart(e, handle));
        });

        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', resizeEnd);

        // Store handlers for cleanup
        instance.handlers.add(
            { element: document, type: 'mousemove', handler: resize },
            { element: document, type: 'mouseup', handler: resizeEnd }
        );

        handles.forEach(handle => {
            instance.handlers.add({
                element: handle,
                type: 'mousedown',
                handler: (e) => resizeStart(e, handle)
            });
        });
    }

    /**
     * Cleans up modal instance resources
     * @private
     * @param {string} instanceId - Instance identifier
     */
    cleanupModalInstance(instanceId) {
        const instance = modalInstances.get(instanceId);
        if (!instance) return;

        try {
            // Disconnect observers
            instance.observers.forEach(observer => {
                if (observer instanceof ResizeObserver) {
                    observer.disconnect();
                }
            });
            instance.observers.clear();

            // Remove event listeners
            instance.handlers.forEach(({ element, type, handler }) => {
                element.removeEventListener(type, handler);
            });
            instance.handlers.clear();

            // Reset modal state
            const modal = document.getElementById(`id_modal-${instance.id}`);
            if (modal) {
                const content = modal.querySelector('.w3-modal-content');
                if (content) {
                    content.style = '';
                    content.classList.remove('dragging', 'resizing');
                    
                    // Remove resize handles
                    content.querySelectorAll('.resize-handle').forEach(handle => {
                        handle.remove();
                    });
                }

                // Reset modal styles
                modal.style = '';
                modal.classList.remove('w3-show');
            }

        } catch (error) {
            this.handleError('Cleanup Error', error);
        }
    }

    /**
     * Destroys the modal manager and cleans up resources
     */
    destroy() {
        try {
            // Clean up all modal instances
            modalInstances.forEach((instance, instanceId) => {
                this.cleanupModalInstance(instanceId);
            });

            // Remove global event listeners
            document.removeEventListener('keydown', this.handleKeyPress);
            window.removeEventListener('resize', this.handleResize);

            // Clear collections
            modalInstances.clear();
            this.activeModals.clear();
            this.observers.clear();
            this.handlers.clear();

            // Reset state
            State.remove(MODALS_STATE_KEY);

        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }
}

// Export singleton instance
export const Modal = new ModalManager();