import { patch } from "../utils/patch.js";
import { RaySystem } from "../core/walls.js";

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

        if (!this._original) {
            // TODO: ref count sprite?
            if (this.tile && this.data.overhead && !this.isRoof) {
                if (!this._pv_occlusionTile) {
                    this._pv_occlusionTile = canvas.foreground._pv_occlusionTiles.addChild(this._pv_createSprite());
                    this._pv_occlusionTile.name = this.name;
                    this._pv_occlusionTile.tint = 0x000000;
                    this._pv_occlusionTile.mask = null;
                } else {
                    this._pv_occlusionTile.texture = this.texture;
                    this._pv_occlusionTile.width = this.tile.width;
                    this._pv_occlusionTile.height = this.tile.height;
                    this._pv_occlusionTile.anchor = this.tile.anchor;
                    this._pv_occlusionTile.pivot = this.tile.pivot;
                    this._pv_occlusionTile.position.set(this.data.x + this.tile.position.x, this.data.y + this.tile.position.y);
                    this._pv_occlusionTile.rotation = this.tile.rotation;
                    this._pv_occlusionTile.skew = this.tile.skew;
                    this._pv_occlusionTile.alpha = this.tile.alpha;
                    this._pv_occlusionTile.geometry.refCount--;

                    if (this._pv_occlusionTile.geometry.refCount === 0) {
                        this._pv_occlusionTile.geometry.dispose();
                    }
                }

                this._pv_occlusionTile.transform.updateLocalTransform();

                const data = new Float32Array(16);
                const trim = this.texture.trim;
                const orig = this.texture.orig;
                const uvs = this.texture._uvs.uvsFloat32;
                const anchor = this._pv_occlusionTile.anchor;
                const { a, b, c, d, tx, ty } = this._pv_occlusionTile.transform.localTransform;

                let w0 = 0;
                let w1 = 0;
                let h0 = 0;
                let h1 = 0;

                if (trim) {
                    w1 = trim.x - anchor.x * orig.width;
                    w0 = w1 + trim.width;

                    h1 = trim.y - anchor.y * orig.height;
                    h0 = h1 + trim.height;
                } else {
                    w1 = -anchor.x * orig.width;
                    w0 = w1 + orig.width;

                    h1 = -anchor.y * orig.height;
                    h0 = h1 + orig.height;
                }

                data[0] = a * w1 + c * h1 + tx;
                data[1] = d * h1 + b * w1 + ty;
                data[2] = uvs[0];
                data[3] = uvs[1];
                data[4] = a * w0 + c * h1 + tx;
                data[5] = d * h1 + b * w0 + ty;
                data[6] = uvs[2];
                data[7] = uvs[3];
                data[8] = a * w0 + c * h0 + tx;
                data[9] = d * h0 + b * w0 + ty;
                data[10] = uvs[4];
                data[11] = uvs[5];
                data[12] = a * w1 + c * h0 + tx;
                data[13] = d * h0 + b * w1 + ty;
                data[14] = uvs[6];
                data[15] = uvs[7];

                const xMin = Math.min(data[0], data[4], data[8], data[12]);
                const xMax = Math.max(data[0], data[4], data[8], data[12]);
                const yMin = Math.min(data[1], data[5], data[9], data[13]);
                const yMax = Math.max(data[1], data[5], data[9], data[13]);
                const bounds = new PIXI.Rectangle(xMin, yMin, xMax - xMin, yMax - yMin);

                const buffer = new PIXI.Buffer(data, true, false);
                const geometry = new PIXI.Geometry()
                    .addAttribute("aVertexPosition", buffer, 2, false, PIXI.TYPES.FLOAT)
                    .addAttribute("aTextureCoord", buffer, 2, false, PIXI.TYPES.FLOAT);

                geometry.drawMode = PIXI.DRAW_MODES.TRIANGLE_FAN;
                geometry.bounds = bounds;
                geometry.refCount++;

                this._pv_occlusionTile.geometry = geometry;

                canvas.lighting._pv_buffer?.invalidate(true);
            } else {
                if (this._pv_occlusionTile) {
                    this._pv_occlusionTile.geometry.refCount--;

                    if (this._pv_occlusionTile.geometry.refCount === 0) {
                        this._pv_occlusionTile.geometry.dispose();
                    }

                    this._pv_occlusionTile.destroy();
                    this._pv_occlusionTile = null;

                    canvas.lighting._pv_buffer?.invalidate(true);
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
            canvas.lighting._pv_buffer.invalidate(true);
        }
    });

    patch("Levels.prototype.lightClearOcclusions", "OVERRIDE", function (lightIndex) {
        const light = lightIndex.light;

        if (light.source._pv_occlusionTiles?.length > 0) {
            canvas.lighting._pv_buffer.invalidate(true);
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

        const tElev = cToken.losHeight;
        let refresh = false;

        for (const drawing of canvas.scene.drawings.map(document => document.object)) {
            const { rangeBottom, rangeTop } = this.getFlagsForObject(drawing);

            if (!rangeBottom && rangeBottom != 0) {
                continue;
            }

            const skipRender = !(rangeBottom <= tElev && tElev <= rangeTop);

            if (drawing.skipRender !== skipRender) {
                drawing.skipRender = skipRender;

                refresh = true;
            }
        }

        if (refresh) {
            canvas.perception.schedule({ lighting: { refresh: true } });
        }

        return result;
    });

    patch("Levels.prototype.overrideVisibilityTest", "OVERRIDE", function (sourceToken, token) {
        if (canvas.lighting._pv_uniformVision) {
            if (canvas.lighting._pv_vision) {
                return true;
            }
        } else {
            const point = token.center;
            const t = Math.min(token.w, token.h) / 4;
            const offsets = t > 0 ? [[0, 0], [-t, 0], [t, 0], [0, -t], [0, t], [-t, -t], [-t, t], [t, t], [t, -t]] : [[0, 0]];
            const points = offsets.map(o => new PIXI.Point(point.x + o[0], point.y + o[1]));

            if (points.some(p => canvas.lighting._pv_getArea(p)._pv_vision)) {
                return true;
            }
        }
    });

    patch("Levels.prototype.tokenInRange", "OVERRIDE", function (sourceToken, token) {
        let range = sourceToken.vision.fov.radius;

        if (canvas.lighting._pv_uniformGlobalLight) {
            if (canvas.lighting._pv_globalLight) {
                range = Infinity;
            }
        } else {
            const point = token.center;
            const t = Math.min(token.w, token.h) / 4;
            const offsets = t > 0 ? [[0, 0], [-t, 0], [t, 0], [0, -t], [0, t], [-t, -t], [-t, t], [t, t], [t, -t]] : [[0, 0]];
            const points = offsets.map(o => new PIXI.Point(point.x + o[0], point.y + o[1]));

            if (points.some(p => canvas.lighting._pv_getArea(p)._pv_globalLight)) {
                range = Infinity;
            }
        }

        range = Math.min(range, sourceToken.vision._pv_sightLimit);

        if (range === 0) {
            return false;
        }

        const unitsToPixel = canvas.dimensions.size / canvas.dimensions.distance;
        const x1 = sourceToken.center.x;
        const y1 = sourceToken.center.y;
        const x2 = token.center.x;
        const y2 = token.center.y;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2);
        const adjust = Math.min(token.w, token.h) * 0.49;

        if (dist - adjust > range) {
            return false;
        }

        const z1 = this.getTokenLOSheight(sourceToken) * unitsToPixel;
        const z2 = this.getTokenLOSheight(token) * unitsToPixel;
        const dz = z2 - z1;
        const rdx = RaySystem.round(dx);
        const rdy = RaySystem.round(dy);

        if (rdx === 0 && rdy === 0) {
            return Math.abs(dz) - adjust <= Math.min(range, sourceToken.vision._pv_area._pv_sightLimit);
        }

        const t = canvas._pv_raySystem.castRay(
            RaySystem.round(x1),
            RaySystem.round(y1),
            rdx,
            rdy,
            RaySystem.round(dz),
            sourceToken.vision._pv_minRadius,
            dist
        );

        const distance = Math.sqrt(dist2 + dz * dz);

        return distance - adjust <= Math.min(range, distance * t);
    });
});
