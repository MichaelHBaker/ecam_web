// state.js
// Enhanced state management without React/jQuery dependencies

class StateManager {
    constructor() {
        this._store = new Map();
        this._subscribers = new Map();
        this._history = new Map();
        this._frozen = new Set();
        this._batchUpdates = new Map();
        this._isInBatch = false;
        this.initialized = true;

        // Constants
        this.MAX_HISTORY_SIZE = 50;
        this.DEBOUNCE_DELAY = 100;

        // Bind methods
        this._notifySubscribers = this._notifySubscribers.bind(this);
        this._addToHistory = this._addToHistory.bind(this);
        this.startBatch = this.startBatch.bind(this);
        this.endBatch = this.endBatch.bind(this);
    }

    isInitialized() {
        return this.initialized;
    }

    /**
     * Get a value from state
     * @param {string} key - State key
     * @param {string} [subKey] - Optional sub-key for nested state
     * @returns {*} State value
     */
    get(key, subKey = null) {
        try {
            this._validateKey(key);
            const value = this._store.get(key);
            
            if (subKey !== null) {
                if (value && typeof value === 'object') {
                    return value[subKey];
                }
                return undefined;
            }
            
            return this._getImmutableValue(value);
        } catch (error) {
            this._handleError('State Get Error', error);
            return undefined;
        }
    }

    /**
     * Set a value in state
     * @param {string} key - State key
     * @param {*} value - Value to store
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
    set(key, value, notify = true) {
        try {
            this._validateKey(key);
            this._checkFrozen(key);

            const oldValue = this._store.get(key);
            const newValue = this._processValue(value);

            if (this._isEqual(oldValue, newValue)) {
                return;
            }

            this._addToHistory(key, oldValue);
            this._store.set(key, newValue);

            if (this._isInBatch) {
                this._batchUpdates.set(key, {
                    oldValue,
                    newValue,
                    timestamp: new Date()
                });
            } else if (notify) {
                this._notifySubscribers(key, newValue, oldValue);
            }
        } catch (error) {
            this._handleError('State Set Error', error);
        }
    }
/**
     * Update a nested state value
     * @param {string} key - State key
     * @param {Object} updates - Object with updates
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
update(key, updates, notify = true) {
    try {
        this._validateKey(key);
        this._checkFrozen(key);

        const current = this._store.get(key) || {};
        
        if (typeof current !== 'object') {
            throw new Error(`Cannot update non-object state: ${key}`);
        }

        const oldValue = { ...current };
        const newValue = {
            ...current,
            ...this._processValue(updates)
        };

        if (this._isEqual(oldValue, newValue)) {
            return;
        }

        this._addToHistory(key, oldValue);
        this._store.set(key, newValue);

        if (this._isInBatch) {
            this._batchUpdates.set(key, {
                oldValue,
                newValue,
                timestamp: new Date()
            });
        } else if (notify) {
            this._notifySubscribers(key, newValue, oldValue);
        }

    } catch (error) {
        this._handleError('State Update Error', error);
    }
}

/**
 * Subscribe to state changes
 * @param {string} key - State key to watch
 * @param {Function} callback - Callback function
 * @param {Object} [options] - Subscription options
 * @returns {Function} Unsubscribe function
 */
subscribe(key, callback, options = {}) {
    try {
        this._validateKey(key);
        this._validateCallback(callback);

        const config = {
            debounce: options.debounce || 0,
            filter: options.filter || null,
            once: options.once || false,
            immediate: options.immediate || false,
            ...options
        };

        if (!this._subscribers.has(key)) {
            this._subscribers.set(key, new Set());
        }

        const subscription = {
            callback: this._wrapCallback(callback, config),
            original: callback,
            config,
            active: true,
            lastCalled: null
        };

        this._subscribers.get(key).add(subscription);

        // Call immediately if requested and value exists
        if (config.immediate && this._store.has(key)) {
            const value = this.get(key);
            subscription.callback(value, undefined);
        }

        return () => this._unsubscribe(key, subscription);

    } catch (error) {
        this._handleError('Subscribe Error', error);
        return () => {}; // Return no-op unsubscribe function
    }
}

/**
 * Start a batch update
 */
startBatch() {
    this._isInBatch = true;
    this._batchUpdates.clear();
}

/**
 * End a batch update and notify subscribers
 */
endBatch() {
    if (!this._isInBatch) return;

    try {
        this._batchUpdates.forEach((update, key) => {
            this._notifySubscribers(key, update.newValue, update.oldValue);
        });
    } catch (error) {
        this._handleError('Batch Update Error', error);
    } finally {
        this._isInBatch = false;
        this._batchUpdates.clear();
    }
}
/**
     * Process value before storing
     * @private
     */
_processValue(value) {
    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return [...value];
    }

    if (value instanceof Date) {
        return new Date(value);
    }

    if (typeof value === 'object') {
        return { ...value };
    }

    return value;
}

/**
 * Get immutable copy of value
 * @private
 */
_getImmutableValue(value) {
    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return [...value];
    }

    if (value instanceof Date) {
        return new Date(value);
    }

    if (typeof value === 'object') {
        return { ...value };
    }

    return value;
}

/**
 * Validate state key
 * @private
 */
_validateKey(key) {
    if (!key || typeof key !== 'string') {
        throw new Error('Invalid state key');
    }
}

