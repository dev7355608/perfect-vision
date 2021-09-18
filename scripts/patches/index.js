import "./pixi/index.js";

// TODO
Object.defineProperties(SynchronizedTransform.prototype, {
    reference: {
        get() {
            return this._reference;
        },
        set(value) {
            this._reference = value;
            this._syncLocalID = -1;
        }
    },
    localTransform: {
        get() {
            return this._reference.localTransform;
        },
        set(value) {
            if (!this._reference) return;
            this._reference.localTransform = value;
        }
    },
    position: {
        get() {
            return this._reference.position;
        },
        set(value) {
            if (!this._reference) return;
            this._reference.position = value;
        }
    },
    scale: {
        get() {
            return this._reference.scale;
        },
        set(value) {
            if (!this._reference) return;
            this._reference.scale = value;
        }
    },
    pivot: {
        get() {
            return this._reference.pivot;
        },
        set(value) {
            if (!this._reference) return;
            this._reference.pivot = value;
        }
    },
    skew: {
        get() {
            return this._reference.skew;
        },
        set(value) {
            if (!this._reference) return;
            this._reference.skew = value;
        }
    },
    _rotation: {
        get() {
            return this._reference._rotation;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._rotation = value;
        }
    },
    _cx: {
        get() {
            return this._reference._cx;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._cx = value;
        }
    },
    _sx: {
        get() {
            return this._reference._sx;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._sx = value;
        }
    },
    _cy: {
        get() {
            return this._reference._cy;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._cy = value;
        }
    },
    _sy: {
        get() {
            return this._reference._sy;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._sy = value;
        }
    },
    _localID: {
        get() {
            return this._reference._localID;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._localID = value;
        }
    },
    _currentLocalID: {
        get() {
            return this._reference._currentLocalID;
        },
        set(value) {
            if (!this._reference) return;
            this._reference._currentLocalID = value;
        }
    },
    updateLocalTransform: {
        value() {
            if (this._localID !== this._currentLocalID) {
                this._reference._parentID = -1;
                PIXI.Transform.prototype.updateLocalTransform.call(this);
            }
        }
    },
    updateTransform: {
        value(parentTransform) {
            if (this._localID !== this._currentLocalID) {
                this._reference._parentID = -1;
            } else if (this._localID !== this._syncLocalID) {
                this._parentID = -1;
            }
            this._syncLocalID = this._localID;
            PIXI.Transform.prototype.updateTransform.call(this, parentTransform);
        }
    }
});
