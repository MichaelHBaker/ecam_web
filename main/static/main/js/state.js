// state.js
// Enhanced state management module

import { NotificationUI } from './ui.js';

/**
 * Enhanced state management singleton
 */
class StateManager {
    constructor() {
        this._store = new Map();
        this._subscribers = new Map();
        this._history = new Map();
        this._frozen = new Set();
        this._batchUpdates = new Map();
        this._isInBatch = false;

        // Constants
        this.MAX_HISTORY_SIZE = 50;
        this.DEBOUNCE_DELAY = 100;

        // Bind methods
        this._notifySubscribers = this._notifySubscribers.bind(this);
        this._addToHistory = this._addToHistory.bind(this);
        this.startBatch = this.startBatch.bind(this);
        this.endBatch = this.endBatch.bind(this);
    }

    /**
     * Get a value from state
     * @param {string} key - State key
     * @param {string} [subKey] - Optional sub-key for nested state
     * @returns {*} State value
     * @throws {Error} If key is invalid
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
            
            // Return immutable copy for objects and arrays
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
     * @throws {Error} If key is invalid or state is frozen
     */
    set(key, value, notify = true) {
        try {
            this._validateKey(key);
            this._checkFrozen(key);

            const oldValue = this._store.get(key);
            const newValue = this._processValue(value);

            // Check if value actually changed
            if (this._isEqual(oldValue, newValue)) {
                return;
            }

            // Add to history before updating
            this._addToHistory(key, oldValue);

            // Update store
            this._store.set(key, newValue);

            // Handle batch updates
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
            throw error;
        }
    }

    /**
     * Update a nested state value
     * @param {string} key - State key
     * @param {Object} updates - Object with updates
     * @param {boolean} [notify=true] - Whether to notify subscribers
     * @throws {Error} If key is invalid or state is frozen
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

            // Check if values actually changed
            if (this._isEqual(oldValue, newValue)) {
                return;
            }

            // Add to history before updating
            this._addToHistory(key, oldValue);

            // Update store
            this._store.set(key, newValue);

            // Handle batch updates
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
            throw error;
        }
    }

    /**
     * Start a batch update
     * Multiple state changes will be collected and subscribers notified once
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
            // Notify subscribers of all changes at once
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
     * Freeze state key to prevent modifications
     * @param {string} key - State key to freeze
     */
    freeze(key) {
        this._validateKey(key);
        this._frozen.add(key);
    }

