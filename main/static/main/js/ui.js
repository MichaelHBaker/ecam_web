// ui.js
// Enhanced UI management with proper initialization and safety checks

import { State } from './state.js';
import { DOM } from './dom.js';

const UI_STATE_KEY = 'ui_state';

/**
 * Base UI Manager class with initialization checks
 */
class BaseUIManager {
    constructor() {
        this.initialized = false;
    }

    /**
     * Check if manager is initialized
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
            throw new Error('UI Manager must be initialized before use');
        }
    }

    /**
     * Handle errors consistently
     * @protected
     */
    _handleError(context, error) {
        console.error(`UI Error (${context}):`, error);
        
        // Update error state
        State.update(UI_STATE_KEY, {
            error: {
                context,
                message: error.message,
                timestamp: new Date()
            }
        });

        // Avoid circular notifications
        if (this.constructor.name !== 'NotificationManager') {
            NotificationUI.show({
                message: `UI Error: ${error.message}`,
                type: 'error'
            });
        }
    }
}

/**
 * Enhanced Notification Manager with initialization safety
 */
class NotificationManager extends BaseUIManager {
    constructor() {
        super();
        this.container = null;
        this.queue = [];
        this.activeNotifications = new Map();
        this.maxNotifications = 3;
    }

    /**
     * Initialize notification system with dependency checks
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            console.warn('NotificationManager already initialized');
            return;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before NotificationManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before NotificationManager');
            }

            // Create container
            this.container = DOM.createElement('div', {
                className: 'notification-container w3-display-topright',
                attributes: {
                    style: `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 9999;
                        max-width: 400px;
                        pointer-events: none;
                    `
                }
            });

            // Add click handler
            this.container.addEventListener('click', this.handleClick.bind(this));
            document.body.appendChild(this.container);

            // Initialize state
            State.update(UI_STATE_KEY, {
                notifications: {
                    active: [],
                    queue: [],
                    lastUpdate: new Date()
                }
            });

            this.initialized = true;
            console.log('NotificationManager initialized');

        } catch (error) {
            this._handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Show a notification with safety checks
     * @param {Object} config - Notification configuration
     */
    show(config) {
        try {
            this._checkInitialized();

            const notification = {
                id: `notification-${Date.now()}`,
                message: config.message || '',
                type: config.type || 'info',
                duration: config.duration || 3000,
                closeable: config.closeable !== false,
                actions: config.actions || [],
                timestamp: new Date(),
                ...config
            };

            // Queue or show notification
            if (this.activeNotifications.size >= this.maxNotifications) {
                this.queue.push(notification);
                this._updateState();
            } else {
                this._showNotification(notification);
            }

        } catch (error) {
            this._handleError('Show Notification Error', error);
        }
    }

    /**
     * Show an API error notification
     * @param {Error} error - API error
     */
    showAPIError(error) {
        try {
            this._checkInitialized();

            let message = error.message;
            let details = null;

            // Handle validation errors
            if (error.type === 'validation_error' && error.data) {
                details = Object.entries(error.data)
                    .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
                    .join('\n');
            }

            this.show({
                message,
                details,
                type: 'error',
                duration: 5000,
                closeable: true,
                actions: error.retryable ? [{
                    label: 'Retry',
                    action: error.retry
                }] : []
            });

        } catch (error) {
            this._handleError('Show API Error', error);
        }
    }

    /**
     * Show a form error notification
     * @param {string} formId - Form identifier
     * @param {Object} errors - Form errors
     */
    showFormError(formId, errors) {
        try {
            this._checkInitialized();

            const message = 'Form validation failed';
            const details = Object.entries(errors)
                .map(([field, error]) => `${field}: ${error}`)
                .join('\n');

            this.show({
                message,
                details,
                type: 'error',
                duration: 5000,
                closeable: true,
                actions: [{
                    label: 'Go to Form',
                    action: () => {
                        const form = document.getElementById(formId);
                        if (form) {
                            form.scrollIntoView({ behavior: 'smooth' });
                        }
                    }
                }]
            });

        } catch (error) {
            this._handleError('Show Form Error', error);
        }
    }

