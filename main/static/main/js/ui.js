// ui.js
// Enhanced UI management and interaction utilities

import { State } from './state.js';

const UI_STATE_KEY = 'ui_state';

/**
 * Notification management class
 */
class NotificationManager {
    constructor() {
        this.container = null;
        this.queue = [];
        this.activeNotifications = new Set();
        this.maxNotifications = 3;
        this.initialize();
    }

    /**
     * Initialize notification container
     */
    initialize() {
        // Create container if it doesn't exist
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'notification-container w3-display-topright';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
            `;
            document.body.appendChild(this.container);
        }

        // Initialize UI state
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
            position: config.position || 'top-right',
            closeable: config.closeable !== false,
            timestamp: new Date(),
            ...config
        };

        // Add to queue or show immediately
        if (this.activeNotifications.size >= this.maxNotifications) {
            this.queue.push(notification);
            this._updateState();
        } else {
            this._showNotification(notification);
        }
    }

    /**
     * Show a notification element
     * @private
     */
    _showNotification(notification) {
        const element = this._createNotificationElement(notification);
        this.container.appendChild(element);
        this.activeNotifications.add(notification.id);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            element.style.transform = 'translateX(0)';
            element.style.opacity = '1';
        });

        // Set up auto-removal
        if (notification.duration > 0) {
            setTimeout(() => {
                this.remove(notification.id);
            }, notification.duration);
        }

        this._updateState();
    }

    /**
     * Create a notification element
     * @private
     */
    _createNotificationElement(notification) {
        const element = document.createElement('div');
        element.id = notification.id;
        element.className = `w3-panel notification ${this._getTypeClass(notification.type)}`;
        element.style.cssText = `
            transition: all 0.3s ease-in-out;
            transform: translateX(100%);
            opacity: 0;
            margin: 8px;
            position: relative;
            overflow: hidden;
        `;

        // Add progress bar if duration > 0
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

        // Add content
        const content = document.createElement('div');
        content.className = 'notification-content w3-padding';
        content.innerHTML = `
            <div class="notification-message">
                ${this._getTypeIcon(notification.type)}
                ${notification.message}
            </div>
        `;
        element.appendChild(content);

        // Add close button if closeable
        if (notification.closeable) {
            const closeButton = document.createElement('button');
            closeButton.className = 'w3-button w3-hover-none w3-hover-text-white notification-close';
            closeButton.innerHTML = '×';
            closeButton.onclick = () => this.remove(notification.id);
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
     * Remove a notification
     * @param {string} id - Notification ID
     */
    remove(id) {
        const element = document.getElementById(id);
        if (!element) return;

        // Trigger exit animation
        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';

        // Remove after animation
        setTimeout(() => {
            element.remove();
            this.activeNotifications.delete(id);

            // Show next notification from queue
            if (this.queue.length > 0 && 
                this.activeNotifications.size < this.maxNotifications) {
                const next = this.queue.shift();
                this._showNotification(next);
            }

            this._updateState();
        }, 300);
    }

    /**
     * Clear all notifications
     */
    clear() {
        this.activeNotifications.forEach(id => this.remove(id));
        this.queue = [];
        this._updateState();
    }

    /**
     * Get notification type class
     * @private
     */
    _getTypeClass(type) {
        const classes = {
            success: 'w3-pale-green w3-border-green',
            error: 'w3-pale-red w3-border-red',
            warning: 'w3-pale-yellow w3-border-yellow',
            info: 'w3-pale-blue w3-border-blue'
        };
        return classes[type] || classes.info;
    }

    /**
     * Get notification type icon
     * @private
     */
    _getTypeIcon(type) {
        const icons = {
            success: '<i class="bi bi-check-circle"></i>',
            error: '<i class="bi bi-x-circle"></i>',
            warning: '<i class="bi bi-exclamation-triangle"></i>',
            info: '<i class="bi bi-info-circle"></i>'
        };
        return icons[type] || icons.info;
    }

    /**
     * Update UI state
     * @private
     */
    _updateState() {
        State.update(UI_STATE_KEY, {
            notifications: {
                active: Array.from(this.activeNotifications),
                queue: this.queue,
                lastUpdate: new Date()
            }
        });
    }
}
// ui.js - Part 2
// Tree UI management and shared utilities

/**
 * Tree UI management class
 */
class TreeUIManager {
    constructor() {
        this.activeNodes = new Set();
        this.selectedNode = null;
        this.dragState = null;
        this._bindEvents();
    }

    /**
     * Create a new tree item
     * @param {Object} config - Tree item configuration
     * @returns {HTMLElement} Created tree item
     */
    createTreeItem({ type, id, name, fields = [], parent = null, hasChildren = false }) {
        const item = document.createElement('div');
        item.className = 'tree-item w3-hover-light-grey';
        item.dataset.type = type;
        item.dataset.id = id;
        
        const content = document.createElement('div');
        content.className = 'tree-text';
        content.id = `id_form-${type}-${id}`;

        // Add expand/collapse button if has children
        if (hasChildren) {
            const toggleBtn = this.createToggleButton(type, id);
            content.appendChild(toggleBtn);
        }

        // Add main content
        content.appendChild(this.createItemContent(type, id, name, fields));

        // Add action menu
        content.appendChild(this.createActionMenu(type, id));

        item.appendChild(content);
        
        // Add drop zone if item can have children
        if (hasChildren) {
            item.appendChild(this.createDropZone(type, id));
        }

        return item;
    }

    /**
     * Create toggle button for expanding/collapsing
     * @private
     */
    createToggleButton(type, id) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'w3-button';
        button.onclick = () => this.toggleNode(`id_${type}-${id}`);
        button.innerHTML = '<i class="bi bi-chevron-right"></i>';
        return button;
    }

    /**
     * Create tree item content
     * @private
     */
    createItemContent(type, id, name, fields) {
        const container = document.createElement('div');
        container.className = 'fields-container';

        fields.forEach(field => {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`;
            input.name = field;
            input.value = field === 'name' ? name : '';
            input.className = 'tree-item-field';
            input.readOnly = true;
            input.style.display = field === 'name' ? 'inline' : 'none';
            container.appendChild(input);
        });

        return container;
    }

    /**
     * Create action menu for tree item
     * @private
     */
    createActionMenu(type, id) {
        const menu = document.createElement('div');
        menu.className = 'item-actions';

        const button = document.createElement('button');
        button.className = 'w3-button';
        button.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
        menu.appendChild(button);

        const dropdown = document.createElement('div');
        dropdown.className = 'w3-dropdown-content w3-bar-block w3-border';
        
        // Add standard actions
        this.addMenuItem(dropdown, 'edit', 'Edit', 'pencil', type, id);
        this.addMenuItem(dropdown, 'delete', 'Delete', 'trash', type, id);

        // Add type-specific actions
        if (type === 'location') {
            this.addMenuItem(dropdown, 'add-measurement', 'Add Measurement', 'plus', type, id);
        }

        menu.appendChild(dropdown);
        return menu;
    }

    /**
     * Add menu item to dropdown
     * @private
     */
    addMenuItem(dropdown, action, text, icon, type, id) {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'w3-bar-item w3-button';
        item.innerHTML = `<i class="bi bi-${icon}"></i> ${text}`;
        item.onclick = (e) => {
            e.preventDefault();
            this.handleAction(action, type, id);
        };
        dropdown.appendChild(item);
    }

    /**
     * Create drop zone for drag and drop
     * @private
     */
    createDropZone(type, id) {
        const dropZone = document.createElement('div');
        dropZone.className = 'tree-dropzone';
        dropZone.dataset.type = type;
        dropZone.dataset.parentId = id;

        // Add drag and drop event listeners
        dropZone.addEventListener('dragover', e => this.handleDragOver(e));
        dropZone.addEventListener('dragleave', e => this.handleDragLeave(e));
        dropZone.addEventListener('drop', e => this.handleDrop(e));

        return dropZone;
    }

    /**
     * Toggle tree node expansion
     * @param {string} nodeId - Node identifier
     */
    toggleNode(nodeId) {
        const node = document.getElementById(nodeId);
        const icon = document.getElementById(`id_chevronIcon-${nodeId}`);
        if (!node || !icon) return;

        const isExpanded = node.classList.contains('w3-show');
        
        // Toggle node
        node.classList.toggle('w3-show');
        node.classList.toggle('w3-hide');
        
        // Update icon
        icon.className = isExpanded ? 
            "bi bi-chevron-right" : 
            "bi bi-chevron-down";

        // Update active nodes
        if (isExpanded) {
            this.activeNodes.delete(nodeId);
        } else {
            this.activeNodes.add(nodeId);
        }

        // Update state
        this._updateTreeState();
    }

    /**
     * Handle tree item action
     * @private
     */
    handleAction(action, type, id) {
        const handlers = {
            edit: () => this.emit('edit', { type, id }),
            delete: () => this.emit('delete', { type, id }),
            'add-measurement': () => this.emit('add-measurement', { type, id })
        };

        const handler = handlers[action];
        if (handler) {
            handler();
        }
    }

    /**
     * Handle drag over event
     * @private
     */
    handleDragOver(event) {
        event.preventDefault();
        const dropZone = event.target.closest('.tree-dropzone');
        if (dropZone && this._isValidDrop(dropZone)) {
            dropZone.classList.add('tree-dropzone-active');
        }
    }

    /**
     * Handle drag leave event
     * @private
     */
    handleDragLeave(event) {
        const dropZone = event.target.closest('.tree-dropzone');
        if (dropZone) {
            dropZone.classList.remove('tree-dropzone-active');
        }
    }

    /**
     * Handle drop event
     * @private
     */
    handleDrop(event) {
        event.preventDefault();
        const dropZone = event.target.closest('.tree-dropzone');
        if (!dropZone || !this.dragState) return;

        dropZone.classList.remove('tree-dropzone-active');

        if (this._isValidDrop(dropZone)) {
            this.emit('move', {
                itemType: this.dragState.type,
                itemId: this.dragState.id,
                newParentType: dropZone.dataset.type,
                newParentId: dropZone.dataset.parentId
            });
        }

        this.dragState = null;
    }

    /**
     * Check if drop is valid
     * @private
     */
    _isValidDrop(dropZone) {
        if (!this.dragState) return false;

        const validMoves = {
            location: ['project'],
            measurement: ['location']
        };

        return validMoves[this.dragState.type]?.includes(dropZone.dataset.type);
    }

    /**
     * Bind events
     * @private
     */
    _bindEvents() {
        // Make tree items draggable
        document.addEventListener('mousedown', e => {
            const treeItem = e.target.closest('.tree-item');
            if (treeItem && !e.target.closest('.item-actions')) {
                this.dragState = {
                    type: treeItem.dataset.type,
                    id: treeItem.dataset.id
                };
            }
        });

        document.addEventListener('mouseup', () => {
            this.dragState = null;
        });
    }

    /**
     * Update tree state
     * @private
     */
    _updateTreeState() {
        State.update(UI_STATE_KEY, {
            tree: {
                activeNodes: Array.from(this.activeNodes),
                selectedNode: this.selectedNode,
                lastUpdate: new Date()
            }
        });
    }

    /**
     * Emit custom event
     * @private
     */
    emit(event, detail) {
        document.dispatchEvent(new CustomEvent(`tree:${event}`, { detail }));
    }
}
// ui.js - Part 3
// Shared utilities, status indicators, and exports

