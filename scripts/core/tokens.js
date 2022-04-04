import { patch } from "../utils/patch.js";
import { hasChanged } from "../utils/helpers.js";

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
    if (!document.parent?.isView || !canvas.ready || !hasChanged(change, "flags.perfect-vision")) {
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
    radius = radius ?? (this.w / 2 - 1.5);

    const { x, y } = origin;
    let b = -Infinity;
    let t = +Infinity;

    if (typeof WallHeight !== "undefined") {
        const { bottom, top } = WallHeight.getSourceElevationBounds(this.document);

        b = bottom;
        t = top;
    }

    const polygon = this._pv_visibilityPolygon;

    if (polygon && polygon.origin.x === x && polygon.origin.y === y && polygon.origin.b === b && polygon.origin.t === t && polygon.config.radius === radius) {
        return polygon;
    }

    return this._pv_visibilityPolygon = VisibilityPolygon.create({ x, y, b, t }, radius);
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
