// ui.js
// Enhanced UI management with improved state integration

import { State } from './state.js';

const UI_STATE_KEY = 'ui_state';

/**
 * Enhanced Notification Manager
 */
class NotificationManager {
    constructor() {
        this.container = null;
        this.queue = [];
        this.activeNotifications = new Map();
        this.maxNotifications = 3;
        
        // Initialize state and container
        this.initialize();

        // Bind methods
        this.handleClick = this.handleClick.bind(this);
    }

    /**
     * Initialize notification system
     */
    initialize() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'notification-container w3-display-topright';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
            pointer-events: none;
        `;
        
        // Add click handler
        this.container.addEventListener('click', this.handleClick);
        document.body.appendChild(this.container);

        // Initialize state
        State.set(UI_STATE_KEY, {
            notifications: {
                active: [],
                queue: [],
                lastUpdate: new Date()
            }
        });
    }

    /**
     * Show a notification
     * @param {Object} config - Notification configuration
     */
    show(config) {
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
            this.updateState();
        } else {
            this._showNotification(notification);
        }
    }

    /**
     * Show an API error notification
     * @param {Error} error - API error
     */
    showAPIError(error) {
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
    }

    /**
     * Show a form error notification
     * @param {string} formId - Form identifier
     * @param {Object} errors - Form errors
     */
    showFormError(formId, errors) {
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
    }
    /**
     * Create and show notification element
     * @private
     */
    _showNotification(notification) {
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

        this.updateState();
    }

    /**
     * Create notification element
     * @private
     */
    _createNotificationElement(notification) {
        const element = document.createElement('div');
        element.id = notification.id;
        element.className = `notification ${this._getTypeClass(notification.type)}`;
        element.style.cssText = `
            transition: all 0.3s ease-in-out;
            transform: translateX(100%);
            opacity: 0;
            margin: 8px;
            position: relative;
            overflow: hidden;
            pointer-events: auto;
            min-width: 280px;
        `;

        // Progress bar for timed notifications
        if (notification.duration > 0) {
            const progress = document.createElement('div');
            progress.className = 'notification-progress';
            progress.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: rgba(255, 255, 255, 0.5);
                width: 100%;
                transform-origin: left;
            `;

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

        // Create content container
        const content = document.createElement('div');
        content.className = 'notification-content w3-padding';

        // Add icon and message
        content.innerHTML = `
            <div class="notification-message">
                ${this._getTypeIcon(notification.type)}
                <span>${notification.message}</span>
            </div>
        `;

        // Add details if present
        if (notification.details) {
            const details = document.createElement('div');
            details.className = 'notification-details w3-small w3-text-grey';
            details.style.marginTop = '4px';
            details.textContent = notification.details;
            content.appendChild(details);
        }

        // Add action buttons
        if (notification.actions && notification.actions.length > 0) {
            const actions = document.createElement('div');
            actions.className = 'notification-actions w3-bar-block w3-margin-top';
            
            notification.actions.forEach(action => {
                const button = document.createElement('button');
                button.className = 'w3-button w3-small w3-border';
                button.textContent = action.label;
                button.dataset.action = 'notification-action';
                button.dataset.notificationId = notification.id;
                button.onclick = action.action;
                actions.appendChild(button);
            });

            content.appendChild(actions);
        }

        element.appendChild(content);

        // Add close button if closeable
        if (notification.closeable) {
            const closeButton = document.createElement('button');
            closeButton.className = 'w3-button w3-hover-none w3-hover-text-white notification-close';
            closeButton.innerHTML = '×';
            closeButton.dataset.action = 'notification-close';
            closeButton.dataset.notificationId = notification.id;
            closeButton.style.cssText = `
                position: absolute;
                top: 0;
                right: 0;
                padding: 8px;
                cursor: pointer;
                background: transparent;
                border: none;
                color: inherit;
            `;
            element.appendChild(closeButton);
        }

