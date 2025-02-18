// tree.js
// Enhanced tree component aligned with Django TreeNodeViewSet

import { State } from './state.js';
import { DOM } from './dom.js';
import { API } from './api.js';
import { NotificationUI } from './ui.js';

class TreeManager {
    constructor() {
        // Node state tracking
        this.loadedNodes = new Map(); // Track loaded state by type & id
        this.expandedNodes = new Map(); // Track expanded state by type & id
        this.loading = new Set(); // Track loading operations
        
        // Node type configurations
        this.nodeTypes = {
            project: {
                childType: 'location',
                loadChildren: async (id) => API.Projects.getChildren(id),
                canHaveChildren: true
            },
            location: {
                childType: 'measurement',
                loadChildren: async (id) => API.Locations.getChildren(id),
                canHaveChildren: true
            },
            measurement: {
                childType: null,
                loadChildren: null,
                canHaveChildren: false
            }
        };

        // Bind methods
        this.handleNodeClick = this.handleNodeClick.bind(this);
        this.handleNodeAction = this.handleNodeAction.bind(this);
        this.handleFilter = this.handleFilter.bind(this);

        // Initialize state
        this.initializeState();
    }

    /**
     * Initialize tree state
     * @private
     */
    initializeState() {
        State.set('tree_state', {
            filter: '',
            pagination: {
                offset: 0,
                limit: 20,
                hasMore: false
            },
            expanded: {
                project: [],
                location: [],
                measurement: []
            },
            loaded: {
                project: [],
                location: [],
                measurement: []
            },
            lastUpdate: new Date()
        });
    }

