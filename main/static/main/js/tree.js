// main/static/main/js/tree.js

import { State } from './state.js';
import { DOM } from './dom.js';
import { API } from './api.js';
import { NotificationUI } from './ui.js';

class TreeManager {
    constructor() {
        // Track loaded states
        this.loadedNodes = new Set();
        this.loading = new Set();
        
        // Track expanded states
        this.expandedNodes = new Set();
        
        // Filter state
        this.currentFilter = '';
        
        // Bind methods
        this.handleTreeClick = this.handleTreeClick.bind(this);
        this.handleFilter = this.handleFilter.bind(this);
        
        // Initialize state
        State.set('tree_state', {
            filter: '',
            expanded: [],
            loaded: [],
            lastUpdate: new Date()
        });
    }

    async initialize(containerId = 'tree-container') {
        this.container = DOM.getElement(containerId);
        if (!this.container) {
            throw new Error(`Container ${containerId} not found`);
        }

        // Set up event listeners
        this.setupEventListeners();
        
        // Set up filter
        this.setupFilter();
        
        // Load initial state
        await this.loadInitialState();
    }

    setupEventListeners() {
        // Tree node toggling
        DOM.addDelegate(this.container, 'click', '[data-action="toggle"]', 
            async (event, element) => {
                const node = element.closest('.tree-item');
                if (node) {
                    await this.toggleNode(node);
                }
            }
        );

        // Other tree actions (edit, delete, etc)
        DOM.addDelegate(this.container, 'click', '[data-action]',
            (event, element) => {
                const action = element.dataset.action;
                if (action !== 'toggle') {
                    this.handleAction(action, element);
                }
            }
        );
    }

    setupFilter() {
        const filterInput = DOM.getElement('[data-action="filter-projects"]');
        if (filterInput) {
            // Debounced filter handler
            filterInput.addEventListener('input', 
                DOM.debounce(() => {
                    this.handleFilter(filterInput.value);
                }, 300)
            );

            // Clear filter
            DOM.addDelegate(this.container, 'click', '[data-action="clear-filter"]',
                () => {
                    filterInput.value = '';
                    this.handleFilter('');
                }
            );
        }
    }

    async loadInitialState() {
        try {
            // Show loading state
            this.container.classList.add('loading');
            
            // Get initial projects with current filter
            const response = await API.get('/api/projects/', {
                params: { filter: this.currentFilter }
            });

            // Update UI
            this.renderProjects(response.data);
            
            // Restore expanded states
            const expandedNodes = State.get('tree_state')?.expanded || [];
            for (const nodeId of expandedNodes) {
                const node = DOM.getElement(nodeId);
                if (node) {
                    await this.toggleNode(node, true);
                }
            }

        } catch (error) {
            NotificationUI.show({
                message: `Error loading projects: ${error.message}`,
                type: 'error'
            });
        } finally {
            this.container.classList.remove('loading');
        }
    }

    async toggleNode(node, skipAnimation = false) {
        const nodeId = node.dataset.id;
        const nodeType = node.dataset.type;
        const childrenContainer = node.querySelector('.children-container');
        const toggleButton = node.querySelector('[data-action="toggle"] i');
        
        if (!childrenContainer || this.loading.has(nodeId)) {
            return;
        }

        try {
            const isExpanding = !this.expandedNodes.has(nodeId);
            
            // Update toggle button
            toggleButton.className = isExpanding ? 
                'bi bi-chevron-down' : 'bi bi-chevron-right';

            // Show/hide children with optional animation
            if (!skipAnimation) {
                childrenContainer.style.transition = 'height 0.3s ease';
                childrenContainer.style.height = 
                    isExpanding ? '0' : childrenContainer.scrollHeight + 'px';
            }
            
            if (isExpanding) {
                childrenContainer.classList.remove('w3-hide');
                
                // Load children if not loaded
                if (!this.loadedNodes.has(nodeId)) {
                    await this.loadChildren(nodeId, nodeType, childrenContainer);
                }
                
                this.expandedNodes.add(nodeId);
                if (!skipAnimation) {
                    childrenContainer.style.height = 
                        childrenContainer.scrollHeight + 'px';
                }
            } else {
                if (!skipAnimation) {
                    childrenContainer.style.height = '0';
                    await new Promise(resolve => 
                        setTimeout(resolve, 300)
                    );
                }
                childrenContainer.classList.add('w3-hide');
                this.expandedNodes.delete(nodeId);
            }

            // Update state
            State.update('tree_state', {
                expanded: Array.from(this.expandedNodes),
                lastUpdate: new Date()
            });

        } catch (error) {
            NotificationUI.show({
                message: `Error toggling node: ${error.message}`,
                type: 'error'
            });
        } finally {
            // Clean up animation styles
            if (!skipAnimation) {
                childrenContainer.style.transition = '';
                childrenContainer.style.height = '';
            }
        }
    }