        return element;
    }
    /**
     * Remove notification by ID
     * @param {string} id - Notification ID
     */
    remove(id) {
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
            
            this.updateState();
        }, 300);
    }
    
    /**
     * Handle notification click events
     * @param {Event} event - Click event
     * @private
     */
    handleClick(event) {
        const target = event.target;
        const action = target.dataset.action;
        
        if (!action) return;
        
        const notificationId = target.dataset.notificationId;
        
        if (action === 'notification-close') {
            this.remove(notificationId);
        }
    }
    
    /**
     * Clear all notifications
     */
    clearAll() {
        // Remove all active notifications
        this.activeNotifications.forEach((_, id) => {
            this.remove(id);
        });
        
        // Clear queue
        this.queue = [];
        
        this.updateState();
    }
    
    /**
     * Update notification state
     * @private
     */
    updateState() {
        State.update(UI_STATE_KEY, {
            notifications: {
                active: Array.from(this.activeNotifications.keys()),
                queue: this.queue.map(n => n.id),
                lastUpdate: new Date()
            }
        });
    }
    
    /**
     * Get CSS class for notification type
     * @param {string} type - Notification type
     * @returns {string} CSS class
     * @private
     */
    _getTypeClass(type) {
        switch (type) {
            case 'success':
                return 'w3-green';
            case 'error':
                return 'w3-red';
            case 'warning':
                return 'w3-amber';
            case 'info':
            default:
                return 'w3-blue';
        }
    }
    
    /**
     * Get icon for notification type
     * @param {string} type - Notification type
     * @returns {string} Icon HTML
     * @private
     */
    _getTypeIcon(type) {
        switch (type) {
            case 'success':
                return '<i class="bi bi-check-circle"></i>';
            case 'error':
                return '<i class="bi bi-x-circle"></i>';
            case 'warning':
                return '<i class="bi bi-exclamation-triangle"></i>';
            case 'info':
            default:
                return '<i class="bi bi-info-circle"></i>';
        }
    }
}
/**
 * Enhanced Status UI Manager
 */
class StatusManager {
    constructor() {
        this.statuses = new Map();
        this.container = null;
        
        // Initialize container
        this.initialize();
    }
    