    /**
     * Create and show notification element
     * @private
     */
    _showNotification(notification) {
        try {
            // Create notification element
            const element = this._createNotificationElement(notification);
            this.container.appendChild(element);
            this.activeNotifications.set(notification.id, notification);

            // Trigger entrance animation
            requestAnimationFrame(() => {
                element.style.transform = 'translateX(0)';
                element.style.opacity = '1';
            });

            // Set up auto-removal
            if (notification.duration > 0) {
                const timer = setTimeout(() => {
                    this.remove(notification.id);
                }, notification.duration);

                // Store timer for cleanup
                notification.timer = timer;
            }

            this._updateState();

        } catch (error) {
            this._handleError('Show Notification Error', error);
        }
    }

    /**
     * Create notification element with error handling
     * @private
     */
    _createNotificationElement(notification) {
        try {
            const element = DOM.createElement('div', {
                id: notification.id,
                className: `notification ${this._getTypeClass(notification.type)}`,
                attributes: {
                    style: `
                        transition: all 0.3s ease-in-out;
                        transform: translateX(100%);
                        opacity: 0;
                        margin: 8px;
                        position: relative;
                        overflow: hidden;
                        pointer-events: auto;
                        min-width: 280px;
                    `
                }
            });

            // Add progress bar for timed notifications
            if (notification.duration > 0) {
                const progress = DOM.createElement('div', {
                    className: 'notification-progress',
                    attributes: {
                        style: `
                            position: absolute;
                            bottom: 0;
                            left: 0;
                            height: 3px;
                            background: rgba(255, 255, 255, 0.5);
                            width: 100%;
                            transform-origin: left;
                        `
                    }
                });

                // Animate progress bar
                progress.animate([
                    { transform: 'scaleX(1)' },
                    { transform: 'scaleX(0)' }
                ], {
                    duration: notification.duration,
                    easing: 'linear',
                    fill: 'forwards'
                });

                element.appendChild(progress);
            }

            // Create content
            const content = this._createNotificationContent(notification);
            element.appendChild(content);

            // Add close button if closeable
            if (notification.closeable) {
                const closeButton = DOM.createElement('button', {
                    className: 'w3-button w3-hover-none w3-hover-text-white notification-close',
                    innerHTML: '×',
                    attributes: {
                        'data-action': 'notification-close',
                        'data-notification-id': notification.id,
                        style: `
                            position: absolute;
                            top: 0;
                            right: 0;
                            padding: 8px;
                            cursor: pointer;
                            background: transparent;
                            border: none;
                            color: inherit;
                        `
                    }
                });
                element.appendChild(closeButton);
            }

            return element;

        } catch (error) {
            this._handleError('Create Notification Element Error', error);
            throw error;
        }
    }

    /**
     * Create notification content
     * @private
     */
    _createNotificationContent(notification) {
        const content = DOM.createElement('div', {
            className: 'notification-content w3-padding'
        });

        // Add message
        const messageContainer = DOM.createElement('div', {
            className: 'notification-message',
            innerHTML: `
                ${this._getTypeIcon(notification.type)}
                <span>${notification.message}</span>
            `
        });
        content.appendChild(messageContainer);

        // Add details if present
        if (notification.details) {
            const details = DOM.createElement('div', {
                className: 'notification-details w3-small w3-text-grey',
                textContent: notification.details,
                attributes: {
                    style: 'margin-top: 4px;'
                }
            });
            content.appendChild(details);
        }

        // Add actions if present
        if (notification.actions?.length > 0) {
            const actions = DOM.createElement('div', {
                className: 'notification-actions w3-bar-block w3-margin-top'
            });

            notification.actions.forEach(action => {
                const button = DOM.createElement('button', {
                    className: 'w3-button w3-small w3-border',
                    textContent: action.label,
                    attributes: {
                        'data-action': 'notification-action',
                        'data-notification-id': notification.id
                    },
                    events: {
                        click: action.action
                    }
                });
                actions.appendChild(button);
            });

            content.appendChild(actions);
        }

        return content;
    }