    async loadChildren(nodeId, nodeType, container) {
        if (this.loading.has(nodeId) || this.loadedNodes.has(nodeId)) {
            return;
        }

        try {
            this.loading.add(nodeId);
            this.showLoading(container);

            // Get children from API
            const response = await API.get(
                `/api/${nodeType}s/children/`, 
                { params: { parent_id: nodeId } }
            );

            // Render children
            const fragment = document.createDocumentFragment();
            response.data.forEach(child => {
                const childElement = this.createNodeElement(child);
                fragment.appendChild(childElement);
            });

            // Clear loading placeholder and append children
            const childrenWrapper = container.querySelector('.children-wrapper');
            childrenWrapper.innerHTML = '';
            childrenWrapper.appendChild(fragment);

            // Update state
            this.loadedNodes.add(nodeId);
            State.update('tree_state', {
                loaded: [...this.loadedNodes],
                lastUpdate: new Date()
            });

        } catch (error) {
            NotificationUI.show({
                message: `Error loading children: ${error.message}`,
                type: 'error'
            });
            this.showError(container, error);
        } finally {
            this.loading.delete(nodeId);
            this.hideLoading(container);
        }
    }

    // UI helper methods
    showLoading(container) {
        const loadingEl = container.querySelector('.loading-state');
        if (loadingEl) {
            loadingEl.classList.remove('w3-hide');
        }
    }

    hideLoading(container) {
        const loadingEl = container.querySelector('.loading-state');
        if (loadingEl) {
            loadingEl.classList.add('w3-hide');
        }
    }

    showError(container, error) {
        const errorEl = container.querySelector('.error-state');
        if (errorEl) {
            const messageEl = errorEl.querySelector('.error-message');
            if (messageEl) {
                messageEl.textContent = error.message;
            }
            errorEl.classList.remove('w3-hide');
        }
    }

    // New methods to complete the implementation

    async handleFilter(filterValue) {
        this.currentFilter = filterValue.trim();
        
        try {
            // Show loading state
            this.container.classList.add('loading');
            
            // Get filtered projects
            const response = await API.get('/api/projects/', {
                params: { filter: this.currentFilter }
            });
            
            // Update UI
            this.renderProjects(response.data);
            
            // Update state
            State.update('tree_state', {
                filter: this.currentFilter,
                lastUpdate: new Date()
            });
            
            // Show no results message if needed
            this.toggleNoResults(response.data.length === 0);
            
        } catch (error) {
            NotificationUI.show({
                message: `Error applying filter: ${error.message}`,
                type: 'error'
            });
        } finally {
            this.container.classList.remove('loading');
        }
    }

    handleAction(action, element) {
        const node = element.closest('.tree-item');
        if (!node) return;

        const nodeId = node.dataset.id;
        const nodeType = node.dataset.type;

        switch (action) {
            case 'edit':
                this.handleEdit(nodeId, nodeType);
                break;
            case 'delete':
                this.handleDelete(nodeId, nodeType, node);
                break;
            case 'add-child':
                this.handleAddChild(nodeId, nodeType);
                break;
        }
    }