/**
 * Status indicator management class
 */
class StatusUIManager {
    constructor() {
        this.activeStatuses = new Map();
        this.container = null;
        this.initialize();
    }

    /**
     * Initialize status container
     */
    initialize() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'status-container w3-display-bottomright';
            this.container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9998;
            `;
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show status indicator
     * @param {string} message - Status message
     * @param {Object} options - Display options
     */
    show(message, options = {}) {
        const config = {
            id: options.id || `status-${Date.now()}`,
            type: options.type || 'info',
            spinner: options.spinner !== false,
            timeout: options.timeout || 0,
            ...options
        };

        // Create or update status element
        const status = this._createStatusElement(message, config);
        this.container.appendChild(status);
        this.activeStatuses.set(config.id, { element: status, config });

        // Handle timeout
        if (config.timeout > 0) {
            setTimeout(() => this.hide(config.id), config.timeout);
        }

        this._updateState();
    }

    /**
     * Hide status indicator
     * @param {string} id - Status identifier
     */
    hide(id) {
        const status = this.activeStatuses.get(id);
        if (!status) return;

        status.element.style.opacity = '0';
        setTimeout(() => {
            status.element.remove();
            this.activeStatuses.delete(id);
            this._updateState();
        }, 300);
    }

    /**
     * Create status element
     * @private
     */
    _createStatusElement(message, config) {
        const element = document.createElement('div');
        element.className = `status-indicator ${this._getTypeClass(config.type)}`;
        element.style.cssText = `
            margin: 8px;
            padding: 12px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            transition: opacity 0.3s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