    /**
     * Remove notification by ID with safety checks
     * @param {string} id - Notification ID
     */
    remove(id) {
        try {
            this._checkInitialized();

            const element = document.getElementById(id);
            const notification = this.activeNotifications.get(id);
            
            if (!element || !notification) return;
            
            // Clear timeout if exists
            if (notification.timer) {
                clearTimeout(notification.timer);
            }
            
            // Start exit animation
            element.style.opacity = '0';
            element.style.transform = 'translateX(100%)';
            
            // Remove after animation
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                
                // Remove from tracking
                this.activeNotifications.delete(id);
                
                // Show next queued notification if any
                if (this.queue.length > 0) {
                    const next = this.queue.shift();
                    this._showNotification(next);
                }
                
                this._updateState();
            }, 300);

        } catch (error) {
            this._handleError('Remove Notification Error', error);
        }
    }

    /**
     * Handle notification click events
     * @private
     */
    handleClick(event) {
        try {
            const target = event.target;
            const action = target.dataset.action;
            
            if (!action) return;
            
            const notificationId = target.dataset.notificationId;
            
            if (action === 'notification-close') {
                this.remove(notificationId);
            }
        } catch (error) {
            this._handleError('Click Handler Error', error);
        }
    }

    /**
     * Update notification state
     * @private
     */
    _updateState() {
        try {
            State.update(UI_STATE_KEY, {
                notifications: {
                    active: Array.from(this.activeNotifications.keys()),
                    queue: this.queue.map(n => n.id),
                    lastUpdate: new Date()
                }
            });
        } catch (error) {
            this._handleError('State Update Error', error);
        }
    }

    /**
     * Get notification type styling
     * @private
     */
    _getTypeClass(type) {
        switch (type) {
            case 'success': return 'w3-green';
            case 'error': return 'w3-red';
            case 'warning': return 'w3-amber';
            case 'info':
            default: return 'w3-blue';
        }
    }

    /**
     * Get notification type icon
     * @private
     */
    _getTypeIcon(type) {
        switch (type) {
            case 'success': return '<i class="bi bi-check-circle"></i>';
            case 'error': return '<i class="bi bi-x-circle"></i>';
            case 'warning': return '<i class="bi bi-exclamation-triangle"></i>';
            case 'info':
            default: return '<i class="bi bi-info-circle"></i>';
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        try {
            this._checkInitialized();

            // Clear all timeouts
            this.activeNotifications.forEach(notification => {
                if (notification.timer) {
                    clearTimeout(notification.timer);
                }
            });

            // Remove container
            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }

            // Clear collections
            this.activeNotifications.clear();
            this.queue = [];

            // Reset state
            State.update(UI_STATE_KEY, {
                notifications: {
                    active: [],
                    queue: [],
                    lastUpdate: new Date()
                }
            });

            this.initialized = false;

        } catch (error) {
            this._handleError('Destroy Error', error);
        }
    }
}

/**
 * Enhanced Status Manager with initialization safety
 */
class StatusManager extends BaseUIManager {
    constructor() {
        super();
        this.statuses = new Map();
        this.container = null;
    }

    /**
     * Initialize status manager with dependency checks
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            console.warn('StatusManager already initialized');
            return;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before StatusManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before StatusManager');
            }

            // Create container
            this.container = DOM.createElement('div', {
                className: 'status-container w3-display-bottommiddle',
                attributes: {
                    style: `
                        position: fixed;
                        bottom: 20px;
                        z-index: 9000;
                        pointer-events: none;
                        text-align: center;
                    `
                }
            });
            document.body.appendChild(this.container);

            // Initialize state
            State.update(UI_STATE_KEY, {
                status: {
                    active: [],
                    lastUpdate: new Date()
                }
            });

            this.initialized = true;
            console.log('StatusManager initialized');

        } catch (error) {
            this._handleError('Initialization Error', error);
            throw error;
        }
    }
    // ... continued from Part 2

    /**
     * Show status message with safety checks
     * @param {string} message - Status message
     * @param {Object} options - Status options
     */
    show(message, options = {}) {
        try {
            this._checkInitialized();

            const id = options.id || `status-${Date.now()}`;
            const duration = options.duration || 0;
            const type = options.type || 'info';

            // Check if status with this ID already exists
            if (this.statuses.has(id)) {
                this.update(id, message, options);
                return;
            }

            // Create status object
            const status = {
                id,
                message,
                type,
                spinner: options.spinner !== false,
                progress: options.progress || 0,
                showProgress: options.showProgress || false,
                timestamp: new Date()
            };

            // Create and show element
            const element = this._createStatusElement(status);
            this.container.appendChild(element);
            this.statuses.set(id, status);

            // Trigger entrance animation
            requestAnimationFrame(() => {
                element.style.transform = 'translateY(0)';
                element.style.opacity = '1';
            });

            // Auto-hide if duration specified
            if (duration > 0) {
                status.timer = setTimeout(() => {
                    this.hide(id);
                }, duration);
            }

            this._updateState();

        } catch (error) {
            this._handleError('Show Status Error', error);
        }
    }