    async handleEdit(nodeId, nodeType) {
        try {
            // Fetch node details
            const response = await API.get(`/api/${nodeType}s/${nodeId}/`);
            
            // Show edit modal/form (implementation depends on your UI library)
            const modal = document.getElementById('edit-modal');
            if (modal) {
                // Populate form with node data
                const form = modal.querySelector('form');
                if (form) {
                    Object.entries(response.data).forEach(([key, value]) => {
                        const input = form.elements[key];
                        if (input) {
                            input.value = value;
                        }
                    });
                }
                
                // Show modal
                modal.classList.remove('w3-hide');
            }
        } catch (error) {
            NotificationUI.show({
                message: `Error loading ${nodeType} details: ${error.message}`,
                type: 'error'
            });
        }
    }

    async handleDelete(nodeId, nodeType, nodeElement) {
        if (confirm(`Are you sure you want to delete this ${nodeType}?`)) {
            try {
                await API.delete(`/api/${nodeType}s/${nodeId}/`);
                
                // Remove node from UI
                nodeElement.remove();
                
                // Clean up state
                this.loadedNodes.delete(nodeId);
                this.expandedNodes.delete(nodeId);
                
                // Update state
                State.update('tree_state', {
                    loaded: [...this.loadedNodes],
                    expanded: [...this.expandedNodes],
                    lastUpdate: new Date()
                });
                
                NotificationUI.show({
                    message: `${nodeType} deleted successfully`,
                    type: 'success'
                });
            } catch (error) {
                NotificationUI.show({
                    message: `Error deleting ${nodeType}: ${error.message}`,
                    type: 'error'
                });
            }
        }
    }

    async handleAddChild(parentId, parentType) {
        // Show add modal/form (implementation depends on your UI library)
        const modal = document.getElementById('add-modal');
        if (modal) {
            // Set parent info in form
            const form = modal.querySelector('form');
            if (form) {
                const parentInput = form.elements['parent_id'];
                if (parentInput) {
                    parentInput.value = parentId;
                }
            }
            
            // Show modal
            modal.classList.remove('w3-hide');
        }
    }

    renderProjects(projects) {
        // Clear existing content
        const wrapper = this.container.querySelector('.tree-wrapper');
        if (!wrapper) return;
        
        wrapper.innerHTML = '';
        
        // Create and append project nodes
        const fragment = document.createDocumentFragment();
        projects.forEach(project => {
            const projectElement = this.createNodeElement(project);
            fragment.appendChild(projectElement);
        });
        
        wrapper.appendChild(fragment);
    }

    createNodeElement(node) {
        const template = document.createElement('template');
        template.innerHTML = `
            <div class="tree-item" data-id="${node.id}" data-type="${node.type}">
                <div class="tree-item-content">
                    <button class="toggle-btn" data-action="toggle">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                    <span class="item-name">${node.name}</span>
                    <div class="item-actions">
                        <button data-action="edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button data-action="delete">
                            <i class="bi bi-trash"></i>
                        </button>
                        <button data-action="add-child">
                            <i class="bi bi-plus"></i>
                        </button>
                    </div>
                </div>
                <div class="children-container w3-hide">
                    <div class="loading-state w3-hide">
                        <i class="bi bi-arrow-repeat spin"></i> Loading...
                    </div>
                    <div class="error-state w3-hide">
                        <span class="error-message"></span>
                        <button data-action="retry">Retry</button>
                    </div>
                    <div class="children-wrapper"></div>
                </div>
            </div>
        `;
        
        return template.content.firstElementChild;
    }

    toggleNoResults(show) {
        const noResults = this.container.querySelector('.no-results');
        if (noResults) {
            noResults.classList.toggle('w3-hide', !show);
        }
    }
}

export default TreeManager;