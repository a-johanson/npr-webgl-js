// StateManager: manages application state with dependency tracking

export class StateManager {
    constructor(initialState = {}) {
        this._state = { ...initialState };
        this._subscribers = new Map(); // Map<propertyName, Array<callback>>
    }

    get(key) {
        return this._state[key];
    }

    /**
     * Update state and notify affected subscribers
     * @param {Object} updates - Object with properties to update
     */
    async setState(updates) {
        const changedKeys = [];

        for (const [key, value] of Object.entries(updates)) {
            if (this._state[key] !== value) {
                this._state[key] = value;
                changedKeys.push(key);
            }
        }

        for (const key of changedKeys) {
            if (this._subscribers.has(key)) {
                for (const callback of this._subscribers.get(key)) {
                    await callback(this._state[key], this._state);
                }
            }
        }

        return changedKeys;
    }

    /**
     * Subscribe to changes in specific state properties
     * @param {string[]} keys - Array of property names to watch
     * @param {Function} callback - Called when any watched property changes
     */
    subscribe(keys, callback) {
        keys.forEach(key => {
            if (!this._subscribers.has(key)) {
                this._subscribers.set(key, []);
            }
            this._subscribers.get(key).push(callback);
        });
    }
}
