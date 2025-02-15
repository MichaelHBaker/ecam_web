// ui.js
// UI utilities and interaction handlers

/**
 * Map to store UI state data
 * @type {Map<string, Object>}
 */
const uiStates = new Map();

/**
 * Tree-related functionality
 */
export const TreeUI = {
    /**
     * Toggles a tree node open/closed
     * @param {string} nodeId - Tree node identifier
     * @returns {void}
     */
    toggleNode: (nodeId) => {
        const node = document.getElementById(nodeId);
        const icon = document.getElementById(`id_chevronIcon-${nodeId}`);
        if (!node || !icon) return;

        const isOpen = node.classList.contains('w3-show');
        
        // Toggle node
        node.classList.toggle('w3-show');
        node.classList.toggle('w3-hide');
        
        // Update icon
        icon.className = isOpen ? 
            "bi bi-chevron-right" : 
            "bi bi-chevron-down";

        // Store state
        uiStates.set(`tree-${nodeId}`, { isOpen: !isOpen });
    },

    /**
     * Creates a new tree item
     * @param {Object} config - Tree item configuration
     * @returns {HTMLElement} Created tree item
     */
    createTreeItem: ({
        type,
        id,
        name,
        fields = [],
        parent = null,
        hasChildren = false
    }) => {
        const item = document.createElement('div');
        item.className = 'tree-item w3-hover-light-grey';
        
        const content = document.createElement('div');
        content.className = 'tree-text';
        content.id = `id_form-${type}-${id}`;

        // Add expand/collapse button if has children
        if (hasChildren) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'w3-button';
            toggleBtn.onclick = () => TreeUI.toggleNode(`id_${type}-${id}`);
            toggleBtn.innerHTML = '<i class="bi bi-chevron-right"></i>';
            content.appendChild(toggleBtn);
        }

        // Add main content
        content.appendChild(TreeUI.createTreeItemContent(type, id, name, fields));

        // Add action menu
        content.appendChild(ActionMenuUI.createActionMenu(type, id));

        item.appendChild(content);
        return item;
    },

    /**
     * Creates the content portion of a tree item
     * @private
     */
    createTreeItemContent: (type, id, name, fields) => {
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
};

/**
 * Action menu functionality
 */
export const ActionMenuUI = {
    /**
     * Creates an action menu
     * @param {string} type - Item type
     * @param {string} id - Item identifier
     * @returns {HTMLElement} Created action menu
     */
    createActionMenu: (type, id) => {
        const menu = document.createElement('div');
        menu.className = 'item-actions';

        const button = document.createElement('button');
        button.className = 'w3-button';
        button.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
        menu.appendChild(button);

        const dropdown = document.createElement('div');
        dropdown.className = 'w3-dropdown-content w3-bar-block w3-border';
        
        // Add standard actions
        dropdown.appendChild(
            ActionMenuUI.createMenuItem('edit', 'Edit', 'pencil', type, id)
        );
        dropdown.appendChild(
            ActionMenuUI.createMenuItem('delete', 'Delete', 'trash', type, id)
        );

        // Add type-specific actions
        if (type === 'location') {
            dropdown.insertBefore(
                ActionMenuUI.createMenuItem('add-measurement', 'Add Measurement', 'plus', type, id),
                dropdown.firstChild
            );
        }

        menu.appendChild(dropdown);
        return menu;
    },

    /**
     * Creates a menu item
     * @private
     */
    createMenuItem: (action, text, icon, type, id) => {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'w3-bar-item w3-button';
        item.innerHTML = `<i class="bi bi-${icon}"></i> ${text}`;
        item.onclick = (e) => {
            e.preventDefault();
            ActionMenuUI.handleAction(action, type, id);
        };
        return item;
    },

    /**
     * Handles menu item actions
     * @private
     */
    handleAction: (action, type, id) => {
        switch (action) {
            case 'edit':
                window.crud.editItem(type, id);
                break;
            case 'delete':
                window.crud.deleteItem(type, id);
                break;
            case 'add-measurement':
                window.crud.showModal(id);
                break;
        }
    }
};

/**
 * Status indicator functionality
 */