    /**
     * Initialize status system
     */
    initialize() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'status-container w3-display-bottommiddle';
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            z-index: 9000;
            pointer-events: none;
            text-align: center;
        `;
        document.body.appendChild(this.container);
        
        // Initialize state
        State.update(UI_STATE_KEY, {
            status: {
                active: [],
                lastUpdate: new Date()
            }
        });
    }
    
    /**
     * Show status message
     * @param {string} message - Status message
     * @param {Object} options - Status options
     */
    show(message, options = {}) {
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
        
        this.updateState();
    }
    
    /**
     * Update existing status
     * @param {string} id - Status ID
     * @param {string} message - New message
     * @param {Object} options - Update options
     */
    update(id, message, options = {}) {
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
        
        this.updateState();
    }
    /**
     * Hide status message
     * @param {string} id - Status ID
     */
    hide(id) {
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
            this.updateState();
        }, 300);
    }
    
    /**
     * Create status element
     * @private
     * @param {Object} status - Status configuration
     * @returns {HTMLElement} Status element
     */
    _createStatusElement(status) {
        const element = document.createElement('div');
        element.id = status.id;
        element.className = `status-item ${this._getStatusClass(status.type)}`;
        element.style.cssText = `
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
        `;
        
        // Add spinner if needed
        if (status.spinner) {
            element.innerHTML += `
                <i class="bi bi-arrow-repeat w3-spin w3-margin-right"></i>
            `;
        }
        
        // Add message
        const messageEl = document.createElement('span');
        messageEl.className = 'status-message';
        messageEl.textContent = status.message;
        element.appendChild(messageEl);
        
        // Add progress bar if needed
        if (status.showProgress) {
            this._addProgressBar(element, status);
        }
        
        return element;
    }
    
    /**
     * Add progress bar to status element
     * @private
     * @param {HTMLElement} element - Status element
     * @param {Object} status - Status configuration
     */
    _addProgressBar(element, status) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.style.cssText = `
            width: 100%;
            background-color: rgba(255,255,255,0.3);
            height: 4px;
            margin-top: 8px;
            border-radius: 2px;
            overflow: hidden;
        `;
        
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.cssText = `
            height: 100%;
            width: ${status.progress}%;
            background-color: rgba(255,255,255,0.7);
            transition: width 0.3s ease;
        `;
        
        progressContainer.appendChild(progressBar);
        element.appendChild(progressContainer);
    }
    
    /**
     * Get status type class
     * @private
     * @param {string} type - Status type
     * @returns {string} CSS class
     */
    _getStatusClass(type) {
        switch (type) {
            case 'success':
                return 'w3-green';
            case 'error':
                return 'w3-red';
            case 'warning':
                return 'w3-amber';
            case 'info':
            default:
                return 'w3-blue';
        }
    }
    
    /**
     * Update status state
     * @private
     */
    updateState() {
        State.update(UI_STATE_KEY, {
            status: {
                active: Array.from(this.statuses.keys()),
                lastUpdate: new Date()
            }
        });
    }
}

/**
 * Tree UI Manager
 */
class TreeUIManager {
    constructor() {
        this.renderQueue = new Set();
        this.animations = new Map();
        this.state = {
            expandedNodes: new Set(),
            selectedNode: null
        };
        
        // Initialize tree state
        this.initializeState();
    }
    /**
     * Initialize tree UI state
     * @private
     */
    initializeState() {
        if (!State.get('tree_ui_state')) {
            State.set('tree_ui_state', {
                expanded: [],
                selected: null,
                lastAction: null,
                lastUpdate: new Date()
            });
        }
    }
    
    /**
     * Render projects tree
     * @param {Array} projects - Array of project data
     */
    renderProjects(projects) {
        const container = document.querySelector('.tree-wrapper');
        if (!container) return;
        
        // Clear container
        container.innerHTML = '';
        
        if (!projects || projects.length === 0) {
            const emptyMessage = document.querySelector('.no-results');
            if (emptyMessage) {
                emptyMessage.classList.remove('w3-hide');
            }
            return;
        }
        
        // Hide empty message
        const emptyMessage = document.querySelector('.no-results');
        if (emptyMessage) {
            emptyMessage.classList.add('w3-hide');
        }
        
        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        // Render each project
        projects.forEach(project => {
            const projectNode = this.createTreeItem({
                type: 'project',
                id: project.id,
                name: project.name,
                description: project.description || '',
                hasChildren: project.locations && project.locations.length > 0
            });
            
            fragment.appendChild(projectNode);
            
            // If project has locations and was previously expanded, render them
            if (this.isNodeExpanded('project', project.id) && 
                project.locations && 
                project.locations.length > 0) {
                
                const childrenContainer = projectNode.querySelector('.children-container');
                if (childrenContainer) {
                    childrenContainer.classList.remove('w3-hide');
                    
                    const locationsFragment = document.createDocumentFragment();
                    project.locations.forEach(location => {
                        const locationNode = this.createTreeItem({
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
    }
    
    /**
     * Create a tree item element
     * @param {Object} config - Item configuration
     * @returns {HTMLElement} Tree item element
     */
    createTreeItem(config) {
        const {
            type, 
            id, 
            name, 
            description = '', 
            parent = null,
            hasChildren = false
        } = config;
        
        const item = document.createElement('div');
        item.className = 'tree-item w3-hover-light-grey';
        item.dataset.type = type;
        item.dataset.id = id;
        if (parent) item.dataset.parent = parent;
        
        // Create item content
        const content = document.createElement('div');
        content.className = 'tree-item-content w3-bar';
        
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
        
        // Add action buttons based on type
        let actionButtons = '';
        
        // Common actions
        actionButtons += `
            <button class="w3-button" data-action="edit" title="Edit">
                <i class="bi bi-pencil"></i>
            </button>
            <button class="w3-button" data-action="delete" title="Delete">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        // Type-specific actions
        if (type === 'project') {
            actionButtons += `
                <button class="w3-button" data-action="add-child" title="Add Location">
                    <i class="bi bi-plus"></i>
                </button>
            `;
        } else if (type === 'location') {
            actionButtons += `
                <button class="w3-button" data-action="add-child" title="Add Measurement">
                    <i class="bi bi-plus"></i>
                </button>
            `;
        }
        