        // Add spinner if requested
        if (config.spinner) {
            const spinner = document.createElement('div');
            spinner.className = 'w3-spin';
            spinner.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
            spinner.style.marginRight = '8px';
            element.appendChild(spinner);
        }

        // Add message
        const messageElement = document.createElement('span');
        messageElement.textContent = message;
        element.appendChild(messageElement);

        return element;
    }

    /**
     * Get status type class
     * @private
     */
    _getTypeClass(type) {
        const classes = {
            info: 'w3-blue',
            success: 'w3-green',
            warning: 'w3-yellow',
            error: 'w3-red'
        };
        return classes[type] || classes.info;
    }

    /**
     * Update UI state
     * @private
     */
    _updateState() {
        State.update(UI_STATE_KEY, {
            status: {
                active: Array.from(this.activeStatuses.keys()),
                lastUpdate: new Date()
            }
        });
    }
}

/**
 * Shared UI utilities
 */
class UIUtilities {
    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Format date for display
     * @param {Date|string} date - Date to format
     * @param {string} format - Format style
     * @returns {string} Formatted date
     */
    static formatDate(date, format = 'medium') {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        const options = {
            short: { 
                year: 'numeric', 
                month: 'numeric', 
                day: 'numeric' 
            },
            medium: { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            },
            long: { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }
        };

        return d.toLocaleString(undefined, options[format] || options.medium);
    }

