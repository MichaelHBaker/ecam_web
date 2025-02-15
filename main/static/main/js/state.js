// state.js
// Central state management module for ECAM Web

/**
 * Core state management singleton
 */
export const State = {
    _store: new Map(),
    _subscribers: new Map(),

    /**
     * Get a value from state
     * @param {string} key - State key
     * @param {string} [subKey] - Optional sub-key for nested state
     * @returns {*} State value
     */
    get(key, subKey = null) {
        const value = this._store.get(key);
        if (subKey && value) {
            return value[subKey];
        }
        return value;
    },

    /**
     * Set a value in state
     * @param {string} key - State key
     * @param {*} value - Value to store
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
    set(key, value, notify = true) {
        const oldValue = this._store.get(key);
        this._store.set(key, value);
        
        if (notify) {
            this._notifySubscribers(key, value, oldValue);
        }
    },

    /**
     * Update a nested state value
     * @param {string} key - State key
     * @param {Object} updates - Object with updates
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
    update(key, updates, notify = true) {
        const current = this._store.get(key) || {};
        const newValue = { ...current, ...updates };
        this.set(key, newValue, notify);
    },

    /**
     * Remove a value from state
     * @param {string} key - State key
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
    remove(key, notify = true) {
        const oldValue = this._store.get(key);
        this._store.delete(key);
        
        if (notify && oldValue !== undefined) {
            this._notifySubscribers(key, undefined, oldValue);
        }
    },

    /**
     * Subscribe to state changes
     * @param {string} key - State key to watch
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this._subscribers.has(key)) {
            this._subscribers.set(key, new Set());
        }
        this._subscribers.get(key).add(callback);

        // Return unsubscribe function
        return () => {
            const subscribers = this._subscribers.get(key);
            if (subscribers) {
                subscribers.delete(callback);
                if (subscribers.size === 0) {
                    this._subscribers.delete(key);
                }
            }
        };
    },

    /**
     * Check if state exists
     * @param {string} key - State key
     * @param {string} [subKey] - Optional sub-key
     * @returns {boolean} Whether state exists
     */
    has(key, subKey = null) {
        const value = this._store.get(key);
        if (subKey) {
            return value && value[subKey] !== undefined;
        }
        return this._store.has(key);
    },

    /**
     * Clear all state or state for a specific key
     * @param {string} [key] - Optional key to clear
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
    clear(key = null, notify = true) {
        if (key) {
            this.remove(key, notify);
        } else {
            const keys = Array.from(this._store.keys());
            this._store.clear();
            this._subscribers.clear();
            
            if (notify) {
                keys.forEach(k => this._notifySubscribers(k, undefined, this._store.get(k)));
            }
        }
    },

    /**
     * Notify subscribers of state changes
     * @private
     */
    _notifySubscribers(key, newValue, oldValue) {
        const subscribers = this._subscribers.get(key);
        if (subscribers) {
            subscribers.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`Error in state subscriber for ${key}:`, error);
                }
            });
        }
    }
};

/**
 * Specialized state manager for location-specific state
 */
export const LocationState = {
    /**
     * Get state for a location
     * @param {string|number} locationId - Location ID
     * @param {string} [key] - Optional specific state key
     * @returns {*} Location state
     */
    get(locationId, key = null) {
        if (!locationId) {
            throw new Error('Location ID is required');
        }
        const state = State.get(`location_${locationId}`);
        return key ? state?.[key] : state;
    },

    /**
     * Set state for a location
     * @param {string|number} locationId - Location ID
     * @param {*} updates - State updates
     */
    set(locationId, updates) {
        if (!locationId) {
            throw new Error('Location ID is required');
        }
        State.update(`location_${locationId}`, updates);
    },

    /**
     * Clear state for a location
     * @param {string|number} locationId - Location ID
     */
    clear(locationId) {
        if (!locationId) {
            throw new Error('Location ID is required');
        }
        State.remove(`location_${locationId}`);
    },

    /**
     * Initialize state for a new location
     * @param {string|number} locationId - Location ID
     * @returns {Object} Initial state
     */
    initialize(locationId) {
        if (!locationId) {
            throw new Error('Location ID is required');
        }
        
        const initialState = {
            sourceInfo: {
                type: null,
                status: 'initializing',
                streamInfo: {
                    totalSize: null,
                    processedSize: 0,
                    sampleSize: 1000,
                    hasMore: true,
                    position: 0
                }
            },
            importConfig: null,
            typeInfo: null,
            mappingInfo: null,
            preview: null,
            dataset: null
        };

        State.set(`location_${locationId}`, initialState);
        return initialState;
    },

    /**
     * Subscribe to changes for a specific location
     * @param {string|number} locationId - Location ID
     * @param {function} callback - Callback function
     * @returns {function} Unsubscribe function
     */
    subscribe(locationId, callback) {
        if (!locationId) {
            throw new Error('Location ID is required');
        }
        return State.subscribe(`location_${locationId}`, callback);
    }
};

// Export constants and types
export const StateKeys = {
    GLOBAL_CONFIG: 'global_config',
    USER_PREFERENCES: 'user_preferences',
    CURRENT_PROJECT: 'current_project',
    MODAL_STATE: 'modal_state',
    EDITOR_STATE: 'editor_state'
};

export const StateEvents = {
    STATE_CHANGED: 'state_changed',
    STATE_CLEARED: 'state_cleared',
    LOCATION_INITIALIZED: 'location_initialized',
    LOCATION_UPDATED: 'location_updated',
    LOCATION_CLEARED: 'location_cleared'
};