        content.innerHTML += `
            <div class="w3-bar-item w3-right item-actions">
                ${actionButtons}
            </div>
        `;
        
        item.appendChild(content);
        
        // Add children container for expandable nodes
        if (hasChildren) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container w3-hide';
            item.appendChild(childrenContainer);
        }
        
        return item;
    }
    /**
     * Check if node is expanded
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @returns {boolean} Is expanded
     */
    isNodeExpanded(type, id) {
        const state = State.get('tree_ui_state');
        return state && state.expanded && state.expanded.includes(`${type}-${id}`);
    }
    
    /**
     * Set node expanded state
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @param {boolean} expanded - Expanded state
     */
    setNodeExpanded(type, id, expanded) {
        const state = State.get('tree_ui_state');
        const expandedNodes = new Set(state?.expanded || []);
        const nodeKey = `${type}-${id}`;
        
        if (expanded) {
            expandedNodes.add(nodeKey);
        } else {
            expandedNodes.delete(nodeKey);
        }
        
        State.update('tree_ui_state', {
            expanded: Array.from(expandedNodes)
        });
    }
    
    /**
     * Toggle node expansion
     * @param {HTMLElement} node - Node element
     * @returns {Promise<void>}
     */
    async toggleNode(node) {
        const type = node.dataset.type;
        const id = node.dataset.id;
        const childrenContainer = node.querySelector('.children-container');
        const toggleIcon = node.querySelector('[data-action="toggle"] i');
        
        if (!childrenContainer || !toggleIcon) return;
        
        const isExpanded = !childrenContainer.classList.contains('w3-hide');
        
        if (isExpanded) {
            // Collapse
            toggleIcon.className = 'bi bi-chevron-right';
            
            // Animate collapse
            const height = childrenContainer.scrollHeight;
            childrenContainer.style.height = `${height}px`;
            childrenContainer.style.overflow = 'hidden';
            
            // Trigger animation
            requestAnimationFrame(() => {
                childrenContainer.style.transition = 'height 0.3s ease-out';
                childrenContainer.style.height = '0';
                
                // After animation
                setTimeout(() => {
                    childrenContainer.classList.add('w3-hide');
                    childrenContainer.style.height = '';
                    childrenContainer.style.transition = '';
                    childrenContainer.style.overflow = '';
                    
                    // Update state
                    this.setNodeExpanded(type, id, false);
                }, 300);
            });
            
        } else {
            // Expand
            toggleIcon.className = 'bi bi-chevron-down';
            childrenContainer.classList.remove('w3-hide');
            childrenContainer.style.height = '0';
            childrenContainer.style.overflow = 'hidden';
            childrenContainer.style.transition = 'height 0.3s ease-in';
            
            // Calculate and set target height
            requestAnimationFrame(() => {
                const targetHeight = childrenContainer.scrollHeight;
                childrenContainer.style.height = `${targetHeight}px`;
                
                // After animation
                setTimeout(() => {
                    childrenContainer.style.height = '';
                    childrenContainer.style.transition = '';
                    childrenContainer.style.overflow = '';
                    
                    // Update state
                    this.setNodeExpanded(type, id, true);
                }, 300);
            });
        }
    }
    
    /**
     * Update a tree node with new data
     * @param {string} type - Node type 
     * @param {string} id - Node ID
     * @param {Object} data - New data
     */
    updateNode(type, id, data) {
        const node = document.querySelector(`.tree-item[data-type="${type}"][data-id="${id}"]`);
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
                    const newDescEl = document.createElement('span');
                    newDescEl.className = 'item-description w3-small w3-text-grey';
                    newDescEl.textContent = data.description;
                    dataEl.appendChild(newDescEl);
                }
            }
        }
        
        // Add highlight animation
        node.classList.add('w3-pale-yellow');
        setTimeout(() => {
            node.classList.remove('w3-pale-yellow');
        }, 1000);
    }
}

// Export singleton instances
export const NotificationUI = new NotificationManager();
export const StatusUI = new StatusManager();
export const TreeUI = new TreeUIManager();