export const StatusUI = {
    /**
     * Updates a status indicator
     * @param {string} id - Status indicator ID
     * @param {string} status - New status
     * @param {string} [message] - Optional status message
     * @returns {void}
     */
    updateStatus: (id, status, message = '') => {
        const indicator = document.getElementById(id);
        if (!indicator) return;

        const configs = {
            success: {
                icon: 'check-circle',
                class: 'w3-pale-green w3-border-green',
                prefix: 'Success'
            },
            error: {
                icon: 'exclamation-triangle',
                class: 'w3-pale-red w3-border-red',
                prefix: 'Error'
            },
            warning: {
                icon: 'exclamation-circle',
                class: 'w3-pale-yellow w3-border-yellow',
                prefix: 'Warning'
            },
            info: {
                icon: 'info-circle',
                class: 'w3-pale-blue w3-border-blue',
                prefix: 'Info'
            },
            loading: {
                icon: 'arrow-repeat',
                class: 'w3-pale-blue w3-border-blue',
                prefix: 'Loading'
            }
        };

        const config = configs[status] || configs.info;
        
        indicator.className = `w3-panel w3-leftbar ${config.class}`;
        indicator.innerHTML = `
            <i class="bi bi-${config.icon}"></i>
            ${message || `${config.prefix}...`}
        `;
    },

    /**
     * Shows a progress indicator
     * @param {string} id - Progress indicator ID
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} [message] - Optional progress message
     * @returns {void}
     */
    updateProgress: (id, progress, message = '') => {
        const container = document.getElementById(id);
        if (!container) return;

        // Ensure progress bar exists
        let progressBar = container.querySelector('.w3-progressbar');
        if (!progressBar) {
            container.innerHTML = `
                <div class="w3-progress-container w3-round">
                    <div class="w3-progressbar w3-round">
                        <div class="w3-center w3-text-white"></div>
                    </div>
                </div>
            `;
            progressBar = container.querySelector('.w3-progressbar');
        }

        // Update progress
        const percentage = Math.min(Math.max(progress, 0), 100);
        progressBar.style.width = `${percentage}%`;
        
        const textElement = progressBar.querySelector('.w3-center');
        if (textElement) {
            textElement.textContent = message || `${percentage}%`;
        }

        // Show/hide based on progress
        container.style.display = percentage > 0 && percentage < 100 ? 'block' : 'none';
    }
};

/**
 * Notification functionality
 */
export const NotificationUI = {
    /**
     * Shows a notification
     * @param {Object} config - Notification configuration
     * @returns {void}
     */
    show: ({
        message,
        type = 'info',
        duration = 3000,
        position = 'top-right'
    }) => {
        const notification = document.createElement('div');
        notification.className = `w3-panel notification ${position}`;
        
        // Add appropriate styling based on type
        switch (type) {
            case 'success':
                notification.classList.add('w3-pale-green', 'w3-border-green');
                break;
            case 'error':
                notification.classList.add('w3-pale-red', 'w3-border-red');
                break;
            case 'warning':
                notification.classList.add('w3-pale-yellow', 'w3-border-yellow');
                break;
            default:
                notification.classList.add('w3-pale-blue', 'w3-border-blue');
        }

        notification.innerHTML = `
            <span class="w3-button w3-display-topright" onclick="this.parentElement.remove()">×</span>
            <p>${message}</p>
        `;

        // Add to document
        document.body.appendChild(notification);

        // Remove after duration
        if (duration > 0) {
            setTimeout(() => {
                notification.remove();
            }, duration);
        }
    }
};

/**
 * General UI utilities
 */
export const Utilities = {
    /**
     * Debounces a function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Formats a date for display
     * @param {Date|string} date - Date to format
     * @param {string} [format='medium'] - Format style
     * @returns {string} Formatted date string
     */
    formatDate: (date, format = 'medium') => {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';

        switch (format) {
            case 'short':
                return d.toLocaleDateString();
            case 'long':
                return d.toLocaleDateString(undefined, { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            case 'time':
                return d.toLocaleTimeString();
            default:
                return d.toLocaleString();
        }
    },

    /**
     * Formats a number for display
     * @param {number} num - Number to format
     * @param {Object} [options] - Formatting options
     * @returns {string} Formatted number string
     */
    formatNumber: (num, options = {}) => {
        const {
            decimals = 2,
            thousandsSeparator = ',',
            decimalSeparator = '.'
        } = options;

        return Number(num).toFixed(decimals)
            .replace('.', decimalSeparator)
            .replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
    }
};