    /**
     * Initialize tree component
     * @param {string} containerId - Container element ID
     * @returns {Promise<void>}
     */
    async initialize(containerId) {
        try {
            this.container = DOM.getElement(containerId);
            if (!this.container) {
                throw new Error(`Container ${containerId} not found`);
            }

            // Setup container structure
            this.setupContainer();

            // Setup event delegation
            this.setupEventListeners();

            // Load initial data
            await this.loadInitialData();

            // Subscribe to state changes
            this.setupStateSubscriptions();

        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Setup container structure
     * @private
     */
    setupContainer() {
        // Clear container
        this.container.innerHTML = '';

        // Add tree structure
        this.container.innerHTML = `
            <div class="tree-header w3-bar w3-light-grey">
                <div class="w3-bar-item">
                    <input type="text" 
                           class="w3-input" 
                           placeholder="Filter nodes..."
                           data-action="filter">
                </div>
                <div class="w3-bar-item w3-right">
                    <button class="w3-button" data-action="expand-all">
                        <i class="bi bi-arrows-expand"></i>
                    </button>
                    <button class="w3-button" data-action="collapse-all">
                        <i class="bi bi-arrows-collapse"></i>
                    </button>
                </div>
            </div>
            <div class="tree-content">
                <div class="tree-wrapper"></div>
                <div class="tree-loader w3-hide">
                    <i class="bi bi-arrow-repeat w3-spin"></i> Loading...
                </div>
                <div class="tree-error w3-hide">
                    <div class="w3-panel w3-pale-red">
                        <h3>Error</h3>
                        <p class="error-message"></p>
                    </div>
                </div>
                <div class="tree-empty w3-hide">
                    <div class="w3-panel w3-pale-yellow">
                        <p>No items found</p>
                    </div>
                </div>
            </div>
        `;

        // Store references to main elements
        this.wrapper = this.container.querySelector('.tree-wrapper');
        this.loader = this.container.querySelector('.tree-loader');
        this.errorContainer = this.container.querySelector('.tree-error');
        this.emptyContainer = this.container.querySelector('.tree-empty');
    }
    /**
     * Setup event listeners using delegation
     * @private
     */
    setupEventListeners() {
        // Node expansion/collapse
        DOM.addDelegate(this.container, 'click', '[data-action="toggle"]', (e, target) => {
            const node = target.closest('.tree-item');
            if (node) {
                e.preventDefault();
                this.toggleNode(node);
            }
        });

        // Node actions (edit, delete, add)
        DOM.addDelegate(this.container, 'click', '[data-node-action]', (e, target) => {
            const node = target.closest('.tree-item');
            if (node) {
                e.preventDefault();
                const action = target.dataset.nodeAction;
                this.handleNodeAction(action, node);
            }
        });

        // Filter input
        const filterInput = this.container.querySelector('[data-action="filter"]');
        if (filterInput) {
            filterInput.addEventListener('input', DOM.debounce((e) => {
                this.handleFilter(e.target.value);
            }, 300));
        }

        // Expand/Collapse all
        DOM.addDelegate(this.container, 'click', '[data-action="expand-all"]', () => {
            this.expandAll();
        });

        DOM.addDelegate(this.container, 'click', '[data-action="collapse-all"]', () => {
            this.collapseAll();
        });

        // Load more on scroll
        this.wrapper.addEventListener('scroll', DOM.debounce(() => {
            if (this.shouldLoadMore()) {
                this.loadMore();
            }
        }, 100));
    }

    /**
     * Setup state subscriptions
     * @private
     */
    setupStateSubscriptions() {
        // Subscribe to filter changes
        State.subscribe('tree_state', (newState, oldState) => {
            if (newState.filter !== oldState?.filter) {
                const filterInput = this.container.querySelector('[data-action="filter"]');
                if (filterInput && filterInput.value !== newState.filter) {
                    filterInput.value = newState.filter;
                }
            }
        });

        // Subscribe to expanded state changes
        State.subscribe('tree_state', (newState, oldState) => {
            const newExpanded = newState.expanded;
            const oldExpanded = oldState?.expanded || {};

            // Handle newly expanded nodes
            Object.entries(newExpanded).forEach(([type, ids]) => {
                const oldIds = oldExpanded[type] || [];
                const addedIds = ids.filter(id => !oldIds.includes(id));
                addedIds.forEach(id => this.ensureNodeExpanded(type, id));
            });
        });
    }

    /**
     * Load initial data
     * @private
     */
    async loadInitialData() {
        try {
            this.showLoading();

            const state = State.get('tree_state');
            const params = {
                offset: 0,
                limit: state.pagination.limit,
                filter: state.filter
            };

            // Load root level (projects)
            const response = await API.Projects.list(params);
            
            // Update pagination state
            State.update('tree_state', {
                pagination: {
                    offset: params.limit,
                    limit: params.limit,
                    hasMore: response.has_more
                }
            });

            // Render nodes
            await this.renderNodes(response.nodes);

            // Restore expanded state
            await this.restoreExpandedState();

            this.hideLoading();
            this.toggleEmpty(response.nodes.length === 0);

        } catch (error) {
            this.handleError('Load Error', error);
            this.showError(error);
        }
    }

    /**
     * Check if more data should be loaded
     * @private
     */
    shouldLoadMore() {
        const state = State.get('tree_state');
        if (!state.pagination.hasMore || this.loading.has('more')) {
            return false;
        }

        const { scrollTop, scrollHeight, clientHeight } = this.wrapper;
        const threshold = 100; // pixels from bottom
        return (scrollHeight - scrollTop - clientHeight) < threshold;
    }

    /**
     * Load more nodes
     * @private
     */
    async loadMore() {
        if (this.loading.has('more')) return;

        try {
            this.loading.add('more');
            const state = State.get('tree_state');
            
            const params = {
                offset: state.pagination.offset,
                limit: state.pagination.limit,
                filter: state.filter
            };

            const response = await API.Projects.list(params);

            // Update pagination state
            State.update('tree_state', {
                pagination: {
                    offset: state.pagination.offset + params.limit,
                    limit: params.limit,
                    hasMore: response.has_more
                }
            });

            // Append new nodes
            await this.renderNodes(response.nodes, true);

        } catch (error) {
            this.handleError('Load More Error', error);
            NotificationUI.show({
                message: 'Error loading more items',
                type: 'error'
            });
        } finally {
            this.loading.delete('more');
        }
    }
    /**
     * Render tree nodes
     * @param {Array} nodes - Nodes to render
     * @param {boolean} [append=false] - Whether to append or replace
     * @private
     */
    async renderNodes(nodes, append = false) {
        if (!append) {
            this.wrapper.innerHTML = '';
        }

        const fragment = document.createDocumentFragment();
        
        for (const node of nodes) {
            const element = this.createNodeElement(node);
            fragment.appendChild(element);

            // If node was previously expanded, load its children
            const type = node.type || 'project';
            if (this.isNodeExpanded(type, node.id)) {
                await this.loadNodeChildren(node.id, type, element);
            }
        }

        this.wrapper.appendChild(fragment);
    }

    /**
     * Create node element
     * @param {Object} node - Node data
     * @private
     */
    createNodeElement(node) {
        const type = node.type || 'project';
        const typeConfig = this.nodeTypes[type];
        const canHaveChildren = typeConfig.canHaveChildren;

        const template = document.createElement('template');
        template.innerHTML = `
            <div class="tree-item w3-hover-light-grey" 
                 data-id="${node.id}" 
                 data-type="${type}">
                <div class="tree-item-content w3-bar">
                    ${canHaveChildren ? `
                        <button class="w3-bar-item w3-button toggle-btn" 
                                data-action="toggle">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                    ` : `
                        <span class="w3-bar-item spacer"></span>
                    `}
                    
                    <div class="w3-bar-item item-data">
                        <span class="item-name">${node.name}</span>
                        ${node.description ? `
                            <span class="item-description w3-small w3-text-grey">
                                ${node.description}
                            </span>
                        ` : ''}
                    </div>

                    <div class="w3-bar-item w3-right item-actions">
                        <button class="w3-button" 
                                data-node-action="edit" 
                                title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        
                        ${canHaveChildren ? `
                            <button class="w3-button" 
                                    data-node-action="add" 
                                    title="Add child">
                                <i class="bi bi-plus"></i>
                            </button>
                        ` : ''}
                        
                        <button class="w3-button" 
                                data-node-action="delete" 
                                title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>

                ${canHaveChildren ? `
                    <div class="children-container w3-hide">
                        <div class="w3-panel w3-center loading-indicator w3-hide">
                            <i class="bi bi-arrow-repeat w3-spin"></i> Loading...
                        </div>
                        <div class="children-wrapper"></div>
                    </div>
                ` : ''}
            </div>
        `;

        return template.content.firstElementChild;
    }

    /**
     * Toggle node expansion state
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async toggleNode(nodeElement) {
        const nodeId = nodeElement.dataset.id;
        const nodeType = nodeElement.dataset.type;
        const typeConfig = this.nodeTypes[nodeType];

        if (!typeConfig.canHaveChildren || this.loading.has(nodeId)) {
            return;
        }

        const childrenContainer = nodeElement.querySelector('.children-container');
        const toggleButton = nodeElement.querySelector('.toggle-btn i');
        
        if (!childrenContainer || !toggleButton) return;

        const isExpanding = childrenContainer.classList.contains('w3-hide');
        
        try {
            // Update button state immediately
            toggleButton.className = isExpanding ? 
                'bi bi-chevron-down' : 'bi bi-chevron-right';

            if (isExpanding) {
                // Show container before loading
                childrenContainer.classList.remove('w3-hide');
                
                // Load children if not already loaded
                if (!this.isNodeLoaded(nodeType, nodeId)) {
                    await this.loadNodeChildren(nodeId, nodeType, nodeElement);
                }

                // Update expanded state
                this.setNodeExpanded(nodeType, nodeId, true);
            } else {
                // Collapse with animation
                const height = childrenContainer.scrollHeight;
                childrenContainer.style.height = height + 'px';
                
                requestAnimationFrame(() => {
                    childrenContainer.style.height = '0';
                    
                    setTimeout(() => {
                        childrenContainer.classList.add('w3-hide');
                        childrenContainer.style.height = '';
                        
                        // Update expanded state
                        this.setNodeExpanded(nodeType, nodeId, false);
                    }, 300);
                });
            }

        } catch (error) {
            this.handleError('Toggle Error', error);
            // Revert button state on error
            toggleButton.className = 'bi bi-chevron-right';
        }
    }
    /**
     * Load children for a node
     * @param {string} nodeId - Parent node ID
     * @param {string} nodeType - Parent node type
     * @param {HTMLElement} nodeElement - Parent node element
     * @private
     */
    async loadNodeChildren(nodeId, nodeType, nodeElement) {
        if (this.loading.has(nodeId)) return;

        const typeConfig = this.nodeTypes[nodeType];
        if (!typeConfig.loadChildren) return;

        const childrenContainer = nodeElement.querySelector('.children-container');
        const loadingIndicator = childrenContainer?.querySelector('.loading-indicator');
        const childrenWrapper = childrenContainer?.querySelector('.children-wrapper');
        
        if (!childrenContainer || !loadingIndicator || !childrenWrapper) return;

        try {
            this.loading.add(nodeId);
            loadingIndicator.classList.remove('w3-hide');

            // Load children data
            const response = await typeConfig.loadChildren(nodeId);
            
            // Clear existing children
            childrenWrapper.innerHTML = '';
            
            // Create and append child nodes
            const fragment = document.createDocumentFragment();
            for (const child of response.nodes) {
                const childElement = this.createNodeElement({
                    ...child,
                    type: typeConfig.childType
                });
                fragment.appendChild(childElement);
            }
            childrenWrapper.appendChild(fragment);

            // Update loaded state
            this.setNodeLoaded(nodeType, nodeId, true);

        } catch (error) {
            this.handleError('Load Children Error', error);
            childrenContainer.classList.add('w3-hide');
            NotificationUI.show({
                message: `Error loading ${typeConfig.childType}s`,
                type: 'error'
            });
        } finally {
            this.loading.delete(nodeId);
            loadingIndicator.classList.add('w3-hide');
        }
    }

    /**
     * State tracking methods
     */
    isNodeExpanded(type, id) {
        const state = State.get('tree_state');
        return state.expanded[type]?.includes(id) || false;
    }

    setNodeExpanded(type, id, expanded) {
        const state = State.get('tree_state');
        const expandedIds = new Set(state.expanded[type] || []);
        
        if (expanded) {
            expandedIds.add(id);
        } else {
            expandedIds.delete(id);
        }

        State.update('tree_state', {
            expanded: {
                ...state.expanded,
                [type]: Array.from(expandedIds)
            }
        });
    }

    isNodeLoaded(type, id) {
        const state = State.get('tree_state');
        return state.loaded[type]?.includes(id) || false;
    }

    setNodeLoaded(type, id, loaded) {
        const state = State.get('tree_state');
        const loadedIds = new Set(state.loaded[type] || []);
        
        if (loaded) {
            loadedIds.add(id);
        } else {
            loadedIds.delete(id);
        }

        State.update('tree_state', {
            loaded: {
                ...state.loaded,
                [type]: Array.from(loadedIds)
            }
        });
    }

    /**
     * Error handling and UI state methods
     */
    handleError(context, error) {
        console.error(`Tree Error (${context}):`, error);
        
        // Update error state
        State.update('tree_state', {
            error: {
                context,
                message: error.message,
                timestamp: new Date()
            }
        });
    }

    showError(error) {
        if (!this.errorContainer) return;

        const messageEl = this.errorContainer.querySelector('.error-message');
        if (messageEl) {
            messageEl.textContent = error.message;
        }
        
        this.errorContainer.classList.remove('w3-hide');
        this.loader.classList.add('w3-hide');
    }

    showLoading() {
        if (!this.loader) return;
        this.loader.classList.remove('w3-hide');
        this.errorContainer?.classList.add('w3-hide');
    }

    hideLoading() {
        this.loader?.classList.add('w3-hide');
    }

    toggleEmpty(show) {
        if (!this.emptyContainer) return;
        this.emptyContainer.classList.toggle('w3-hide', !show);
    }

    /**
     * Clean up resources
     */
    destroy() {
        // Clear state
        this.loadedNodes.clear();
        this.expandedNodes.clear();
        this.loading.clear();

        // Remove event listeners (DOM utility handles this)
        if (this.container) {
            this.container.innerHTML = '';
        }

        // Clear state
        State.update('tree_state', {
            filter: '',
            pagination: {
                offset: 0,
                limit: 20,
                hasMore: false
            },
            expanded: {
                project: [],
                location: [],
                measurement: []
            },
            loaded: {
                project: [],
                location: [],
                measurement: []
            },
            lastUpdate: new Date()
        });
    }
}

// Export single instance
export const Tree = new TreeManager();