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


// Export singleton instances
export const NotificationUI = new NotificationManager();
export const StatusUI = new StatusManager();