import { patch } from "../utils/patch.js";
import { hasChanged } from "../utils/helpers.js";
import { Region } from "../utils/region.js";
import { LightingSystem } from "./lighting-system.js";
import { Logger } from "../utils/logger.js";

Hooks.once("init", () => {
    patch("Drawing.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        if (this.id) {
            this._pv_updateLighting();
        }

        return await wrapped(...args);
    });

    patch("Drawing.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (this.destroyed || this.shape.destroyed || !this.id) {
            return this;
        }

        this._pv_refreshWarning();

        if (LightingSystem.instance.updateRegion(`Drawing.${this.document.id}`, { hidden: !!this.skipRender })) {
            canvas.perception.schedule({ lighting: { refresh: true } });
        }

        return this;
    });

    patch("Drawing.prototype.destroy", "WRAPPER", function (wrapped, ...args) {
        if (this.id) {
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
    const id = `Drawing.${this.document.id}`;
    let active;

    this._pv_invalid = false;

    if (!deleted && (active = !!this.document.getFlag("perfect-vision", "active"))) {
        const hidden = !!this.skipRender /* Levels */;

        let parent = this.document.getFlag("perfect-vision", "parent");

        if (parent) {
            parent = `Drawing.${parent}`;
        } else {
            parent = "Scene";
        }

        const fit = !!this.document.getFlag("perfect-vision", "fit");

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

        const walls = !!this.document.getFlag("perfect-vision", "walls");

        let fogExploration = this.document.getFlag("perfect-vision", "fogExploration");

        if (fogExploration !== undefined) {
            fogExploration = !!fogExploration;
        }

        let revealed = this.document.getFlag("perfect-vision", "revealed");

        if (revealed !== undefined) {
            revealed = !!revealed;
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
                ? Math.max(sightLimit, 0) * (canvas.dimensions.size / canvas.dimensions.distance)
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

        if (!LightingSystem.instance.hasRegion(id)) {
            const shape = Region.from(this._pv_getShape(), transform);

            if (shape.strictlySimple) {
                LightingSystem.instance.addRegion(id, {
                    active, hidden, parent, shape, fit, z, origin, walls, vision, globalLight, globalLightThreshold,
                    sightLimit, daylightColor, darknessColor, darkness, saturation, fogExploration, revealed,
                    inset: canvas.dimensions._pv_inset
                });

                if (!defer) {
                    canvas.perception.schedule({ lighting: { refresh: true } });
                }
            } else {
                if (game.user.isGM) {
                    ui.notifications.error(`[Perfect Vision] ${id} is invalid!`);
                }

                Logger.warn(`${id} is invalid!`);
                this._pv_invalid = true;
            }
        } else {
            if (skipUpdateShape) {
                if (LightingSystem.instance.updateRegion(id, {
                    active, hidden, parent, fit, z, origin, walls, vision, globalLight, globalLightThreshold,
                    sightLimit, daylightColor, darknessColor, darkness, saturation, fogExploration, revealed
                })) {
                    if (!defer) {
                        canvas.perception.schedule({ lighting: { refresh: true } });
                    }
                }
            } else {
                const shape = Region.from(this._pv_getShape(), transform);

                if (shape.strictlySimple) {
                    if (LightingSystem.instance.updateRegion(id, {
                        active, hidden, parent, shape, fit, z, origin, walls, vision, globalLight, globalLightThreshold,
                        sightLimit, daylightColor, darknessColor, darkness, saturation, fogExploration, revealed
                    })) {
                        if (!defer) {
                            canvas.perception.schedule({ lighting: { refresh: true } });
                        }
                    }
                } else {
                    if (game.user.isGM) {
                        ui.notifications.error(`[Perfect Vision] ${id} is invalid!`);
                    }

                    Logger.warn(`${id} is invalid!`);
                    this._pv_invalid = true;

                    if (LightingSystem.instance.deleteRegion(id)) {
                        if (!defer) {
                            canvas.perception.schedule({ lighting: { refresh: true } });
                        }
                    }
                }
            }
        }
    } else {
        if (LightingSystem.instance.deleteRegion(id)) {
            if (!defer) {
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }
    }

    this._pv_refreshWarning();
};

Drawing.prototype._pv_refreshWarning = function () {
    if (!game.user.isGM) {
        return;
    }

    if (this._pv_invalid) {
        if (!this._pv_invalidWarning || this._pv_invalidWarning.destroyed) {
            this._pv_invalidWarning = this.addChildAt(
                new PIXI.Graphics()
                    .beginFill(0xff0000)
                    .drawPolygon([
                        0.9238795042037964, 0.3826834261417389,
                        0.3826834261417389, 0.9238795042037964,
                        -0.3826834261417389, 0.9238795042037964,
                        -0.9238795042037964, 0.3826834261417389,
                        -0.9238795042037964, -0.3826834261417389,
                        -0.3826834261417389, -0.9238795042037964,
                        0.3826834261417389, -0.9238795042037964,
                        0.9238795042037964, -0.3826834261417389
                    ])
                    .endFill()
                    .beginHole()
                    .drawRect(-0.1, -0.6, 0.2, 0.8)
                    .drawRect(-0.1, +0.4, 0.2, 0.2)
                    .endHole(),
                0);
        }

        const { width, height } = this.data;

        this._pv_invalidWarning.width = this._pv_invalidWarning.height = Math.max(width, height);
        this._pv_invalidWarning.x = width / 2;
        this._pv_invalidWarning.y = height / 2;
        this._pv_invalidWarning.visible = this.layer._active;
        this._pv_invalidWarning.alpha = this._controlled ? 0.25 : 0.5;
    } else if (this._pv_invalidWarning) {
        if (!this._pv_invalidWarning.destroyed) {
            this._pv_invalidWarning.destroy(true);
        }

        this._pv_invalidWarning = null;
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

            if (!points || points.length < 3) {
                break;
            }

            for (const point of points) {
                shape.points.push(point[0], point[1]);
            }

            Region.dedupePolygon(shape);

            break;
        case CONST.DRAWING_TYPES.FREEHAND:
            shape = new PIXI.Polygon();

            if (!points || points.length < 3) {
                break;
            }

            for (const point of points) {
                shape.points.push(point[0], point[1]);
            }

            Region.dedupePolygon(shape);
            Region.smoothPolygon(shape, this.data.bezierFactor ?? 0.5);

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
