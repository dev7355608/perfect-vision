import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("Token.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (!this._pv_border) {
            this._pv_border = new ObjectHUD(this);
        } else {
            this._pv_border.removeChildren();
        }

        this._pv_border.addChild(this.border);

        if (this._hover) {
            canvas._pv_highlights_overhead.borders.addChild(this._pv_border);
        } else {
            canvas._pv_highlights_underfoot.borders.addChild(this._pv_border);
        }
    });

    patch("Token.prototype.destroy", "WRAPPER", function (wrapped, options) {
        this._pv_border?.destroy(options);
        this._pv_border = null;

        wrapped(options);
    });

    patch("Token.prototype.updateVisionSource", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        this._pv_visibilityPolygon = null;
    });
});

Hooks.on("updateToken", (document, change, options, userId) => {
    if (!document.parent?.isView || !canvas.ready || !("flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change)) {
        return;
    }

    const token = document.object;

    if (token) {
        token.updateSource({ defer: true });

        canvas.perception.schedule({
            lighting: { refresh: true },
            sight: { refresh: true, forceUpdateFog: token.hasLimitedVisionAngle }
        });
    }
});

Token.prototype._pv_getVisibilityPolygon = function (origin, elevation, radius) {
    origin = origin ?? this.getSightOrigin();
    elevation = elevation ?? this.data.elevation;
    radius = radius ?? (this.w / 2 - 1.5);

    const { x, y } = origin;
    const z = elevation * (canvas.dimensions.size / canvas.dimensions.distance);
    const polygon = this._pv_visibilityPolygon;

    if (polygon && polygon.origin.x === x && polygon.origin.y === y && polygon.origin.z === z && polygon.config.radius === radius) {
        return polygon;
    }

    return this._pv_visibilityPolygon = VisibilityPolygon.create({ x, y, z }, radius);
};

class VisibilityPolygon extends ClockwiseSweepPolygon {
    computed = false;

    static create(origin, radius) {
        const polygon = new this();
        const density = 2 * Math.sqrt(radius);

        polygon.initialize(origin, { type: "move", radius, density });

        return polygon;
    }

    initialize(origin, config) {
        this.computed = false;
        super.initialize(origin, config);
    }

    compute() {
        this.computed = true;
        super.compute();
    }

    get points() {
        if (!this.computed) {
            this.compute();
        }

        return this._points;
    }

    set points(value) {
        this._points = value;
    }

    get radius() {
        return this.config.radius;
    }
}