    /**
     * Unfreeze state key
     * @param {string} key - State key to unfreeze
     */
    unfreeze(key) {
        this._validateKey(key);
        this._frozen.delete(key);
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
    // state.js - Part 2
// Subscription management and history tracking

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

            // Create subscriber entry
            if (!this._subscribers.has(key)) {
                this._subscribers.set(key, new Set());
            }

            // Create subscription object
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

            // Return unsubscribe function
            return () => this._unsubscribe(key, subscription);

        } catch (error) {
            this._handleError('Subscribe Error', error);
            // Return no-op unsubscribe function
            return () => {};
        }
    }

    /**
     * Add entry to state history
     * @private
     * @param {string} key - State key
     * @param {*} value - Previous value
     */
    _addToHistory(key, value) {
        try {
            if (!this._history.has(key)) {
                this._history.set(key, []);
            }

            const history = this._history.get(key);
            
            // Add new entry
            history.unshift({
                value: this._processValue(value),
                timestamp: new Date()
            });

            // Trim history if needed
            if (history.length > this.MAX_HISTORY_SIZE) {
                history.pop();
            }

        } catch (error) {
            this._handleError('History Error', error);
        }
    }

    /**
     * Get state history for a key
     * @param {string} key - State key
     * @param {Object} [options] - History options
     * @returns {Array} State history
     */
    getHistory(key, options = {}) {
        try {
            this._validateKey(key);

            const history = this._history.get(key) || [];
            
            if (options.limit) {
                return history.slice(0, options.limit);
            }

            if (options.since) {
                const since = new Date(options.since);
                return history.filter(entry => entry.timestamp >= since);
            }

            return [...history];

        } catch (error) {
            this._handleError('Get History Error', error);
            return [];
        }
    }

    /**
     * Clear history for a key or all keys
     * @param {string} [key] - Optional key to clear
     */
    clearHistory(key = null) {
        try {
            if (key) {
                this._validateKey(key);
                this._history.delete(key);
            } else {
                this._history.clear();
            }
        } catch (error) {
            this._handleError('Clear History Error', error);
        }
    }

    /**
     * Wrap callback with configuration options
     * @private
     */
    _wrapCallback(callback, config) {
        let wrappedCallback = callback;

        // Add filtering
        if (config.filter) {
            wrappedCallback = (newValue, oldValue) => {
                if (config.filter(newValue, oldValue)) {
                    callback(newValue, oldValue);
                }
            };
        }

        // Add debouncing
        if (config.debounce > 0) {
            let timeout;
            wrappedCallback = (newValue, oldValue) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    callback(newValue, oldValue);
                }, config.debounce);
            };
        }

        // Add once handling
        if (config.once) {
            let called = false;
            wrappedCallback = (newValue, oldValue) => {
                if (!called) {
                    called = true;
                    callback(newValue, oldValue);
                }
            };
        }

        return wrappedCallback;
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
     * Unsubscribe from state changes
     * @private
     */
    _unsubscribe(key, subscription) {
        try {
            const subscribers = this._subscribers.get(key);
            if (subscribers) {
                subscribers.delete(subscription);
                if (subscribers.size === 0) {
                    this._subscribers.delete(key);
                }
            }
        } catch (error) {
            this._handleError('Unsubscribe Error', error);
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
            // Create notification data
            const notification = {
                key,
                value: newValue,
                previousValue: oldValue,
                timestamp: new Date()
            };

            // Notify subscribers
            subscribers.forEach(subscription => {
                if (!subscription.active) return;

                try {
                    subscription.callback(newValue, oldValue, notification);
                    subscription.lastCalled = new Date();

                    // Handle once subscriptions
                    if (subscription.config.once) {
                        subscription.active = false;
                    }
                } catch (error) {
                    this._handleError('Subscriber Callback Error', error);
                }
            });

            // Clean up inactive subscribers
            this._cleanupSubscribers(key);

        } catch (error) {
            this._handleError('Notify Subscribers Error', error);
        }
    }

    /**
     * Clean up inactive subscribers
     * @private
     */
    _cleanupSubscribers(key) {
        const subscribers = this._subscribers.get(key);
        if (!subscribers) return;

        // Remove inactive subscribers
        for (const subscription of subscribers) {
            if (!subscription.active) {
                subscribers.delete(subscription);
            }
        }

        // Remove empty subscriber sets
        if (subscribers.size === 0) {
            this._subscribers.delete(key);
        }
    }
    // state.js - Part 3