    /**
     * Format file size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    static formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Create loading spinner
     * @param {string} [size='medium'] - Spinner size
     * @returns {HTMLElement} Spinner element
     */
    static createSpinner(size = 'medium') {
        const spinner = document.createElement('div');
        spinner.className = 'w3-spin loading-spinner';
        
        const sizes = {
            small: '16px',
            medium: '24px',
            large: '32px'
        };

        spinner.style.cssText = `
            width: ${sizes[size]};
            height: ${sizes[size]};
            display: inline-block;
        `;

        spinner.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
        return spinner;
    }

    /**
     * Add tooltip to element
     * @param {HTMLElement} element - Target element
     * @param {string} text - Tooltip text
     * @param {Object} options - Tooltip options
     */
    static addTooltip(element, text, options = {}) {
        const config = {
            position: 'top',
            delay: 500,
            ...options
        };

        element.dataset.tooltip = text;
        element.dataset.tooltipPosition = config.position;

        let timeout;
        let tooltipElement;

        element.addEventListener('mouseenter', () => {
            timeout = setTimeout(() => {
                tooltipElement = document.createElement('div');
                tooltipElement.className = 'w3-tooltip';
                tooltipElement.textContent = text;
                
                const rect = element.getBoundingClientRect();
                const positions = {
                    top: { top: rect.top - 30, left: rect.left + (rect.width / 2) },
                    bottom: { top: rect.bottom + 10, left: rect.left + (rect.width / 2) },
                    left: { top: rect.top + (rect.height / 2), left: rect.left - 10 },
                    right: { top: rect.top + (rect.height / 2), left: rect.right + 10 }
                };

                const pos = positions[config.position];
                tooltipElement.style.cssText = `
                    position: fixed;
                    top: ${pos.top}px;
                    left: ${pos.left}px;
                    transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.8);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 10000;
                    pointer-events: none;
                `;

                document.body.appendChild(tooltipElement);
            }, config.delay);
        });

        element.addEventListener('mouseleave', () => {
            clearTimeout(timeout);
            if (tooltipElement) {
                tooltipElement.remove();
                tooltipElement = null;
            }
        });
    }
}

// Export UI managers and utilities
export const NotificationUI = new NotificationManager();
export const TreeUI = new TreeUIManager();
export const StatusUI = new StatusUIManager();
export const Utilities = UIUtilities;