class WeakCacheInstance {
    constructor(cache, entries, dispose, context = globalThis) {
        this._cache = new WeakRef(cache);
        this.entries = entries;
        this.dispose = dispose;
        this.context = context;
    }

    get cache() {
        return this._cache.deref();
    }
}

class WeakCacheEntry {
    constructor(key, value) {
        this._key = new WeakRef(key);
        this.value = value;
        this.expired = false;
    }

    get key() {
        return this._key.deref();
    }
}

export class WeakCache {
    static _instances = [];

    constructor(dispose, context) {
        this._map = new WeakMap();
        this._entries = [];
        this._dispose = dispose;
        this._context = context;

        WeakCache._instances.push(new WeakCacheInstance(this, this._entries, dispose, context));
    }

    has(key) {
        return this._map.has(key);
    }

    get(key) {
        const entry = this._map.get(key);

        if (!entry) {
            return;
        }

        entry.expired = false;
        return entry?.value;
    }

    set(key, value) {
        let entry = this._map.get(key);

        if (!entry) {
            entry = new WeakCacheEntry(key, value);
            this._entries.push(entry);
            this._map.set(key, entry);
        } else {
            entry.value = value;
            entry.expired = false;
            this._dispose.call(this._context, entry.value);
        }

        return this;
    }

    delete(key) {
        const entries = this._entries;
        const deleted = this._map.delete(key);

        if (deleted) {
            for (let i = entries.length - 1; i >= 0; i--) {
                const entry = entries[i];

                if (entry.key === key) {
                    const last = entries.pop();

                    if (i !== entries.length) {
                        entries[i] = last;
                    }

                    this._dispose.call(this._context, entry.value);
                    break;
                }
            }
        }

        return deleted;
    }

    expire() {
        const entries = this._entries;

        for (let i = 0; i < entries.length; i++) {
            entries[i].expired = true;
        }
    }

    clean(force = false) {
        const map = this._map;
        const entries = this._entries;
        const dispose = this._dispose;
        const context = this._context;

        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];

            if (force || entry.expired || entry.key === undefined) {
                if (force || entry.expired) {
                    map.delete(entry.key);
                }

                const last = entries.pop();

                if (i !== entries.length) {
                    entries[i] = last;
                }

                dispose.call(context, entry.value);
            }
        }
    }

    static expireAll() {
        const instances = this._instances;

        for (let i = 0; i < instances.length; i++) {
            instances[i].expire();
        }
    }

    static cleanAll() {
        const instances = this._instances;

        for (let j = instances.length - 1; j >= 0; j--) {
            const instance = instances[j];
            const cache = instance.cache;

            if (cache === undefined) {
                const entries = instance.entries;
                const dispose = instance.dispose;
                const context = instance.context;

                for (let i = entries.length - 1; i >= 0; i--) {
                    dispose.call(context, entries[i].value);
                }

                const last = instances.pop();

                if (j !== instances.length) {
                    instances[j] = last;
                }
            } else {
                cache.clean();
            }
        }
    }
}

setInterval(() => WeakCache.cleanAll(), 1000);

export class WeakPool {
    constructor({ key = x => x, create, update, destroy, context = globalThis }) {
        this._cache = new WeakCache(destroy);
        this._key = key;
        this._create = create;
        this._update = update;
        this._context = context;
    }

    create(...args) {
        const key = this._key.apply(this._context, args);
        let value = this._cache.get(key);

        if (value) {
            this._update.call(this._context, value, ...args);
        } else {
            value = this._create.apply(this._context, args);
            this._cache.set(key, value);
        }

        return value;
    }

    expire() {
        this._cache.expire();
    }

    clean() {
        this._cache.clean();
    }
}
