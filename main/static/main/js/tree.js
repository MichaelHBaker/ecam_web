// tree.js
// Enhanced tree component aligned with Django TreeNodeViewSet

import { State } from './state.js';
import { DOM } from './dom.js';
import { API } from './api.js';
import { NotificationUI } from './ui.js';

const TREE_STATE_KEY = 'tree_state';

/**
 * Enhanced Tree Manager with proper initialization and safety checks
 */
class TreeManager {
    constructor() {
        this.initialized = false;
        this.container = null;
        this.wrapper = null;
        this.loader = null;
        this.errorContainer = null;
        this.emptyContainer = null;
        
        // Node state tracking
        this.loadedNodes = new Map();    // Track loaded state by type & id
        this.expandedNodes = new Map();  // Track expanded state by type & id
        this.loading = new Set();        // Track loading operations
        
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
    }

    /**
     * Check if tree manager is initialized
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
            throw new Error('Tree Manager must be initialized before use');
        }
    }

    /**
     * Initialize tree manager with dependency checks
     * @param {string} containerId - Container element ID
     * @returns {Promise<TreeManager>} Initialized instance
     */
    async initialize(containerId) {
        if (this.initialized) {
            console.warn('TreeManager already initialized');
            return this;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before TreeManager');
            }
            if (!API.isInitialized()) {
                throw new Error('API must be initialized before TreeManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before TreeManager');
            }

            // Get container
            this.container = DOM.getElement(containerId);
            if (!this.container) {
                throw new Error(`Container ${containerId} not found`);
            }

            // Initialize state
            await this.initializeState();

            // Setup container structure
            await this.setupContainer();

            // Setup event delegation
            await this.setupEventListeners();

            // Setup state subscriptions
            await this.setupStateSubscriptions();

            // Load initial data
            await this.loadInitialData();

            this.initialized = true;
            console.log('TreeManager initialized');

            return this;

        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize tree state
     * @private
     */
    async initializeState() {
        try {
            const initialState = {
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
            };

            await State.set(TREE_STATE_KEY, initialState);

        } catch (error) {
            this.handleError('State Initialization Error', error);
            throw error;
        }
    }

    /**
     * Setup container structure with error handling
     * @private
     */
    async setupContainer() {
        try {
            // Clear container
            this.container.innerHTML = '';

            // Create main structure using DOM utility
            const structure = DOM.createElement('div', {
                className: 'tree-container',
                innerHTML: `
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
                `
            });

            this.container.appendChild(structure);

            // Store references to main elements
            this.wrapper = DOM.getElement('.tree-wrapper', this.container);
            this.loader = DOM.getElement('.tree-loader', this.container);
            this.errorContainer = DOM.getElement('.tree-error', this.container);
            this.emptyContainer = DOM.getElement('.tree-empty', this.container);

            if (!this.wrapper || !this.loader || !this.errorContainer || !this.emptyContainer) {
                throw new Error('Failed to initialize tree container structure');
            }

        } catch (error) {
            this.handleError('Container Setup Error', error);
            throw error;
        }
    }

    /**
     * Handle errors consistently
     * @private
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        console.error(`Tree Error (${context}):`, error);
        
        NotificationUI.show({
            message: `Tree Error: ${error.message}`,
            type: 'error',
            duration: 5000
        });

        try {
            State.update(TREE_STATE_KEY, {
                error: {
                    context,
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                }
            });
        } catch (stateError) {
            console.error('Error updating state with error:', stateError);
        }
    }
    /**
     * Setup event listeners using delegation with enhanced error handling
     * @private
     */
    async setupEventListeners() {
        this._checkInitialized();

        try {
            // Node expansion/collapse
            DOM.addDelegate(this.container, 'click', '[data-action="toggle"]', async (e, target) => {
                try {
                    const node = target.closest('.tree-item');
                    if (node) {
                        e.preventDefault();
                        await this.toggleNode(node);
                    }
                } catch (error) {
                    this.handleError('Toggle Event Error', error);
                }
            });

            // Node actions (edit, delete, add)
            DOM.addDelegate(this.container, 'click', '[data-node-action]', async (e, target) => {
                try {
                    const node = target.closest('.tree-item');
                    if (node) {
                        e.preventDefault();
                        const action = target.dataset.nodeAction;
                        await this.handleNodeAction(action, node);
                    }
                } catch (error) {
                    this.handleError('Node Action Error', error);
                }
            });

            // Filter input with debounce and error handling
            const filterInput = DOM.getElement('[data-action="filter"]', this.container);
            if (filterInput) {
                filterInput.addEventListener('input', DOM.debounce(async (e) => {
                    try {
                        await this.handleFilter(e.target.value);
                    } catch (error) {
                        this.handleError('Filter Error', error);
                    }
                }, 300));
            }

            // Expand/Collapse all
            DOM.addDelegate(this.container, 'click', '[data-action="expand-all"]', async () => {
                try {
                    await this.expandAll();
                } catch (error) {
                    this.handleError('Expand All Error', error);
                }
            });

            DOM.addDelegate(this.container, 'click', '[data-action="collapse-all"]', async () => {
                try {
                    await this.collapseAll();
                } catch (error) {
                    this.handleError('Collapse All Error', error);
                }
            });

            // Load more on scroll with intersection observer
            this.setupInfiniteScroll();

        } catch (error) {
            this.handleError('Event Setup Error', error);
            throw error;
        }
    }

    /**
     * Setup infinite scroll using Intersection Observer
     * @private
     */
    setupInfiniteScroll() {
        try {
            // Create sentinel element
            const sentinel = DOM.createElement('div', {
                className: 'scroll-sentinel',
                style: 'height: 20px;'
            });
            this.wrapper.appendChild(sentinel);

            // Create intersection observer
            const observer = new IntersectionObserver(async (entries) => {
                try {
                    const entry = entries[0];
                    if (entry.isIntersecting && this.shouldLoadMore()) {
                        await this.loadMore();
                    }
                } catch (error) {
                    this.handleError('Infinite Scroll Error', error);
                }
            }, {
                root: this.wrapper,
                threshold: 0.1
            });

            observer.observe(sentinel);

            // Store observer for cleanup
            this._scrollObserver = observer;

        } catch (error) {
            this.handleError('Infinite Scroll Setup Error', error);
        }
    }

    /**
     * Setup state subscriptions with enhanced error handling
     * @private
     */
    async setupStateSubscriptions() {
        try {
            // Subscribe to filter changes
            State.subscribe(TREE_STATE_KEY, async (newState, oldState) => {
                try {
                    if (newState.filter !== oldState?.filter) {
                        const filterInput = DOM.getElement('[data-action="filter"]', this.container);
                        if (filterInput && filterInput.value !== newState.filter) {
                            filterInput.value = newState.filter;
                            await this.refreshTree();
                        }
                    }
                } catch (error) {
                    this.handleError('Filter State Update Error', error);
                }
            });

            // Subscribe to expanded state changes
            State.subscribe(TREE_STATE_KEY, async (newState, oldState) => {
                try {
                    const newExpanded = newState.expanded;
                    const oldExpanded = oldState?.expanded || {};

                    // Handle newly expanded nodes
                    for (const [type, ids] of Object.entries(newExpanded)) {
                        const oldIds = oldExpanded[type] || [];
                        const addedIds = ids.filter(id => !oldIds.includes(id));
                        
                        for (const id of addedIds) {
                            await this.ensureNodeExpanded(type, id);
                        }
                    }
                } catch (error) {
                    this.handleError('Expanded State Update Error', error);
                }
            });

        } catch (error) {
            this.handleError('State Subscription Error', error);
            throw error;
        }
    }

    /**
     * Ensure a node is expanded and visible
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @private
     */
    async ensureNodeExpanded(type, id) {
        try {
            const nodeElement = DOM.getElement(`[data-type="${type}"][data-id="${id}"]`, this.container);
            if (nodeElement) {
                const childrenContainer = nodeElement.querySelector('.children-container');
                if (childrenContainer?.classList.contains('w3-hide')) {
                    await this.toggleNode(nodeElement);
                }
            }
        } catch (error) {
            this.handleError('Node Expansion Error', error);
        }
    }

    /**
     * Handle node action with enhanced error handling
     * @param {string} action - Action type
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async handleNodeAction(action, nodeElement) {
        this._checkInitialized();

        const nodeId = nodeElement.dataset.id;
        const nodeType = nodeElement.dataset.type;

        try {
            // Create custom event
            const actionEvent = new CustomEvent('tree:node:action', {
                detail: {
                    action,
                    nodeId,
                    nodeType,
                    element: nodeElement,
                    timestamp: new Date()
                },
                bubbles: true,
                cancelable: true
            });

            // Dispatch event and check if it was cancelled
            const shouldProceed = nodeElement.dispatchEvent(actionEvent);
            if (!shouldProceed) {
                return;
            }

            // Handle different actions
            switch (action) {
                case 'edit':
                    await this.handleNodeEdit(nodeId, nodeType, nodeElement);
                    break;
                case 'delete':
                    await this.handleNodeDelete(nodeId, nodeType, nodeElement);
                    break;
                case 'add':
                    await this.handleNodeAdd(nodeId, nodeType, nodeElement);
                    break;
                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error) {
            this.handleError(`Node Action Error (${action})`, error);
            NotificationUI.show({
                message: `Failed to ${action} node: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Handle node filter with state update
     * @param {string} value - Filter value
     * @private
     */
    async handleFilter(value) {
        this._checkInitialized();

        try {
            await State.update(TREE_STATE_KEY, {
                filter: value,
                pagination: {
                    offset: 0,
                    limit: 20,
                    hasMore: false
                }
            });

            // Debounced refresh
            if (this._filterTimer) {
                clearTimeout(this._filterTimer);
            }

            this._filterTimer = setTimeout(async () => {
                await this.refreshTree();
            }, 300);

        } catch (error) {
            this.handleError('Filter Update Error', error);
            throw error;
        }
    }

    /**
     * Refresh tree with current state
     * @private
     */
    async refreshTree() {
        this._checkInitialized();

        try {
            this.showLoading();

            // Reset pagination
            const state = State.get(TREE_STATE_KEY);
            const params = {
                offset: 0,
                limit: state.pagination.limit,
                filter: state.filter
            };

            // Load filtered data
            const response = await API.Projects.list(params);

            // Update pagination state
            await State.update(TREE_STATE_KEY, {
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
            this.handleError('Refresh Error', error);
            this.showError(error);
        }
    }

    /**
     * Check if more data should be loaded
     * @returns {boolean}
     * @private
     */
    shouldLoadMore() {
        this._checkInitialized();

        const state = State.get(TREE_STATE_KEY);
        return state.pagination.hasMore && !this.loading.has('more');
    }

    /**
     * Load more nodes with error handling
     * @private
     */
    async loadMore() {
        this._checkInitialized();

        if (this.loading.has('more')) return;

        try {
            this.loading.add('more');
            const state = State.get(TREE_STATE_KEY);
            
            const params = {
                offset: state.pagination.offset,
                limit: state.pagination.limit,
                filter: state.filter
            };

            const response = await API.Projects.list(params);

            // Update pagination state
            await State.update(TREE_STATE_KEY, {
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
     * Render tree nodes with enhanced error handling
     * @param {Array} nodes - Nodes to render
     * @param {boolean} [append=false] - Whether to append or replace
     * @private
     */
    async renderNodes(nodes, append = false) {
        this._checkInitialized();

        try {
            if (!append) {
                this.wrapper.innerHTML = '';
            }

            const fragment = document.createDocumentFragment();
            
            for (const node of nodes) {
                try {
                    const element = await this.createNodeElement(node);
                    fragment.appendChild(element);

                    // If node was previously expanded, load its children
                    const type = node.type || 'project';
                    if (this.isNodeExpanded(type, node.id)) {
                        await this.loadNodeChildren(node.id, type, element);
                    }
                } catch (nodeError) {
                    this.handleError(`Node Rendering Error (${node.id})`, nodeError);
                    // Continue with other nodes
                }
            }

            this.wrapper.appendChild(fragment);

            // Emit render event
            const renderEvent = new CustomEvent('tree:render', {
                detail: {
                    nodeCount: nodes.length,
                    append,
                    timestamp: new Date()
                },
                bubbles: true
            });
            this.container.dispatchEvent(renderEvent);

        } catch (error) {
            this.handleError('Node Rendering Error', error);
            throw error;
        }
    }

    /**
     * Create node element with enhanced safety
     * @param {Object} node - Node data
     * @returns {Promise<HTMLElement>} Created node element
     * @private
     */
    async createNodeElement(node) {
        if (!node || !node.id) {
            throw new Error('Invalid node data');
        }

        const type = node.type || 'project';
        const typeConfig = this.nodeTypes[type];
        
        if (!typeConfig) {
            throw new Error(`Unknown node type: ${type}`);
        }

        try {
            // Create node container
            const nodeElement = DOM.createElement('div', {
                className: 'tree-item w3-hover-light-grey',
                attributes: {
                    'data-id': node.id,
                    'data-type': type
                }
            });

            // Create content structure
            const content = DOM.createElement('div', {
                className: 'tree-item-content w3-bar'
            });

            // Add toggle button if can have children
            if (typeConfig.canHaveChildren) {
                const toggleBtn = DOM.createElement('button', {
                    className: 'w3-bar-item w3-button toggle-btn',
                    attributes: {
                        'data-action': 'toggle',
                        'aria-expanded': 'false',
                        'aria-controls': `children-${node.id}`
                    },
                    innerHTML: '<i class="bi bi-chevron-right"></i>'
                });
                content.appendChild(toggleBtn);
            } else {
                content.appendChild(DOM.createElement('span', {
                    className: 'w3-bar-item spacer'
                }));
            }

            // Add item data
            const itemData = DOM.createElement('div', {
                className: 'w3-bar-item item-data',
                innerHTML: `
                    <span class="item-name">${this.sanitizeHtml(node.name)}</span>
                    ${node.description ? `
                        <span class="item-description w3-small w3-text-grey">
                            ${this.sanitizeHtml(node.description)}
                        </span>
                    ` : ''}
                `
            });
            content.appendChild(itemData);

            // Add action buttons
            const actions = DOM.createElement('div', {
                className: 'w3-bar-item w3-right item-actions'
            });

            // Edit button
            actions.appendChild(this.createActionButton('edit', 'Edit', 'pencil'));

            // Add child button if applicable
            if (typeConfig.canHaveChildren) {
                actions.appendChild(this.createActionButton('add', 'Add child', 'plus'));
            }

            // Delete button
            actions.appendChild(this.createActionButton('delete', 'Delete', 'trash'));

            content.appendChild(actions);
            nodeElement.appendChild(content);

            // Add children container if applicable
            if (typeConfig.canHaveChildren) {
                const childrenContainer = DOM.createElement('div', {
                    className: 'children-container w3-hide',
                    id: `children-${node.id}`
                });

                childrenContainer.appendChild(DOM.createElement('div', {
                    className: 'w3-panel w3-center loading-indicator w3-hide',
                    innerHTML: '<i class="bi bi-arrow-repeat w3-spin"></i> Loading...'
                }));

                childrenContainer.appendChild(DOM.createElement('div', {
                    className: 'children-wrapper'
                }));

                nodeElement.appendChild(childrenContainer);
            }

            return nodeElement;

        } catch (error) {
            this.handleError(`Node Element Creation Error (${node.id})`, error);
            throw error;
        }
    }

    /**
     * Create action button with proper attributes
     * @param {string} action - Action name
     * @param {string} title - Button title
     * @param {string} icon - Button icon
     * @returns {HTMLElement} Button element
     * @private
     */
    createActionButton(action, title, icon) {
        return DOM.createElement('button', {
            className: 'w3-button',
            attributes: {
                'data-node-action': action,
                'title': title,
                'aria-label': title
            },
            innerHTML: `<i class="bi bi-${icon}"></i>`
        });
    }

    /**
     * Toggle node expansion state with animation
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async toggleNode(nodeElement) {
        this._checkInitialized();

        const nodeId = nodeElement.dataset.id;
        const nodeType = nodeElement.dataset.type;
        const typeConfig = this.nodeTypes[nodeType];

        if (!typeConfig.canHaveChildren || this.loading.has(nodeId)) {
            return;
        }

        const childrenContainer = nodeElement.querySelector('.children-container');
        const toggleButton = nodeElement.querySelector('.toggle-btn');
        const toggleIcon = toggleButton?.querySelector('i');
        
        if (!childrenContainer || !toggleButton) return;

        const isExpanding = childrenContainer.classList.contains('w3-hide');
        
        try {
            // Update ARIA states
            toggleButton.setAttribute('aria-expanded', isExpanding ? 'true' : 'false');

            // Update button state with animation
            if (toggleIcon) {
                toggleIcon.style.transition = 'transform 0.3s ease';
                toggleIcon.style.transform = isExpanding ? 'rotate(90deg)' : '';
            }

            if (isExpanding) {
                // Prepare for expansion animation
                childrenContainer.style.display = 'block';
                childrenContainer.style.height = '0';
                childrenContainer.classList.remove('w3-hide');
                
                // Load children if needed
                if (!this.isNodeLoaded(nodeType, nodeId)) {
                    await this.loadNodeChildren(nodeId, nodeType, nodeElement);
                }

                // Animate expansion
                const height = childrenContainer.scrollHeight;
                childrenContainer.style.transition = 'height 0.3s ease';
                childrenContainer.style.height = height + 'px';

                // Cleanup after animation
                setTimeout(() => {
                    childrenContainer.style.height = '';
                    this.setNodeExpanded(nodeType, nodeId, true);
                }, 300);

            } else {
                // Animate collapse
                const height = childrenContainer.scrollHeight;
                childrenContainer.style.height = height + 'px';
                
                // Force reflow
                childrenContainer.offsetHeight;

                // Start animation
                childrenContainer.style.transition = 'height 0.3s ease';
                childrenContainer.style.height = '0';

                // Cleanup after animation
                setTimeout(() => {
                    childrenContainer.classList.add('w3-hide');
                    childrenContainer.style.height = '';
                    childrenContainer.style.display = '';
                    this.setNodeExpanded(nodeType, nodeId, false);
                }, 300);
            }

        } catch (error) {
            this.handleError('Node Toggle Error', error);
            // Revert button state on error
            if (toggleIcon) {
                toggleIcon.style.transform = '';
            }
            toggleButton.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * Load children for a node with enhanced error handling
     * @param {string} nodeId - Parent node ID
     * @param {string} nodeType - Parent node type
     * @param {HTMLElement} nodeElement - Parent node element
     * @private
     */
    async loadNodeChildren(nodeId, nodeType, nodeElement) {
        this._checkInitialized();

        if (this.loading.has(nodeId)) return;

        const typeConfig = this.nodeTypes[nodeType];
        if (!typeConfig?.loadChildren) return;

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
                try {
                    const childElement = await this.createNodeElement({
                        ...child,
                        type: typeConfig.childType
                    });
                    fragment.appendChild(childElement);
                } catch (childError) {
                    this.handleError(`Child Creation Error (${child.id})`, childError);
                    // Continue with other children
                }
            }
            childrenWrapper.appendChild(fragment);

            // Update loaded state
            this.setNodeLoaded(nodeType, nodeId, true);

            // Emit load event
            const loadEvent = new CustomEvent('tree:node:load', {
                detail: {
                    nodeId,
                    nodeType,
                    childCount: response.nodes.length,
                    timestamp: new Date()
                },
                bubbles: true
            });
            nodeElement.dispatchEvent(loadEvent);

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
     * Sanitize HTML content
     * @param {string} html - HTML content to sanitize
     * @returns {string} Sanitized content
     * @private
     */
    sanitizeHtml(html) {
        if (!html) return '';
        return String(html)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    /**
     * State tracking methods with enhanced error handling
     */

    /**
     * Check if node is expanded
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @returns {boolean} Is expanded
     */
    isNodeExpanded(type, id) {
        this._checkInitialized();

        try {
            const state = State.get(TREE_STATE_KEY);
            return state.expanded[type]?.includes(id) || false;
        } catch (error) {
            this.handleError('Expansion Check Error', error);
            return false;
        }
    }

    /**
     * Set node expanded state
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @param {boolean} expanded - Expanded state
     * @private
     */
    async setNodeExpanded(type, id, expanded) {
        this._checkInitialized();

        try {
            const state = State.get(TREE_STATE_KEY);
            const expandedIds = new Set(state.expanded[type] || []);
            
            if (expanded) {
                expandedIds.add(id);
            } else {
                expandedIds.delete(id);
            }

            await State.update(TREE_STATE_KEY, {
                expanded: {
                    ...state.expanded,
                    [type]: Array.from(expandedIds)
                },
                lastUpdate: new Date()
            });

            // Emit state change event
            const stateEvent = new CustomEvent('tree:state:change', {
                detail: {
                    type,
                    id,
                    expanded,
                    timestamp: new Date()
                },
                bubbles: true
            });
            this.container.dispatchEvent(stateEvent);

        } catch (error) {
            this.handleError('Expansion State Update Error', error);
            throw error;
        }
    }

    /**
     * Check if node is loaded
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @returns {boolean} Is loaded
     */
    isNodeLoaded(type, id) {
        this._checkInitialized();

        try {
            const state = State.get(TREE_STATE_KEY);
            return state.loaded[type]?.includes(id) || false;
        } catch (error) {
            this.handleError('Load Check Error', error);
            return false;
        }
    }

    /**
     * Set node loaded state
     * @param {string} type - Node type
     * @param {string} id - Node ID
     * @param {boolean} loaded - Loaded state
     * @private
     */
    async setNodeLoaded(type, id, loaded) {
        this._checkInitialized();

        try {
            const state = State.get(TREE_STATE_KEY);
            const loadedIds = new Set(state.loaded[type] || []);
            
            if (loaded) {
                loadedIds.add(id);
            } else {
                loadedIds.delete(id);
            }

            await State.update(TREE_STATE_KEY, {
                loaded: {
                    ...state.loaded,
                    [type]: Array.from(loadedIds)
                },
                lastUpdate: new Date()
            });

        } catch (error) {
            this.handleError('Load State Update Error', error);
            throw error;
        }
    }

    /**
     * Restore expanded state after refresh
     * @private
     */
    async restoreExpandedState() {
        this._checkInitialized();

        try {
            const state = State.get(TREE_STATE_KEY);
            
            for (const [type, ids] of Object.entries(state.expanded)) {
                for (const id of ids) {
                    try {
                        await this.ensureNodeExpanded(type, id);
                    } catch (nodeError) {
                        this.handleError(`Node Expansion Restore Error (${type}:${id})`, nodeError);
                        // Continue with other nodes
                    }
                }
            }
        } catch (error) {
            this.handleError('Expanded State Restore Error', error);
        }
    }

    /**
     * UI state management methods
     */

    /**
     * Show loading state
     * @private
     */
    showLoading() {
        this._checkInitialized();

        try {
            if (this.loader) {
                this.loader.classList.remove('w3-hide');
            }
            if (this.errorContainer) {
                this.errorContainer.classList.add('w3-hide');
            }
            if (this.emptyContainer) {
                this.emptyContainer.classList.add('w3-hide');
            }
        } catch (error) {
            this.handleError('Show Loading Error', error);
        }
    }

    /**
     * Hide loading state
     * @private
     */
    hideLoading() {
        this._checkInitialized();

        try {
            if (this.loader) {
                this.loader.classList.add('w3-hide');
            }
        } catch (error) {
            this.handleError('Hide Loading Error', error);
        }
    }

    /**
     * Show error state
     * @param {Error} error - Error to display
     * @private
     */
    showError(error) {
        this._checkInitialized();

        try {
            if (this.errorContainer) {
                const messageEl = this.errorContainer.querySelector('.error-message');
                if (messageEl) {
                    messageEl.textContent = error.message;
                }
                
                this.errorContainer.classList.remove('w3-hide');
            }
            
            if (this.loader) {
                this.loader.classList.add('w3-hide');
            }
        } catch (displayError) {
            this.handleError('Error Display Error', displayError);
            console.error('Original error:', error);
        }
    }

    /**
     * Toggle empty state
     * @param {boolean} show - Show empty state
     * @private
     */
    toggleEmpty(show) {
        this._checkInitialized();

        try {
            if (this.emptyContainer) {
                this.emptyContainer.classList.toggle('w3-hide', !show);
            }
        } catch (error) {
            this.handleError('Empty Toggle Error', error);
        }
    }

    /**
     * Cleanup and resource management
     */

    /**
     * Cleanup specific node
     * @param {string} nodeId - Node ID
     * @param {string} nodeType - Node type
     * @private
     */
    async cleanupNode(nodeId, nodeType) {
        this._checkInitialized();

        try {
            // Clear state
            const state = State.get(TREE_STATE_KEY);
            
            // Remove from expanded
            const expandedIds = new Set(state.expanded[nodeType] || []);
            expandedIds.delete(nodeId);
            
            // Remove from loaded
            const loadedIds = new Set(state.loaded[nodeType] || []);
            loadedIds.delete(nodeId);

            // Update state
            await State.update(TREE_STATE_KEY, {
                expanded: {
                    ...state.expanded,
                    [nodeType]: Array.from(expandedIds)
                },
                loaded: {
                    ...state.loaded,
                    [nodeType]: Array.from(loadedIds)
                }
            });

            // Clear from tracking maps
            this.loadedNodes.delete(`${nodeType}-${nodeId}`);
            this.expandedNodes.delete(`${nodeType}-${nodeId}`);
            this.loading.delete(nodeId);

        } catch (error) {
            this.handleError('Node Cleanup Error', error);
        }
    }

    /**
     * Destroy manager instance and cleanup all resources
     */
    async destroy() {
        if (!this.initialized) return;

        try {
            // Remove scroll observer
            if (this._scrollObserver) {
                this._scrollObserver.disconnect();
                this._scrollObserver = null;
            }

            // Clear any pending timers
            if (this._filterTimer) {
                clearTimeout(this._filterTimer);
                this._filterTimer = null;
            }

            // Clear state
            this.loadedNodes.clear();
            this.expandedNodes.clear();
            this.loading.clear();

            // Reset DOM elements
            if (this.container) {
                this.container.innerHTML = '';
            }

            this.wrapper = null;
            this.loader = null;
            this.errorContainer = null;
            this.emptyContainer = null;

            // Reset state
            await State.update(TREE_STATE_KEY, {
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

            // Emit destroy event
            const destroyEvent = new CustomEvent('tree:destroy', {
                detail: {
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(destroyEvent);

            // Reset initialized state
            this.initialized = false;

        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }
}

// Create and export singleton instance
export const Tree = new TreeManager();