/**
 * Check if state key is frozen
 * @private
 */
_checkFrozen(key) {
    if (this._frozen.has(key)) {
        throw new Error(`State is frozen: ${key}`);
    }
}

/**
 * Check deep equality of values
 * @private
 */
_isEqual(value1, value2) {
    if (value1 === value2) return true;

    if (value1 == null || value2 == null) return value1 === value2;
    
    if (value1 instanceof Date && value2 instanceof Date) {
        return value1.getTime() === value2.getTime();
    }

    if (Array.isArray(value1) && Array.isArray(value2)) {
        return value1.length === value2.length &&
               value1.every((val, index) => this._isEqual(val, value2[index]));
    }

    if (typeof value1 === 'object' && typeof value2 === 'object') {
        const keys1 = Object.keys(value1);
        const keys2 = Object.keys(value2);
        
        return keys1.length === keys2.length &&
               keys1.every(key => this._isEqual(value1[key], value2[key]));
    }

    return false;
}

/**
 * Add entry to state history
 * @private
 */
_addToHistory(key, value) {
    try {
        if (!this._history.has(key)) {
            this._history.set(key, []);
        }

        const history = this._history.get(key);
        
        history.unshift({
            value: this._processValue(value),
            timestamp: new Date()
        });

        if (history.length > this.MAX_HISTORY_SIZE) {
            history.pop();
        }

    } catch (error) {
        this._handleError('History Error', error);
    }
}  
/**
     * Notify subscribers of state changes
     * @private
     */
_notifySubscribers(key, newValue, oldValue) {
    const subscribers = this._subscribers.get(key);
    if (!subscribers) return;

    try {
        const notification = {
            key,
            value: newValue,
            previousValue: oldValue,
            timestamp: new Date()
        };

        subscribers.forEach(subscription => {
            if (!subscription.active) return;

            try {
                subscription.callback(newValue, oldValue, notification);
                subscription.lastCalled = new Date();

                if (subscription.config.once) {
                    subscription.active = false;
                }
            } catch (error) {
                this._handleError('Subscriber Callback Error', error);
            }
        });

        this._cleanupSubscribers(key);

    } catch (error) {
        this._handleError('Notify Subscribers Error', error);
    }
}

/**
 * Validate callback function
 * @private
 */
_validateCallback(callback) {
    if (typeof callback !== 'function') {
        throw new Error('Callback must be a function');
    }
}

/**
 * Clear state
 * @param {string} [key] - Optional key to clear
 * @param {boolean} [notify=true] - Whether to notify subscribers
 */
clear(key = null, notify = true) {
    try {
        if (key) {
            this._validateKey(key);
            this._checkFrozen(key);
            
            const oldValue = this._store.get(key);
            this._store.delete(key);
            this._history.delete(key);
            
            if (notify) {
                this._notifySubscribers(key, undefined, oldValue);
            }
        } else {
            const frozenKeys = new Set(this._frozen);
            
            for (const [key, value] of this._store.entries()) {
                if (!frozenKeys.has(key)) {
                    if (notify) {
                        this._notifySubscribers(key, undefined, value);
                    }
                    this._store.delete(key);
                    this._history.delete(key);
                }
            }
        }
    } catch (error) {
        this._handleError('Clear Error', error);
    }
}

/**
 * Handle errors in state operations
 * @private
 */
_handleError(context, error) {
    console.error(`State Error (${context}):`, error);

    // Add to error history
    if (!this._store.has('_errors')) {
        this._store.set('_errors', []);
    }
    const errors = this._store.get('_errors');
    errors.unshift({
        context,
        message: error.message,
        stack: error.stack,
        timestamp: new Date()
    });

    // Trim error history
    if (errors.length > this.MAX_HISTORY_SIZE) {
        errors.pop();
    }

    // Notify error subscribers
    this._notifySubscribers('_errors', errors, errors.slice(1));
}

/**
 * Clean up inactive subscribers
 * @private
 */
_cleanupSubscribers(key) {
    const subscribers = this._subscribers.get(key);
    if (!subscribers) return;

    for (const subscription of subscribers) {
        if (!subscription.active) {
            subscribers.delete(subscription);
        }
    }

    if (subscribers.size === 0) {
        this._subscribers.delete(key);
    }
}

/**
 * Wrap callback with debounce and filtering if needed
 * @private
 */
_wrapCallback(callback, config) {
    let wrapped = callback;
    
    // Add debouncing if specified
    if (config.debounce > 0) {
        wrapped = this._debounce(wrapped, config.debounce);
    }
    
    // Add filtering if specified
    if (config.filter) {
        const originalWrapped = wrapped;
        wrapped = (newValue, oldValue, notification) => {
            if (config.filter(newValue, oldValue, notification)) {
                originalWrapped(newValue, oldValue, notification);
            }
        };
    }
    
    return wrapped;
}

/**
 * Simple debounce implementation
 * @private
 */
_debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Unsubscribe from state changes
 * @private
 */
_unsubscribe(key, subscription) {
    const subscribers = this._subscribers.get(key);
    if (subscribers) {
        subscribers.delete(subscription);
        if (subscribers.size === 0) {
            this._subscribers.delete(key);
        }
    }
}
}

// Export singleton instance
export const State = new StateManager();  