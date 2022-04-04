import { patch } from "../utils/patch.js";
import { hasChanged } from "../utils/helpers.js";
import { Region } from "../utils/region.js";
import { LightingSystem } from "./lighting-system.js";

Hooks.once("init", () => {
    patch("Drawing.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        if (!this._original) {
            this._pv_updateLighting();
        }

        return await wrapped(...args);
    });

    patch("Drawing.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (this.destroyed || this.shape.destroyed || this._original) {
            return this;
        }

        if (LightingSystem.instance.updateRegion(`Drawing.${this.document.id}`, { hidden: !!this.skipRender })) {
            canvas.perception.schedule({ lighting: { refresh: true } });
        }

        return this;
    });

    patch("Drawing.prototype.destroy", "WRAPPER", function (wrapped, ...args) {
        if (!this._original) {
            this._pv_updateLighting({ deleted: true });
        }

        wrapped(...args);
    });
});

Hooks.on("updateDrawing", (document, change, options, userId) => {
    if (!document.parent?.isView || !canvas.ready || !document.object) {
        return;
    }

    let updateLighting = false;
    let skipUpdateShape = true;

    if ("x" in change || "y" in change || "width" in change || "height" in change || "rotation" in change
        || "type" in change || "points" in change || "bezierFactor" in change) {
        updateLighting = true;
        skipUpdateShape = false;
    } else if ("z" in change || hasChanged(change, "flags.perfect-vision", "flags.levels.rangeBottom", "flags.levels.rangeTop")) {
        updateLighting = true;
    }

    if (updateLighting) {
        document.object?._pv_updateLighting({ skipUpdateShape });
    }
});

const tempMatrix = new PIXI.Matrix();