// Error handling, debugging, and cleanup

    /**
     * Handle errors in state operations
     * @private
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    _handleError(context, error) {
        const errorData = {
            context,
            message: error.message,
            stack: error.stack,
            timestamp: new Date()
        };

        // Log error
        console.error(`State Error (${context}):`, error);

        // Add to error history
        if (!this._store.has('_errors')) {
            this._store.set('_errors', []);
        }
        const errors = this._store.get('_errors');
        errors.unshift(errorData);

        // Trim error history
        if (errors.length > this.MAX_HISTORY_SIZE) {
            errors.pop();
        }

        // Notify UI if available
        if (typeof NotificationUI !== 'undefined') {
            NotificationUI.show({
                message: `State Error: ${error.message}`,
                type: 'error',
                duration: 5000
            });
        }

        // Notify error subscribers
        this._notifySubscribers('_errors', errors, errors.slice(1));
    }

    /**
     * Get debugging information
     * @param {string} [key] - Optional specific state key
     * @returns {Object} Debug information
     */
    debug(key = null) {
        try {
            if (key) {
                this._validateKey(key);
                return {
                    key,
                    value: this.get(key),
                    history: this.getHistory(key),
                    subscribers: this._getSubscriberInfo(key),
                    frozen: this._frozen.has(key),
                    lastUpdate: this._getLastUpdate(key)
                };
            }

            return {
                keys: Array.from(this._store.keys()),
                size: this._store.size,
                subscriberCount: this._getTotalSubscriberCount(),
                frozenKeys: Array.from(this._frozen),
                historySize: this._getTotalHistorySize(),
                errors: this._store.get('_errors') || [],
                memory: this._getMemoryUsage()
            };
        } catch (error) {
            this._handleError('Debug Error', error);
            return {};
        }
    }

    /**
     * Get memory usage information
     * @private
     */
    _getMemoryUsage() {
        try {
            return {
                storeSize: this._getObjectSize(this._store),
                historySize: this._getObjectSize(this._history),
                subscriberSize: this._getObjectSize(this._subscribers),
                totalKeys: this._store.size,
                totalSubscribers: this._getTotalSubscriberCount(),
                timestamp: new Date()
            };
        } catch (error) {
            this._handleError('Memory Usage Error', error);
            return {};
        }
    }

    /**
     * Calculate approximate size of object in memory
     * @private
     */
    _getObjectSize(obj) {
        try {
            const seen = new WeakSet();
            const calculateSize = (value) => {
                if (value === null || value === undefined) return 0;
                
                if (typeof value === 'object') {
                    if (seen.has(value)) return 0;
                    seen.add(value);

                    if (value instanceof Map) {
                        return Array.from(value.entries()).reduce((size, [key, val]) => 
                            size + calculateSize(key) + calculateSize(val), 0);
                    }

                    if (value instanceof Set) {
                        return Array.from(value).reduce((size, val) => 
                            size + calculateSize(val), 0);
                    }

                    return Object.entries(value).reduce((size, [key, val]) => 
                        size + key.length + calculateSize(val), 0);
                }

                if (typeof value === 'string') return value.length * 2;
                if (typeof value === 'number') return 8;
                if (typeof value === 'boolean') return 4;

                return 0;
            };

            return calculateSize(obj);
        } catch (error) {
            this._handleError('Object Size Error', error);
            return 0;
        }
    }

    /**
     * Get subscriber information for debugging
     * @private
     */
    _getSubscriberInfo(key) {
        const subscribers = this._subscribers.get(key);
        if (!subscribers) return [];

        return Array.from(subscribers).map(sub => ({
            active: sub.active,
            config: { ...sub.config },
            lastCalled: sub.lastCalled,
            callCount: sub.callCount || 0
        }));
    }

    /**
     * Get total subscriber count
     * @private
     */
    _getTotalSubscriberCount() {
        return Array.from(this._subscribers.values())
            .reduce((total, subs) => total + subs.size, 0);
    }

    /**
     * Get total history size
     * @private
     */
    _getTotalHistorySize() {
        return Array.from(this._history.values())
            .reduce((total, history) => total + history.length, 0);
    }

    /**
     * Get last update timestamp for a key
     * @private
     */
    _getLastUpdate(key) {
        const history = this._history.get(key);
        return history && history.length > 0 ? history[0].timestamp : null;
    }

    /**
     * Clear all state or state for a specific key
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
                // Store frozen keys
                const frozenKeys = new Set(this._frozen);
                
                // Clear non-frozen keys
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
     * Remove a key from state
     * @param {string} key - State key
     * @param {boolean} [notify=true] - Whether to notify subscribers
     */
    remove(key, notify = true) {
        try {
            this._validateKey(key);
            this._checkFrozen(key);

            const oldValue = this._store.get(key);
            this._store.delete(key);
            this._history.delete(key);
            
            if (notify && oldValue !== undefined) {
                this._notifySubscribers(key, undefined, oldValue);
            }
        } catch (error) {
            this._handleError('Remove Error', error);
        }
    }

    /**
     * Check if state exists
     * @param {string} key - State key
     * @param {string} [subKey] - Optional sub-key
     * @returns {boolean} Whether state exists
     */
    has(key, subKey = null) {
        try {
            this._validateKey(key);
            const value = this._store.get(key);
            
            if (subKey !== null) {
                return value && typeof value === 'object' && subKey in value;
            }
            
            return this._store.has(key);
        } catch (error) {
            this._handleError('Has Error', error);
            return false;
        }
    }
}

// Export singleton instance
export const State = new StateManager();