    /**
     * Update existing status with safety checks
     * @param {string} id - Status ID
     * @param {string} message - New message
     * @param {Object} options - Update options
     */
    update(id, message, options = {}) {
        try {
            this._checkInitialized();

            const status = this.statuses.get(id);
            if (!status) return;

            const element = document.getElementById(id);
            if (!element) return;

            // Clear existing timer if any
            if (status.timer) {
                clearTimeout(status.timer);
                status.timer = null;
            }

            // Update message
            const messageEl = element.querySelector('.status-message');
            if (messageEl) {
                messageEl.textContent = message;
            }

            // Update progress if provided
            if (options.hasOwnProperty('progress')) {
                status.progress = options.progress;
                status.showProgress = true;

                const progressBar = element.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${status.progress}%`;
                } else {
                    // Add progress bar if not present
                    this._addProgressBar(element, status);
                }
            }

            // Set auto-hide timer if duration specified
            if (options.duration > 0) {
                status.timer = setTimeout(() => {
                    this.hide(id);
                }, options.duration);
            }

            this._updateState();

        } catch (error) {
            this._handleError('Update Status Error', error);
        }
    }

    /**
     * Hide status message with safety checks
     * @param {string} id - Status ID
     */
    hide(id) {
        try {
            this._checkInitialized();

            const element = document.getElementById(id);
            const status = this.statuses.get(id);

            if (!element || !status) return;

            // Clear timeout if exists
            if (status.timer) {
                clearTimeout(status.timer);
            }

            // Start exit animation
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';

            // Remove after animation
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }

                // Remove from tracking
                this.statuses.delete(id);
                this._updateState();
            }, 300);

        } catch (error) {
            this._handleError('Hide Status Error', error);
        }
    }

    /**
     * Create status element with error handling
     * @private
     */
    _createStatusElement(status) {
        try {
            const element = DOM.createElement('div', {
                id: status.id,
                className: `status-item ${this._getStatusClass(status.type)}`,
                attributes: {
                    style: `
                        transition: all 0.3s ease-in-out;
                        transform: translateY(20px);
                        opacity: 0;
                        margin: 8px;
                        padding: 10px 15px;
                        border-radius: 4px;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        pointer-events: auto;
                        min-width: 240px;
                    `
                }
            });

            // Add spinner if needed
            if (status.spinner) {
                element.innerHTML += `
                    <i class="bi bi-arrow-repeat w3-spin w3-margin-right"></i>
                `;
            }

            // Add message
            const messageEl = DOM.createElement('span', {
                className: 'status-message',
                textContent: status.message
            });
            element.appendChild(messageEl);

            // Add progress bar if needed
            if (status.showProgress) {
                this._addProgressBar(element, status);
            }

            return element;

        } catch (error) {
            this._handleError('Create Status Element Error', error);
            throw error;
        }
    }

    /**
     * Add progress bar to status element
     * @private
     */
    _addProgressBar(element, status) {
        try {
            const progressContainer = DOM.createElement('div', {
                className: 'progress-container',
                attributes: {
                    style: `
                        width: 100%;
                        background-color: rgba(255,255,255,0.3);
                        height: 4px;
                        margin-top: 8px;
                        border-radius: 2px;
                        overflow: hidden;
                    `
                }
            });

            const progressBar = DOM.createElement('div', {
                className: 'progress-bar',
                attributes: {
                    style: `
                        height: 100%;
                        width: ${status.progress}%;
                        background-color: rgba(255,255,255,0.7);
                        transition: width 0.3s ease;
                    `
                }
            });

            progressContainer.appendChild(progressBar);
            element.appendChild(progressContainer);

        } catch (error) {
            this._handleError('Add Progress Bar Error', error);
        }
    }

    /**
     * Get status type class
     * @private
     */
    _getStatusClass(type) {
        switch (type) {
            case 'success': return 'w3-green';
            case 'error': return 'w3-red';
            case 'warning': return 'w3-amber';
            case 'info':
            default: return 'w3-blue';
        }
    }

    /**
     * Update status state
     * @private
     */
    _updateState() {
        try {
            State.update(UI_STATE_KEY, {
                status: {
                    active: Array.from(this.statuses.keys()),
                    lastUpdate: new Date()
                }
            });
        } catch (error) {
            this._handleError('State Update Error', error);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        try {
            this._checkInitialized();

            // Clear all timeouts
            this.statuses.forEach(status => {
                if (status.timer) {
                    clearTimeout(status.timer);
                }
            });

            // Remove container
            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }

            // Clear collections
            this.statuses.clear();

            // Reset state
            State.update(UI_STATE_KEY, {
                status: {
                    active: [],
                    lastUpdate: new Date()
                }
            });

            this.initialized = false;

        } catch (error) {
            this._handleError('Destroy Error', error);
        }
    }
}

/**
 * Enhanced Tree UI Manager with initialization safety
 */
class TreeUIManager extends BaseUIManager {
    constructor() {
        super();
        this.renderQueue = new Set();
        this.animations = new Map();
        this.state = {
            expandedNodes: new Set(),
            selectedNode: null
        };
    }

    /**
     * Initialize tree UI manager with dependency checks
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            console.warn('TreeUIManager already initialized');
            return;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before TreeUIManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before TreeUIManager');
            }

            // Initialize tree state
            State.set('tree_ui_state', {
                expanded: [],
                selected: null,
                lastAction: null,
                lastUpdate: new Date()
            });

            this.initialized = true;
            console.log('TreeUIManager initialized');

        } catch (error) {
            this._handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Render projects tree with safety checks
     * @param {Array} projects - Array of project data
     */
    renderProjects(projects) {
        try {
            this._checkInitialized();

            const container = DOM.getElement('.tree-wrapper');
            if (!container) {
                throw new Error('Tree wrapper container not found');
            }

            // Clear container
            container.innerHTML = '';

            if (!projects?.length) {
                const emptyMessage = DOM.getElement('.no-results');
                if (emptyMessage) {
                    emptyMessage.classList.remove('w3-hide');
                }
                return;
            }

            // Hide empty message
            const emptyMessage = DOM.getElement('.no-results');
            if (emptyMessage) {
                emptyMessage.classList.add('w3-hide');
            }

            // Create document fragment for better performance
            const fragment = document.createDocumentFragment();

            // Render each project
            projects.forEach(project => {
                const projectNode = this._createTreeItem({
                    type: 'project',
                    id: project.id,
                    name: project.name,
                    description: project.description || '',
                    hasChildren: project.locations?.length > 0
                });

                fragment.appendChild(projectNode);

                // If project has locations and was previously expanded, render them
                if (this._isNodeExpanded('project', project.id) && 
                    project.locations?.length > 0) {
                    
                    const childrenContainer = projectNode.querySelector('.children-container');
                    if (childrenContainer) {
                        childrenContainer.classList.remove('w3-hide');
                        
                        const locationsFragment = document.createDocumentFragment();
                        project.locations.forEach(location => {
                            const locationNode = this._createTreeItem({
                                type: 'location',
                                id: location.id,
                                name: location.name,
                                description: location.address || '',
                                parent: project.id,
                                hasChildren: true // Measurements will be loaded on demand
                            });
                            
                            locationsFragment.appendChild(locationNode);
                        });
                        
                        childrenContainer.appendChild(locationsFragment);
                        
                        // Update toggle button state
                        const toggleIcon = projectNode.querySelector('[data-action="toggle"] i');
                        if (toggleIcon) {
                            toggleIcon.className = 'bi bi-chevron-down';
                        }
                    }
                }
            });

            // Append all nodes at once
            container.appendChild(fragment);

            // Update state
            this._updateState();

        } catch (error) {
            this._handleError('Render Projects Error', error);
        }
    }

    /**
     * Create a tree item element with error handling
     * @private
     */
    _createTreeItem(config) {
        try {
            const {
                type, 
                id, 
                name, 
                description = '', 
                parent = null,
                hasChildren = false
            } = config;

            const item = DOM.createElement('div', {
                className: 'tree-item w3-hover-light-grey',
                attributes: {
                    'data-type': type,
                    'data-id': id,
                    ...(parent && { 'data-parent': parent })
                }
            });

            // Create item content
            const content = DOM.createElement('div', {
                className: 'tree-item-content w3-bar'
            });

            // Add toggle button for nodes that can have children
            if (hasChildren) {
                content.innerHTML += `
                    <button class="w3-bar-item w3-button toggle-btn" data-action="toggle">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                `;
            } else {
                content.innerHTML += `
                    <span class="w3-bar-item spacer" style="width: 38px;"></span>
                `;
            }

            // Add item data
            content.innerHTML += `
                <div class="w3-bar-item item-data">
                    <span class="item-name">${name}</span>
                    ${description ? `
                        <span class="item-description w3-small w3-text-grey">${description}</span>
                    ` : ''}
                </div>
            `;

            // Add action buttons
            content.appendChild(this._createActionButtons(type));

            item.appendChild(content);

            // Add children container for expandable nodes
            if (hasChildren) {
                const childrenContainer = DOM.createElement('div', {
                    className: 'children-container w3-hide'
                });
                item.appendChild(childrenContainer);
            }

            return item;

        } catch (error) {
            this._handleError('Create Tree Item Error', error);
            throw error;
        }
    }

    /**
     * Create action buttons for tree item
     * @private
     */
    _createActionButtons(type) {
        const actions = DOM.createElement('div', {
            className: 'w3-bar-item w3-right item-actions'
        });

        // Common actions
        const commonButtons = `
            <button class="w3-button" data-action="edit" title="Edit">
                <i class="bi bi-pencil"></i>
            </button>
            <button class="w3-button" data-action="delete" title="Delete">
                <i class="bi bi-trash"></i>
            </button>
        `;

        // Type-specific actions
        const addChildButton = type !== 'measurement' ? `
            <button class="w3-button" data-action="add-child" 
                    title="Add ${type === 'project' ? 'Location' : 'Measurement'}">
                <i class="bi bi-plus"></i>
            </button>
        ` : '';

        actions.innerHTML = commonButtons + addChildButton;
        return actions;
    }
    /**
     * Check if node is expanded
     * @private
     */
    _isNodeExpanded(type, id) {
        try {
            const state = State.get('tree_ui_state');
            return state?.expanded?.includes(`${type}-${id}`) || false;
        } catch (error) {
            this._handleError('Check Node Expanded Error', error);
            return false;
        }
    }

    /**
     * Set node expanded state
     * @private
     */
    _setNodeExpanded(type, id, expanded) {
        try {
            const state = State.get('tree_ui_state');
            const expandedNodes = new Set(state?.expanded || []);
            const nodeKey = `${type}-${id}`;

            if (expanded) {
                expandedNodes.add(nodeKey);
            } else {
                expandedNodes.delete(nodeKey);
            }

            State.update('tree_ui_state', {
                expanded: Array.from(expandedNodes),
                lastUpdate: new Date()
            });
        } catch (error) {
            this._handleError('Set Node Expanded Error', error);
        }
    }

    /**
     * Toggle node expansion with safety checks
     * @param {HTMLElement} node - Node element
     * @returns {Promise<void>}
     */
    async toggleNode(node) {
        try {
            this._checkInitialized();

            const type = node.dataset.type;
            const id = node.dataset.id;
            const childrenContainer = node.querySelector('.children-container');
            const toggleIcon = node.querySelector('[data-action="toggle"] i');

            if (!childrenContainer || !toggleIcon) return;

            const isExpanded = !childrenContainer.classList.contains('w3-hide');

            if (isExpanded) {
                // Collapse
                await this._collapseNode(node, childrenContainer, toggleIcon);
            } else {
                // Expand
                await this._expandNode(node, childrenContainer, toggleIcon);
            }

            this._setNodeExpanded(type, id, !isExpanded);
            this._updateState();

        } catch (error) {
            this._handleError('Toggle Node Error', error);
        }
    }

    /**
     * Collapse node with animation
     * @private
     */
    async _collapseNode(node, container, icon) {
        try {
            icon.className = 'bi bi-chevron-right';

            // Animate collapse
            const height = container.scrollHeight;
            container.style.height = `${height}px`;
            container.style.overflow = 'hidden';

            // Trigger animation
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    container.style.transition = 'height 0.3s ease-out';
                    container.style.height = '0';

                    // After animation
                    setTimeout(() => {
                        container.classList.add('w3-hide');
                        container.style.height = '';
                        container.style.transition = '';
                        container.style.overflow = '';
                        resolve();
                    }, 300);
                });
            });

        } catch (error) {
            this._handleError('Collapse Node Error', error);
        }
    }

    /**
     * Expand node with animation
     * @private
     */
    async _expandNode(node, container, icon) {
        try {
            icon.className = 'bi bi-chevron-down';
            container.classList.remove('w3-hide');
            container.style.height = '0';
            container.style.overflow = 'hidden';
            container.style.transition = 'height 0.3s ease-in';

            // Calculate and set target height
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    const targetHeight = container.scrollHeight;
                    container.style.height = `${targetHeight}px`;

                    // After animation
                    setTimeout(() => {
                        container.style.height = '';
                        container.style.transition = '';
                        container.style.overflow = '';
                        resolve();
                    }, 300);
                });
            });

        } catch (error) {
            this._handleError('Expand Node Error', error);
        }
    }

    /**
     * Update a tree node with new data
     * @param {string} type - Node type 
     * @param {string} id - Node ID
     * @param {Object} data - New data
     */
    updateNode(type, id, data) {
        try {
            this._checkInitialized();

            const node = DOM.getElement(`.tree-item[data-type="${type}"][data-id="${id}"]`);
            if (!node) return;

            // Update name if provided
            if (data.name) {
                const nameEl = node.querySelector('.item-name');
                if (nameEl) nameEl.textContent = data.name;
            }

            // Update description if provided
            if (data.description) {
                const descEl = node.querySelector('.item-description');
                if (descEl) {
                    descEl.textContent = data.description;
                } else {
                    const dataEl = node.querySelector('.item-data');
                    if (dataEl) {
                        const newDescEl = DOM.createElement('span', {
                            className: 'item-description w3-small w3-text-grey',
                            textContent: data.description
                        });
                        dataEl.appendChild(newDescEl);
                    }
                }
            }

            // Add highlight animation
            node.classList.add('w3-pale-yellow');
            setTimeout(() => {
                node.classList.remove('w3-pale-yellow');
            }, 1000);

            // Update state
            this._updateState();

        } catch (error) {
            this._handleError('Update Node Error', error);
        }
    }

    /**
     * Expand all nodes
     */
    async expandAll() {
        try {
            this._checkInitialized();

            const nodes = DOM.getElements('.tree-item[data-type]');
            for (const node of nodes) {
                const childrenContainer = node.querySelector('.children-container');
                const toggleIcon = node.querySelector('[data-action="toggle"] i');

                if (childrenContainer && toggleIcon && 
                    childrenContainer.classList.contains('w3-hide')) {
                    await this._expandNode(node, childrenContainer, toggleIcon);
                    this._setNodeExpanded(node.dataset.type, node.dataset.id, true);
                }
            }

            this._updateState();

        } catch (error) {
            this._handleError('Expand All Error', error);
        }
    }

    /**
     * Collapse all nodes
     */
    async collapseAll() {
        try {
            this._checkInitialized();

            const nodes = DOM.getElements('.tree-item[data-type]');
            for (const node of nodes) {
                const childrenContainer = node.querySelector('.children-container');
                const toggleIcon = node.querySelector('[data-action="toggle"] i');

                if (childrenContainer && toggleIcon && 
                    !childrenContainer.classList.contains('w3-hide')) {
                    await this._collapseNode(node, childrenContainer, toggleIcon);
                    this._setNodeExpanded(node.dataset.type, node.dataset.id, false);
                }
            }

            this._updateState();

        } catch (error) {
            this._handleError('Collapse All Error', error);
        }
    }

    /**
     * Update tree state
     * @private
     */
    _updateState() {
        try {
            const expandedNodes = Array.from(DOM.getElements('.children-container:not(.w3-hide)'))
                .map(container => {
                    const node = container.closest('.tree-item');
                    return node ? `${node.dataset.type}-${node.dataset.id}` : null;
                })
                .filter(Boolean);

            State.update('tree_ui_state', {
                expanded: expandedNodes,
                lastUpdate: new Date()
            });
        } catch (error) {
            this._handleError('Update State Error', error);
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        try {
            this._checkInitialized();

            // Clear collections
            this.renderQueue.clear();
            this.animations.clear();
            this.state.expandedNodes.clear();
            this.state.selectedNode = null;

            // Reset state
            State.update('tree_ui_state', {
                expanded: [],
                selected: null,
                lastAction: null,
                lastUpdate: new Date()
            });

            this.initialized = false;

        } catch (error) {
            this._handleError('Destroy Error', error);
        }
    }
}

// Export singleton instances
export const NotificationUI = new NotificationManager();
export const StatusUI = new StatusManager();
export const TreeUI = new TreeUIManager();