Drawing.prototype._pv_updateLighting = function ({ defer = false, deleted = false, skipUpdateShape = false } = {}) {
    let active;

    if (!deleted && (active = this.document.getFlag("perfect-vision", "active"))) {
        const hidden = !!this.skipRender /* Levels */;

        let parent = this.document.getFlag("perfect-vision", "parent");

        if (parent) {
            parent = `Drawing.${parent}`;
        } else {
            parent = "Scene";
        }

        const transform = this._pv_getTransform(tempMatrix);

        let origin = this.document.getFlag("perfect-vision", "origin");

        origin = new PIXI.Point(
            (origin?.x ?? 0.5) * this.data.width,
            (origin?.y ?? 0.5) * this.data.height
        );

        transform.apply(origin, origin);

        if (game.modules.get("levels")?.active) {
            const { bottom, top } = WallHeight.getSourceElevationBounds(this.document);

            origin = {
                x: origin.x,
                y: origin.y,
                b: bottom,
                t: top
            };
        }

        let walls = this.document.getFlag("perfect-vision", "walls");

        if (walls !== undefined) {
            walls = !!walls;
        }

        let vision = this.document.getFlag("perfect-vision", "vision");

        if (vision !== undefined) {
            vision = !!vision;
        }

        let globalLight = this.document.getFlag("perfect-vision", "globalLight");

        if (globalLight !== undefined) {
            globalLight = !!globalLight;
        }

        let globalLightThreshold = this.document.getFlag("perfect-vision", "globalLightThreshold");

        if (globalLightThreshold !== undefined) {
            globalLightThreshold = Number.isFinite(globalLightThreshold) ? Math.clamped(globalLightThreshold, 0, 1) : null;
        }

        let sightLimit = this.document.getFlag("perfect-vision", "sightLimit");

        if (sightLimit !== undefined) {
            sightLimit = Number.isFinite(sightLimit)
                ? Math.max(sightLimit, 0) / canvas.dimensions.distance * canvas.dimensions.size
                : Infinity;
        }

        const parseColor = (color, defaultColor) => foundry.utils.rgbToHex(
            foundry.utils.hexToRGB(
                typeof color === "string" && /^#[0-9A-F]{6,6}$/i.test(color)
                    ? foundry.utils.colorStringToHex(color)
                    : defaultColor
            ).map(x => Math.max(x, 0.05))
        );

        let daylightColor = this.document.getFlag("perfect-vision", "daylightColor");

        if (daylightColor !== undefined) {
            daylightColor = parseColor(daylightColor, CONFIG.Canvas.daylightColor);
        }

        let darknessColor = this.document.getFlag("perfect-vision", "darknessColor");

        if (darknessColor !== undefined) {
            darknessColor = parseColor(darknessColor, CONFIG.Canvas.darknessColor);
        }

        let darkness = this.document.getFlag("perfect-vision", "darkness");

        if (darkness !== undefined) {
            darkness = Number.isFinite(darkness) ? Math.clamped(darkness, 0, 1) : 0;
        }

        let saturation = this.document.getFlag("perfect-vision", "saturation");

        if (saturation !== undefined) {
            saturation = Number.isFinite(saturation) ? Math.clamped(saturation, 0, 1) : null;
        }

        const z = this.data.z;

        const id = `Drawing.${this.document.id}`;

        if (!LightingSystem.instance.hasRegion(id)) {
            const shape = Region.from(this._pv_getShape(), transform);

            LightingSystem.instance.addRegion(id, {
                active, hidden, parent, shape, z, origin, walls, vision, globalLight, globalLightThreshold,
                sightLimit, daylightColor, darknessColor, darkness, saturation,
                inset: canvas.dimensions._pv_inset
            });

            if (!defer) {
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        } else {
            if (skipUpdateShape) {
                if (LightingSystem.instance.updateRegion(id, {
                    active, hidden, parent, z, origin, walls, vision, globalLight, globalLightThreshold,
                    sightLimit, daylightColor, darknessColor, darkness, saturation
                })) {
                    if (!defer) {
                        canvas.perception.schedule({ lighting: { refresh: true } });
                    }
                }
            } else {
                const shape = Region.from(this._pv_getShape(), transform);

                if (LightingSystem.instance.updateRegion(id, {
                    active, hidden, parent, shape, z, origin, walls, vision, globalLight, globalLightThreshold,
                    sightLimit, daylightColor, darknessColor, darkness, saturation
                })) {
                    if (!defer) {
                        canvas.perception.schedule({ lighting: { refresh: true } });
                    }
                }
            }
        }
    } else {
        if (LightingSystem.instance.deleteRegion(`Drawing.${this.document.id}`)) {
            if (!defer) {
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }
    }
};

Drawing.prototype._pv_getShape = function () {
    const { width, height, type, points } = this.data;

    let shape;

    switch (type) {
        case CONST.DRAWING_TYPES.RECTANGLE:
        case CONST.DRAWING_TYPES.TEXT:
            shape = new PIXI.Rectangle(0, 0, width, height);
            break;
        case CONST.DRAWING_TYPES.ELLIPSE:
            shape = new PIXI.Ellipse(width / 2, height / 2, width / 2, height / 2);
            break;
        case CONST.DRAWING_TYPES.POLYGON:
            shape = new PIXI.Polygon();

            if (!points) {
                break;
            }

            for (const point of points) {
                shape.points.push(point[0], point[1]);
            }

            break;
        case CONST.DRAWING_TYPES.FREEHAND:
            shape = new PIXI.Polygon();

            if (!points || points.length === 0) {
                break;
            }

            let numPoints = points.length;

            shape.points.push(points[0][0], points[0][1]);

            if (numPoints >= 2 && points[0].equals(points[numPoints - 1])) {
                numPoints--;
            }

            if (numPoints >= 2) {
                shape.points.push(points[1][0], points[1][1]);
            }

            if (numPoints >= 3) {
                const factor = this.data.bezierFactor ?? 0.5;

                function getBezierControlPoints(previous, point, next) {
                    const vector = { x: next[0] - previous[0], y: next[1] - previous[1] };
                    const preDist = Math.hypot(previous[0] - point[0], previous[1] - point[1]);
                    const postDist = Math.hypot(next[0] - point[0], next[1] - point[1]);
                    const dist = preDist + postDist;
                    const cp0d = dist === 0 ? 0 : factor * (preDist / dist);
                    const cp1d = dist === 0 ? 0 : factor * (postDist / dist);

                    return {
                        cp1: {
                            x: point[0] - (vector.x * cp0d),
                            y: point[1] - (vector.y * cp0d)
                        },
                        next_cp0: {
                            x: point[0] + (vector.x * cp1d),
                            y: point[1] + (vector.y * cp1d)
                        }
                    };
                };

                let previous = points[1];
                let current = points[2];
                let cp0 = getBezierControlPoints(points[0], previous, current).next_cp0;
                let cp1, next_cp0, next;

                for (let i = 1; i < numPoints; i++) {
                    next = points[i + 1];

                    if (next) {
                        const bp = getBezierControlPoints(previous, current, next);

                        cp1 = bp.cp1;
                        next_cp0 = bp.next_cp0;
                    }

                    if (i === 1) {
                        PIXI.graphicsUtils.QuadraticUtils.curveTo(cp1.x, cp1.y, current[0], current[1], shape.points);
                    } else if (i === points.length) {
                        PIXI.graphicsUtils.QuadraticUtils.curveTo(cp0.x, cp0.y, current[0], current[1], shape.points);
                    } else {
                        PIXI.graphicsUtils.BezierUtils.curveTo(cp0.x, cp0.y, cp1.x, cp1.y, current[0], current[1], shape.points);
                    }

                    previous = current;
                    current = next;
                    cp0 = next_cp0;
                }
            }

            break;
        default:
            shape = PIXI.Polygon();
            break;
    }

    return shape;
};

Drawing.prototype._pv_getTransform = function (out) {
    const matrix = out ? out.identity() : new PIXI.Matrix();
    const { x, y, width, height, rotation } = this.data;

    matrix.translate(-width / 2, -height / 2);
    matrix.rotate(Math.toRadians(rotation || 0));
    matrix.translate(x + width / 2, y + height / 2);

    return matrix;
};

Drawing.prototype._pv_getLocalPosition = function (globalPosition, out) {
    return this._pv_getTransform(tempMatrix).applyInverse(globalPosition, out);
};

Drawing.prototype._pv_getGlobalPosition = function (localPosition, out) {
    return this._pv_getTransform(tempMatrix).apply(localPosition, out);
};
