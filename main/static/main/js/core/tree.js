// tree.js
// Enhanced tree component aligned with Django TreeNodeViewSet

import { State } from './state.js';
import { DOM } from './dom.js';
import { API } from './api.js';
import { NotificationUI} from './ui.js';
import { Events } from './events.js';
import { Imports } from './import.js';

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

        // Inside the TreeManager constructor, add:
        this.cachedData = {
            root: [],
            project: [],
            location: [],
            measurement: []
        };

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
     * @param {string|HTMLElement} containerId - Container element ID or element
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
    
            // Find container (simplified)
            if (containerId instanceof HTMLElement) {
                this.container = containerId;
            } else {
                this.container = DOM.getElement(containerId);
            }
            
            if (!this.container) {
                throw new Error(`Container ${containerId} not found`);
            }
    
            // Find existing elements in the container
            this.wrapper = this.container.querySelector('.children-wrapper') || 
               this.container.querySelector('.tree-wrapper');

            this.loader = this.container.querySelector('.w3-center.w3-padding-16');
            this.errorContainer = this.container.querySelector('.tree-error');
            this.emptyContainer = this.container.querySelector('.w3-panel.w3-pale-yellow');
    
            if (!this.wrapper) {
                throw new Error('Tree wrapper element not found in container');
            }
    
            // Initialize state
            await this.initializeState();
    
            // Bind methods
            this.handleNodeAction = this.handleNodeAction.bind(this);
            this.handleFilter = this.handleFilter.bind(this);
    
            // Mark as initialized before methods that use _checkInitialized
            this.initialized = true;
            console.log('TreeManager initialized');
    
            // Setup event delegation
            await this.setupEventListeners();
    
            // Setup state subscriptions
            await this.setupStateSubscriptions();
    
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
                    root: [],      // Add root type here
                    project: [],
                    location: [],
                    measurement: []
                },
                loaded: {
                    root: [],      // Add root type here
                    project: [],
                    location: [],
                    measurement: []
                },
                lastUpdate: new Date()
            };
    
            State.set(TREE_STATE_KEY, initialState);
    
        } catch (error) {
            this.handleError('State Initialization Error', error);
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
        // Don't check initialization here since this is called during the initialize method
        // Note: _checkInitialized removed because initialize() calls this method before setting this.initialized = true

        try {
            // Node expansion/collapse
            Events.addDelegate(this.container, 'click', '[data-action="toggle"]', async (e, target) => {
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
            Events.addDelegate(this.container, 'click', '[data-node-action]', async (e, target) => {
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
            Events.addDelegate(this.container, 'click', '[data-action="expand-all"]', async () => {
                try {
                    await this.expandAll();
                } catch (error) {
                    this.handleError('Expand All Error', error);
                }
            });

            Events.addDelegate(this.container, 'click', '[data-action="collapse-all"]', async () => {
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
        // Don't check initialization here since this is called during the initialize method
        
        try {
            // Subscribe to filter changes
            // State.subscribe(TREE_STATE_KEY, async (newState, oldState) => {
            //     console.log('[Tree]: Event for Filter changes');
            //     try {
            //         if (newState.filter !== oldState?.filter) {
            //             console.log('[Tree]: new state:' + newState.Filter + '   old state:' + oldState.filter);
            //             const filterInput = DOM.getElement('[data-action="filter"]', this.container);
            //             if (filterInput && filterInput.value !== newState.filter) {
            //                 filterInput.value = newState.filter;
            //                 await this.refreshTree();
            //             }
            //         }
            //     } catch (error) {
            //         this.handleError('Filter State Update Error', error);
            //     }
            // });

            // Subscribe to expanded state changes
            // State.subscribe(TREE_STATE_KEY, async (newState, oldState) => {
            //     try {
            //         const newExpanded = newState.expanded;
            //         const oldExpanded = oldState?.expanded || {};
            //         console.log('[Tree]: Event for Node expanding');
            //         // Handle newly expanded nodes
            //         for (const [type, ids] of Object.entries(newExpanded)) {
            //             const oldIds = oldExpanded[type] || [];
            //             const addedIds = ids.filter(id => !oldIds.includes(id));
                        
            //             for (const id of addedIds) {
            //                 await this.ensureNodeExpanded(type, id);
            //             }
            //         }
            //     } catch (error) {
            //         this.handleError('Expanded State Update Error', error);
            //     }
            // });

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
            State.update(TREE_STATE_KEY, {
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
            State.update(TREE_STATE_KEY, {
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
            State.update(TREE_STATE_KEY, {
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
        // Add a fallback for initialization check failure
        try {
            this._checkInitialized();
        } catch (error) {
            console.warn('Tree not initialized, cannot renderNodes');
        }

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
            try {
                const renderEvent = new CustomEvent('tree:render', {
                    detail: {
                        nodeCount: nodes.length,
                        append,
                        timestamp: new Date()
                    },
                    bubbles: true
                });
                
                if (this.container) {
                    this.container.dispatchEvent(renderEvent);
                } else if (this.wrapper) {
                    this.wrapper.dispatchEvent(renderEvent);
                } else {
                    document.dispatchEvent(renderEvent);
                }
            } catch (eventError) {
                console.warn('Error dispatching render event:', eventError);
            }

            console.log('Rendered tree structure:', this.wrapper.outerHTML.substring(0, 2500));

        } catch (error) {
            this.handleError('Node Rendering Error', error);
            throw error;
        }
    }

    /**
     * Create a node element with highlight around chevron icon and project name,
     * with three dots that show dropdown menu on hover
     * @param {Object} node - Node data
     * @returns {Promise<HTMLElement>} Created node element
     * @private
     */
    async createNodeElement(node) {
        if (!node || !node.id) {
            throw new Error('Invalid node data');
        }
    
        try {
            // Create main tree item container
            const nodeElement = DOM.createElement('div', {
                classes: 'tree-item w3-padding-small',
                attributes: {
                    'data-id': node.id,
                    'data-type': node.type || 'project'
                },
                styles: {
                    display: 'flex',
                    flexDirection: 'column'
                }
            });
            
            // Create node content row
            const nodeRow = DOM.createElement('div', {
                styles: {
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    position: 'relative'
                }
            });
            nodeElement.appendChild(nodeRow);
            
            // Get type configuration
            const nodeType = node.type || 'project';
            const typeConfig = this.nodeTypes[nodeType];
            const canHaveChildren = typeConfig && typeConfig.canHaveChildren;
            
            // Only add toggle button if the node can have children
            if (canHaveChildren) {
                // Check if node is already expanded in state
                const isExpanded = this.isNodeExpanded(nodeType, node.id);
                
                // Create toggle button
                const toggleBtn = DOM.createElement('button', {
                    classes: 'toggle-btn',
                    styles: {
                        background: 'none',
                        border: 'none',
                        padding: '4px',
                        cursor: 'pointer',
                        marginRight: '4px'
                    },
                    attributes: {
                        'aria-expanded': isExpanded ? 'true' : 'false',
                        'type': 'button',
                        'data-action': 'toggle'
                    }
                });
                
                // Add icon to toggle button - use appropriate icon based on expansion state
                const toggleIcon = DOM.createElement('i', {
                    classes: ['bi', isExpanded ? 'bi-chevron-down' : 'bi-chevron-right']
                });
                toggleBtn.appendChild(toggleIcon);
                nodeRow.appendChild(toggleBtn);
            } else {
                // Add a spacer for alignment when no toggle button is needed
                const spacer = DOM.createElement('div', {
                    styles: {
                        width: '24px',  // Approximately the width of the toggle button
                        display: 'inline-block'
                    }
                });
                nodeRow.appendChild(spacer);
            }
            
            // Create content container
            const contentContainer = DOM.createElement('div', {
                styles: {
                    display: 'flex',
                    alignItems: 'center'
                }
            });
            
            // Add the node name
            contentContainer.appendChild(document.createTextNode(node.name || 'Untitled'));
            
            // Add additional node attributes if they exist
            if (node.address) {
                const addressText = DOM.createElement('span', {
                    styles: {
                        marginLeft: '12px',
                        color: '#666',
                        fontStyle: 'italic'
                    }
                });
                addressText.textContent = node.address;
                contentContainer.appendChild(addressText);
            }
            
            // Add content container to row
            nodeRow.appendChild(contentContainer);
            
            // Create dropdown container
            const dropdownContainer = DOM.createElement('div', {
                classes: 'w3-dropdown-hover',
                styles: {
                    marginLeft: '12px'
                }
            });
            
            // Create dropdown button
            const dropdownBtn = DOM.createElement('button', {
                classes: 'w3-button',
                styles: {
                    padding: '4px 8px'
                }
            });
            dropdownBtn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
            dropdownContainer.appendChild(dropdownBtn);
            
            // Create dropdown content
            const dropdownContent = DOM.createElement('div', {
                classes: 'w3-dropdown-content w3-bar-block w3-card'
            });
            
            // Add menu items based on node type
            if (canHaveChildren) {
                const addBtn = DOM.createElement('a', {
                    classes: 'w3-bar-item w3-button',
                    attributes: {
                        'href': '#',
                        'data-node-action': 'add'
                    }
                });
                const childType = typeConfig.childType || 'Child';
                addBtn.innerHTML = `<i class="bi bi-plus-lg"></i> Add ${childType}`;
                dropdownContent.appendChild(addBtn);
            }
            
            // Add edit and delete options
            const editBtn = DOM.createElement('a', {
                classes: 'w3-bar-item w3-button',
                attributes: {
                    'href': '#',
                    'data-node-action': 'edit'
                }
            });
            editBtn.innerHTML = '<i class="bi bi-pencil"></i> Edit';
            dropdownContent.appendChild(editBtn);
            
            const deleteBtn = DOM.createElement('a', {
                classes: 'w3-bar-item w3-button',
                attributes: {
                    'href': '#',
                    'data-node-action': 'delete'
                }
            });
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Delete';
            dropdownContent.appendChild(deleteBtn);
            
            dropdownContainer.appendChild(dropdownContent);
            nodeRow.appendChild(dropdownContainer);
            
            // Only create children container if node can have children
            if (canHaveChildren) {
                // Create children container
                const childrenContainer = DOM.createElement('div', {
                    classes: 'children-container w3-hide'
                });
                
                // Create loading indicator
                const loadingIndicator = DOM.createElement('div', {
                    classes: 'loading-indicator w3-padding w3-hide'
                });
                loadingIndicator.innerHTML = '<div class="w3-center"><i class="bi bi-arrow-repeat w3-spin"></i> Loading...</div>';
                childrenContainer.appendChild(loadingIndicator);
                
                // Create wrapper for child nodes
                const childrenWrapper = DOM.createElement('div', {
                    classes: 'children-wrapper'
                });
                childrenContainer.appendChild(childrenWrapper);
                
                // Add children container to node element
                nodeElement.appendChild(childrenContainer);
            }
            
            return nodeElement;
        } catch (error) {
            this.handleError(`Node Element Creation Error (${node.id})`, error);
            throw error;
        }
    }
    
    
    /**
     * Toggle node expansion state with animation
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async toggleNode(nodeElement) {
        this._checkInitialized();
    
        console.log(nodeElement, "toggleNode called on this element");
    
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
    
            // Change icon class instead of using rotation
            if (toggleIcon) {
                if (isExpanding) {
                    toggleIcon.classList.remove('bi-chevron-right');
                    toggleIcon.classList.add('bi-chevron-down');
                } else {
                    toggleIcon.classList.remove('bi-chevron-down');
                    toggleIcon.classList.add('bi-chevron-right');
                }
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
            // Revert icon on error
            if (toggleIcon) {
                toggleIcon.className = 'bi bi-chevron-right';
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
    
            // Check if we already have cached children data
            let childrenData = null;
            const cacheKey = `${nodeType}_${nodeId}_children`;
            console.log(`[Tree][loadNodeChildren] Loading children for ${nodeType} ${nodeId}`);
            console.log(`[Tree][loadNodeChildren] Current cache state:`, JSON.parse(JSON.stringify(this.cachedData)));
            
            if (this.cachedData && this.cachedData[typeConfig.childType]) {
                childrenData = this.cachedData[typeConfig.childType].filter(
                    node => node.parent_id === nodeId || node.parentId === nodeId
                );
                console.log(`[Tree][loadNodeChildren] Found ${childrenData.length} cached children of type ${typeConfig.childType}`);
            }
            
            // If no cached data or empty, load from API
            if (!childrenData || childrenData.length === 0) {
                console.log(`[Tree][loadNodeChildren] No cached data found, loading from API`);
                // Load children data
                const response = await typeConfig.loadChildren(nodeId);
                console.log(`[Tree][loadNodeChildren] API response:`, response);
                
                // Store in cache if available
                if (this.cachedData && response) {
                    let nodesToCache = [];
                    
                    if (response.nodes && Array.isArray(response.nodes)) {
                        nodesToCache = response.nodes;
                        console.log(`[Tree][loadNodeChildren] Found ${nodesToCache.length} nodes in response.nodes`);
                    } else if (Array.isArray(response)) {
                        nodesToCache = response;
                        console.log(`[Tree][loadNodeChildren] Found ${nodesToCache.length} nodes in array response`);
                    } else if (response.results && Array.isArray(response.results)) {
                        nodesToCache = response.results;
                        console.log(`[Tree][loadNodeChildren] Found ${nodesToCache.length} nodes in response.results`);
                    } else if (response.data && Array.isArray(response.data)) {
                        nodesToCache = response.data;
                        console.log(`[Tree][loadNodeChildren] Found ${nodesToCache.length} nodes in response.data`);
                    } else {
                        console.log(`[Tree][loadNodeChildren] Could not find nodes array in response:`, response);
                    }
                    
                    if (nodesToCache.length > 0) {
                        console.log(`[Tree][loadNodeChildren] Preparing to cache ${nodesToCache.length} nodes of type ${typeConfig.childType}`);
                        
                        if (!this.cachedData[typeConfig.childType]) {
                            this.cachedData[typeConfig.childType] = [];
                            console.log(`[Tree][loadNodeChildren] Created new cache array for ${typeConfig.childType}`);
                        }
                        
                        // Add or update cached children
                        nodesToCache.forEach(child => {
                            // Add parent relationship and type
                            child.parent_id = child.parent_id || nodeId;
                            child.type = typeConfig.childType;
                            
                            // Update cache with this child
                            const existingIndex = this.cachedData[typeConfig.childType].findIndex(c => c.id === child.id);
                            if (existingIndex >= 0) {
                                console.log(`[Tree][loadNodeChildren] Updating existing cache for ${child.id}`);
                                this.cachedData[typeConfig.childType][existingIndex] = child;
                            } else {
                                console.log(`[Tree][loadNodeChildren] Adding new node to cache: ${typeConfig.childType} ${child.id} (${child.name || 'unnamed'})`);
                                this.cachedData[typeConfig.childType].push(child);
                            }
                        });
                        
                        childrenData = nodesToCache;
                        console.log(`[Tree][loadNodeChildren] Updated cache for ${typeConfig.childType}:`, 
                                    this.cachedData[typeConfig.childType].length, "items");
                    }
                }
            }
            
            // Clear existing children
            childrenWrapper.innerHTML = '';
            
            // Create and append child nodes
            const fragment = document.createDocumentFragment();
            if (childrenData && childrenData.length > 0) {
                console.log(`[Tree][loadNodeChildren] Rendering ${childrenData.length} child nodes`);
                for (const child of childrenData) {
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
            } else {
                console.log(`[Tree][loadNodeChildren] No child nodes to render`);
            }
            
            childrenWrapper.appendChild(fragment);
    
            // Update loaded state
            this.setNodeLoaded(nodeType, nodeId, true);
    
            // Final cache state check
            console.log(`[Tree][loadNodeChildren] Final cache state:`, JSON.parse(JSON.stringify(this.cachedData)));
    
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

            State.update(TREE_STATE_KEY, {
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

            State.update(TREE_STATE_KEY, {
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
     * Cleanup specific node and its state
     * @param {string} nodeId - Node ID
     * @param {string} nodeType - Node type
     * @returns {Promise<void>}
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
            State.update(TREE_STATE_KEY, {
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
            
            // Clean up cached data
            if (this.cachedData && this.cachedData[nodeType]) {
                // Remove this node from cache
                this.cachedData[nodeType] = this.cachedData[nodeType].filter(node => 
                    node.id !== nodeId
                );
                
                // Also remove any children that might be in cache
                const childType = this.nodeTypes[nodeType]?.childType;
                if (childType && this.cachedData[childType]) {
                    this.cachedData[childType] = this.cachedData[childType].filter(node => 
                        node.parent_id !== nodeId && node.parentId !== nodeId
                    );
                }
            }
            
            // Emit cleanup event
            const cleanupEvent = new CustomEvent('tree:node:cleanup', {
                detail: {
                    nodeId,
                    nodeType,
                    timestamp: new Date()
                },
                bubbles: true
            });
            this.container.dispatchEvent(cleanupEvent);

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
            State.update(TREE_STATE_KEY, {
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


    // Additional helpful methods for handling specific node actions

    /**
     * Handle node edit action
     * @param {string} nodeId - Node ID
     * @param {string} nodeType - Node type
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async handleNodeEdit(nodeId, nodeType, nodeElement) {
        try {
            // Create and dispatch edit event
            const editEvent = new CustomEvent('tree:node:edit', {
                detail: {
                    nodeId,
                    nodeType,
                    element: nodeElement,
                    timestamp: new Date()
                },
                bubbles: true
            });
            
            nodeElement.dispatchEvent(editEvent);
        } catch (error) {
            this.handleError('Node Edit Error', error);
        }
    }

    /**
     * Handle node delete action
     * @param {string} nodeId - Node ID
     * @param {string} nodeType - Node type
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async handleNodeDelete(nodeId, nodeType, nodeElement) {
        try {
            // Create and dispatch delete event
            const deleteEvent = new CustomEvent('tree:node:delete', {
                detail: {
                    nodeId,
                    nodeType,
                    element: nodeElement,
                    timestamp: new Date()
                },
                bubbles: true
            });
            
            nodeElement.dispatchEvent(deleteEvent);
        } catch (error) {
            this.handleError('Node Delete Error', error);
        }
    }

    /**
     * Handle node add child action
     * @param {string} nodeId - Node ID
     * @param {string} nodeType - Node type
     * @param {HTMLElement} nodeElement - Node element
     * @private
     */
    async handleNodeAdd(nodeId, nodeType, nodeElement) {
        try {
            console.log(`[Tree] handleNodeAdd called: nodeId=${nodeId}, nodeType=${nodeType}`);
            
            // Different handling based on node type
            if (nodeType === 'location') {
                // Handle adding measurement to a location
                console.log(`[Tree] Location node detected, preparing for measurement import`);
                
                // Get location data from cache
                let locationName = 'Unknown Location';
                let projectName = 'Project';
                let projectId = null;
                
                // Get the location from cache
                const locationData = this.cachedData.location.find(loc => String(loc.id) === String(nodeId));
                console.log(`[Tree] Location data from cache:`, locationData);
                
                if (locationData) {
                    // Get the clean location name from cache
                    locationName = locationData.name || 'Unknown Location';
                    
                    // Get project ID (could be in parent_id or project field)
                    projectId = locationData.project || locationData.parent_id;
                    console.log(`[Tree] Found project ID:`, projectId);
                    
                    // Find project by ID, ensuring string comparison
                    if (projectId) {
                        const projectData = this.cachedData.project.find(proj => 
                            String(proj.id) === String(projectId));
                        
                        console.log(`[Tree] Found project data:`, projectData);
                        
                        if (projectData) {
                            projectName = projectData.name;
                            console.log(`[Tree] Found project name: ${projectName}`);
                        }
                    }
                }
                
                console.log(`[Tree] Import parameters: nodeId=${nodeId}, locationName=${locationName}, projectId=${projectId}, projectName=${projectName}`);
    
                // Show import modal
                await Imports.showImportModal(
                    nodeId,
                    locationName,
                    projectId, 
                    projectName
                );
    
                console.log(`[Tree] Import modal shown for location ${nodeId}`);
            } else if (nodeType === 'project') {
                // Handle adding location to a project
                console.log(`[Tree] Project node detected, preparing to add location`);
                
                // Get project data from cache, using string comparison
                let nodeName = 'Unknown Project';
                const projectData = this.cachedData.project.find(proj => String(proj.id) === String(nodeId));
                if (projectData) {
                    nodeName = projectData.name || 'Unknown Project';
                }
                
                console.log(`[Tree] Project name: ${nodeName}`);
                            
                // Update state
                State.update(TREE_STATE_KEY, {
                    currentAction: {
                        type: 'add_location',
                        nodeId,
                        nodeType,
                        nodeName,
                        timestamp: new Date()
                    }
                });
                
            } else {
                // Handle adding project from dashboard or unknown node
                console.log(`[Tree] Dashboard or unknown node type, assuming add project`);
                            
                // Update state
                State.update(TREE_STATE_KEY, {
                    currentAction: {
                        type: 'add_project',
                        timestamp: new Date()
                    }
                });
            }
            
            // Create and dispatch add event
            console.log(`[Tree] Dispatching tree:node:add event`);
            const addEvent = new CustomEvent('tree:node:add', {
                detail: {
                    nodeId,
                    nodeType,
                    element: nodeElement,
                    timestamp: new Date()
                },
                bubbles: true
            });
            
            nodeElement.dispatchEvent(addEvent);
            console.log(`[Tree] tree:node:add event dispatched`);
            
        } catch (error) {
            console.error(`[Tree] Error in handleNodeAdd:`, error);
            this.handleError('Node Add Error', error);
        }
    }

    /**
     * Expand all nodes
     */
    async expandAll() {
        try {
            this._checkInitialized();
            
            // Get all tree items with toggle buttons
            const nodes = this.container.querySelectorAll('.tree-item .toggle-btn');
            
            for (const toggleButton of nodes) {
                const nodeElement = toggleButton.closest('.tree-item');
                if (nodeElement) {
                    const childrenContainer = nodeElement.querySelector('.children-container');
                    if (childrenContainer && childrenContainer.classList.contains('w3-hide')) {
                        await this.toggleNode(nodeElement);
                    }
                }
            }
        } catch (error) {
            this.handleError('Expand All Error', error);
        }
    }

    /**
     * Collapse all nodes
     */
    async collapseAll() {
        try {
            this._checkInitialized();
            
            // Get all tree items with toggle buttons that are expanded
            const nodes = this.container.querySelectorAll('.tree-item .toggle-btn[aria-expanded="true"]');
            
            for (const toggleButton of nodes) {
                const nodeElement = toggleButton.closest('.tree-item');
                if (nodeElement) {
                    await this.toggleNode(nodeElement);
                }
            }
        } catch (error) {
            this.handleError('Collapse All Error', error);
        }
    }
}

// Create and export singleton instance
export const Tree = new TreeManager();