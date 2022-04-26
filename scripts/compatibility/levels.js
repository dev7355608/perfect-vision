import { LightingSystem } from "../core/lighting-system.js";
import { LimitSystem } from "../core/limit-system.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";
import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("levels")?.active) {
        return;
    }

    function onTick() {
        const container = canvas.foreground._pv_occlusionTiles;
        const cacheParent = container.enableTempParent();

        container.updateTransform();
        container.disableTempParent(cacheParent);
    }

    patch("ForegroundLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        let container = this._pv_occlusionTiles;

        if (container) {
            container.transform.reference = canvas.stage.transform;

            for (const child of container.children) {
                child._parentID = -1;
            }
        } else {
            container = this._pv_occlusionTiles = new PIXI.Container();
            container.transform = new SynchronizedTransform(canvas.stage.transform);
        }

        canvas.app.ticker.add(onTick, undefined, PIXI.UPDATE_PRIORITY.LOW + 2);

        await wrapped(...args);

        return this;
    });

    patch("ForegroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        const container = this._pv_occlusionTiles;

        container.transform.reference = PIXI.Transform.IDENTITY;

        for (const child of container.children) {
            child._parentID = -1;
        }

        canvas.app.ticker.remove(onTick);

        return await wrapped(...args);
    });

    patch("ForegroundLayer.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        for (const tile of this.tiles) {
            if (tile.tile && this._pv_occlusionTile) {
                this._pv_occlusionTile.alpha = tile.tile.alpha;
            }
        }

        return this;
    });

    patch("Tile.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (this.id) {
            // TODO: ref count sprite?
            if (this.tile && this.data.overhead && !this.isRoof) {
                if (!this._pv_occlusionTile) {
                    this._pv_occlusionTile = canvas.foreground._pv_occlusionTiles.addChild(this._pv_createSprite());
                    this._pv_occlusionTile.name = this.name;
                    this._pv_occlusionTile.tint = 0x000000;
                } else {
                    this._pv_occlusionTile.texture = this.texture;
                    this._pv_occlusionTile.width = this.tile.width;
                    this._pv_occlusionTile.height = this.tile.height;
                    this._pv_occlusionTile.anchor = this.tile.anchor;
                    this._pv_occlusionTile.pivot = this.tile.pivot;
                    this._pv_occlusionTile.position.set(this.data.x + this.tile.position.x, this.data.y + this.tile.position.y);
                    this._pv_occlusionTile.rotation = this.tile.rotation;
                    this._pv_occlusionTile.skew = this.tile.skew;
                    this._pv_occlusionTile.geometry.refCount--;

                    if (this._pv_occlusionTile.geometry.refCount === 0) {
                        this._pv_occlusionTile.geometry.dispose();
                    }
                }

                this._pv_occlusionTile.alpha = this.data.alpha;
                this._pv_occlusionTile.geometry = this._pv_getGeometry();
                this._pv_occlusionTile.geometry.refCount++;

                CanvasFramebuffer.get("lighting")?.invalidate();
            } else {
                if (this._pv_occlusionTile) {
                    this._pv_occlusionTile.geometry.refCount--;

                    if (this._pv_occlusionTile.geometry.refCount === 0) {
                        this._pv_occlusionTile.geometry.dispose();
                    }

                    this._pv_occlusionTile.destroy();
                    this._pv_occlusionTile = null;

                    CanvasFramebuffer.get("lighting")?.invalidate();
                }
            }
        }

        return this;
    });

    patch("Tile.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_occlusionTile && !this._pv_occlusionTile.destroyed) {
            this._pv_occlusionTile.destroy();
        }

        this._pv_occlusionTile = null;

        wrapped(options);
    });

    patch("Levels.prototype.lightComputeOcclusion", "WRAPPER", function (wrapped, lightIndex, elevation, allTiles) {
        wrapped(lightIndex, elevation, allTiles);

        const light = lightIndex.light;

        light.source._pv_occlusionTiles = [];

        for (const tileIndex of light.occlusionTiles) {
            const tile = tileIndex.tile;

            if (tile._pv_occlusionTile) {
                light.source._pv_occlusionTiles.push(tile._pv_occlusionTile);
            }
        }

        if (light.source._pv_occlusionTiles.length > 0) {
            CanvasFramebuffer.get("lighting").invalidate();
        }
    });

    patch("Levels.prototype.lightClearOcclusions", "OVERRIDE", function (lightIndex) {
        const light = lightIndex.light;

        if (light.source._pv_occlusionTiles?.length > 0) {
            CanvasFramebuffer.get("lighting").invalidate();
        }

        light.occlusionTiles = null;
        light.source._pv_occlusionTiles = null;
    });

    patch("Levels.prototype.occludeLights", "OVERRIDE", function (tileIndex, lightIndex) { });

    patch("Levels.prototype.unoccludeLights", "OVERRIDE", function (tileIndex, lightIndex, justTile = false) { });

    patch("Levels.prototype.computeDrawings", "POST", function (result, cToken) {
        if (!cToken) {
            return result;
        }

        const tElev = cToken.data.elevation;
        let refresh = false;

        for (const drawing of canvas.scene.drawings.map(document => document.object)) {
            const { rangeBottom, rangeTop } = this.getFlagsForObject(drawing);
            const hidden = drawing.skipRender = !(!rangeBottom && rangeBottom != 0) && !(rangeBottom <= tElev && tElev <= rangeTop);

            if (LightingSystem.instance.updateRegion(`Drawing.${drawing.document.id}`, { hidden })) {
                refresh = true;
            }
        }

        if (refresh) {
            canvas.perception.schedule({ lighting: { refresh: true } });
        }

        return result;
    });

    const offsets = [
        [0, 0],
        [-1, 0],
        [+1, 0],
        [0, -1],
        [0, +1],
        [-Math.SQRT1_2, -Math.SQRT1_2],
        [-Math.SQRT1_2, +Math.SQRT1_2],
        [+Math.SQRT1_2, +Math.SQRT1_2],
        [+Math.SQRT1_2, -Math.SQRT1_2]
    ].map(args => new PIXI.Point(...args));
    const tempPoint = new PIXI.Point();

    patch("Levels.prototype.overrideVisibilityTest", "OVERRIDE", function (sourceToken, token) {
        const vision = LightingSystem.instance.vision;

        if (vision !== undefined) {
            if (vision) {
                return true;
            }
        } else {
            const point = token.center;
            const tolerance = token.w * 0.475;

            for (const offset of offsets) {
                const p = tempPoint.set(point.x + tolerance * offset.x, point.y + tolerance * offset.y);
                const region = LightingSystem.instance.getActiveRegionAtPoint(p) ?? LightingSystem.instance.getRegion("Scene");

                if (region.vision) {
                    return true;
                }
            }
        }
    });

    patch("Levels.prototype.tokenInRange", "OVERRIDE", function (sourceToken, token) {
        const globalLight = LightingSystem.instance.globalLight;

        if (globalLight !== undefined) {
            if (globalLight) {
                return true;
            }
        } else {
            const point = token.center;
            const tolerance = token.w * 0.475;

            for (const offset of offsets) {
                const p = tempPoint.set(point.x + tolerance * offset.x, point.y + tolerance * offset.y);
                const region = LightingSystem.instance.getActiveRegionAtPoint(p) ?? LightingSystem.instance.getRegion("Scene");

                if (region.globalLight) {
                    return true;
                }
            }
        }

        const range = sourceToken.vision.fov?.radius ?? 0;

        if (range === 0) {
            return false;
        }

        const unitsToPixels = canvas.dimensions.size / canvas.dimensions.distance;
        const x0 = sourceToken.center.x;
        const y0 = sourceToken.center.y;
        const z0 = sourceToken.losHeight * unitsToPixels;
        const x1 = token.center.x;
        const y1 = token.center.y;
        const z1 = token.losHeight * unitsToPixels;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const adjust = token.w * 0.495;

        return distance - adjust <= range;
    });

    patch("Levels.prototype.testCollision", "WRAPPER", function (wrapped, p0, p1, type = "sight", token) {
        let collision = wrapped(p0, p1, type, token);

        if (type !== "sight") {
            return collision;
        }

        if (collision) {
            p1 = collision;
        }

        const unitsToPixels = canvas.dimensions.size / canvas.dimensions.distance;
        const x0 = p0.x;
        const y0 = p0.y;
        const z0 = p0.z * unitsToPixels;
        let x1 = p1.x;
        let y1 = p1.y;
        let z1 = p1.z * unitsToPixels;
        let dx = x1 - x0;
        let dy = y1 - y0;
        let dz = z1 - z0;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const range = token?.vision._pv_sightLimit ?? Infinity;

        if (distance > range) {
            const t = range / distance;

            dx *= t;
            dy *= t;
            dz *= t;
            x1 = x0 + dx;
            y1 = y0 + dy;
            z1 = z0 + dz;

            collision = { x: x1, y: y1, z: z1 / unitsToPixels };
        }

        const t = LimitSystem.instance.castRay(x0, y0, dx, dy, dz, token?.vision._pv_minRadius ?? 0);

        return t < 0.99998 ? { x: x0 + dx * t, y: y0 + dy * t, z: (z0 + dz * t) / unitsToPixels } : collision;
    });
});
