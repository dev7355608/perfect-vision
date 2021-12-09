import { StencilMask, StencilMaskData } from "../utils/stencil-mask.js";
import { patch } from "../utils/patch.js";
import { TransformedShape } from "../utils/transformed-shape.js";

Hooks.once("init", () => {
    patch("SightLayer.prototype.draw", "WRAPPER", async function (wrapped) {
        await wrapped();

        this.pending.filters = null;

        this.filter.autoFit = true;
        this.filter.resolution = canvas.app.renderer.resolution;
        this.filterArea = canvas.app.renderer.screen;

        this._pv_contourOptions = { maxZoomLevel: canvas.performance.blur.enabled ? 0.25 : 0.5, arrayType: Float32Array };
        this._pv_circle = new TransformedShape(new PIXI.Circle(0, 0, canvas.dimensions.size / 2)).generateContour(this._pv_contourOptions);

        for (let i = 0; i < this._pv_circle.length; i++) {
            this._pv_circle[i] /= canvas.dimensions.size / 2;
        }

        return this;
    });

    patch("SightLayer.prototype._createCachedMask", "OVERRIDE", function () { });

    patch("SightLayer.prototype._createVisionContainer", "OVERRIDE", function () {
        const c = new PIXI.Container();

        c._explored = false;

        c._pv_fov = c.addChild(new StencilMask());
        c._pv_los = c.addChild(new StencilMask());
        c._pv_rect = c.addChild(new PIXI.LegacyGraphics().beginFill(0xFFFFFF).drawShape(canvas.dimensions.rect).endFill());
        c._pv_rect.mask = new StencilMaskData(c._pv_fov);
        c.mask = new StencilMaskData(c._pv_los);

        // Assign to the instance
        this.vision = c;
        this.los = c._pv_los;

        return c;
    });

    patch("SightLayer.prototype.refresh", "OVERRIDE", function ({ forceUpdateFog = false, skipUpdateFog = false } = {}) {
        if (!this._initialized) {
            return;
        }

        if (!this.tokenVision) {
            this.visible = false;

            return this.restrictVisibility();
        }

        // Configuration variables
        const d = canvas.dimensions;
        let commitFog = false;

        // Stage the prior vision container to be saved to the FOW texture
        const prior = this.explored.removeChild(this.vision);

        if (prior._explored && !skipUpdateFog) {
            const exploredColor = CONFIG.Canvas.exploredColor;

            prior._pv_rect.tint = exploredColor;

            this.pending.addChild(prior);

            commitFog = this.pending.children.length >= this.constructor.FOG_COMMIT_THRESHOLD;
        } else {
            prior.destroy({ children: true });
        }

        // Create a new vision container for this frame
        const vision = this._createVisionContainer();

        this.explored.addChild(vision);

        // Draw standard vision sources
        let inBuffer = canvas.scene.data.padding === 0;

        {
            const geometry = canvas.lighting._pv_geometry;
            const drawMode = geometry.drawMode;
            const { size: fovSize, start: fovStart } = geometry.segments.fov;

            vision._pv_fov.draw(!canvas.lighting._pv_vision && !canvas.lighting._pv_globalLight, geometry, drawMode, fovSize, fovStart);
            vision._pv_los.draw(!canvas.lighting._pv_vision, geometry, drawMode, fovSize, fovStart);
        }

        for (const area of canvas.lighting._pv_areas) {
            const geometry = area._pv_geometry;
            const drawMode = geometry.drawMode;
            const { size: fovSize, start: fovStart } = geometry.segments.fov;

            if (area._pv_los) {
                const { size: losSize, start: losStart } = geometry.segments.los;

                vision._pv_fov.pushMask(false, geometry, drawMode, losSize, losStart);
                vision._pv_los.pushMask(false, geometry, drawMode, losSize, losStart);
            }

            vision._pv_fov.draw(!area._pv_vision && !area._pv_globalLight, geometry, drawMode, fovSize, fovStart);
            vision._pv_los.draw(!area._pv_vision, geometry, drawMode, fovSize, fovStart);

            if (area._pv_los) {
                vision._pv_fov.popMasks();
                vision._pv_los.popMasks();
            }
        }

        // Draw field-of-vision for lighting sources
        for (const source of canvas.lighting.sources) {
            if (!this.sources.size || !source.active) {
                continue;
            }

            if (source._pv_occlusionTiles && source.data.walls) {
                let occluded = false;

                for (const occlusionTile of source._pv_occlusionTiles) {
                    if (occlusionTile.destroyed || !occlusionTile.visible || !occlusionTile.renderable || occlusionTile.worldAlpha <= 0) {
                        continue;
                    }

                    if (!occlusionTile.geometry.bounds.intersects(source._pv_geometry.bounds)) {
                        continue;
                    }

                    if (!occluded) {
                        occluded = true;

                        vision._pv_fov.pushMaskFill();

                        if (source.data.vision) {
                            vision._pv_los.pushMaskFill();
                        }
                    }

                    const geometry = occlusionTile.geometry;
                    const drawMode = geometry.drawMode;
                    const texture = occlusionTile.texture;
                    const alphaThreshold = 0.75;

                    vision._pv_fov.pushMask(true, geometry, drawMode, 4, 0, texture, alphaThreshold);

                    if (source.data.vision) {
                        vision._pv_los.pushMask(true, geometry, drawMode, 4, 0, texture, alphaThreshold);
                    }
                }
            }

            const geometry = source._pv_geometry;
            const drawMode = geometry.drawMode;
            const { size, start } = geometry.segments.los;

            vision._pv_fov.draw(false, geometry, drawMode, size, start);
            vision._pv_fov.popMasks();

            // Some ambient lights provide vision
            if (source.data.vision) {
                vision._pv_los.draw(false, geometry, drawMode, size, start);
                vision._pv_los.popMasks();
            }
        }

        if (this.sources.size) {
            // TODO: draw instanced
            const c = this._pv_circle;
            const m = c.length;
            const n = m >>> 1;
            const s = this.sources.size;

            let i = 0;
            let j = s;

            const vertices = new Float32Array(j * (m + 4) - 4);

            for (const source of this.sources) {
                const { x, y } = source.data;
                const r = source._pv_minRadius;

                if (j < s) {
                    vertices[i++] = x + c[0] * r;
                    vertices[i++] = y + c[1] * r;
                }

                for (let k = 0; k < n; k += 2) {
                    vertices[i++] = x + c[k] * r;
                    vertices[i++] = y + c[k + 1] * r;
                    vertices[i++] = x + c[m - 2 - k] * r;
                    vertices[i++] = y + c[m - 1 - k] * r;
                }

                if (m % 2) {
                    vertices[i++] = x + c[n] * r;
                    vertices[i++] = y + c[n + 1] * r;
                }

                if (--j) {
                    const k = i;

                    vertices[i++] = vertices[k - 2];
                    vertices[i++] = vertices[k - 1];
                }
            }

            const geometry = new PIXI.Geometry().addAttribute("aVertexPosition", new PIXI.Buffer(vertices, true, false), 2, false, PIXI.TYPES.FLOAT);
            const drawMode = PIXI.DRAW_MODES.TRIANGLE_STRIP;

            vision._pv_fov.draw(false, geometry, drawMode)
        }

        // Draw sight-based visibility for each vision source
        for (const source of this.sources) {
            source.active = true;

            if (!inBuffer && !d.sceneRect.contains(source.x, source.y)) {
                inBuffer = true;
            }

            const geometry = source._pv_geometry;
            const drawMode = geometry.drawMode;
            const { size: losSize, start: losStart } = geometry.segments.los;

            if (source.fov.radius > source.radius) {
                const fovGeometry = source._pv_fovGeometry;

                vision._pv_fov.pushMask(false, fovGeometry, fovGeometry.drawMode, fovGeometry.size, fovGeometry.start);
                vision._pv_fov.draw(false, geometry, drawMode, losSize, losStart);
                vision._pv_fov.popMasks();
            } else if (source.radius > 0) { // Token FOV radius
                const { size: fovSize, start: fovStart } = geometry.segments.fov;

                vision._pv_fov.pushMask(false, geometry, drawMode, fovSize, fovStart);
                vision._pv_fov.draw(false, geometry, drawMode, losSize, losStart);
                vision._pv_fov.popMasks();
            }

            vision._pv_los.draw(false, geometry, drawMode, losSize, losStart); // Token LOS mask

            if (!skipUpdateFog) { // Update fog exploration
                this.updateFog(source, forceUpdateFog);
            }
        }

        // Commit updates to the Fog of War texture
        if (commitFog) {
            this.commitFog();
        }

        // Alter visibility of the vision layer
        this.visible = this.sources.size || !game.user.isGM;
        this.unexplored.tint = CONFIG.Canvas.unexploredColor;

        for (const source of canvas.lighting.sources) {
            source.illumination.shader.uniforms.pv_mask = this.visible;
            source.coloration.shader.uniforms.pv_mask = this.visible;
            source.background.shader.uniforms.pv_mask = this.visible;
            source._pv_delimiter.shader.uniforms.pv_mask = this.visible;
        }

        for (const source of this.sources) {
            source.illumination.shader.uniforms.pv_mask = this.visible;
            source._pv_delimiter.shader.uniforms.pv_mask = this.visible;
        }

        // Apply a mask to the exploration container
        if (this.explored.msk) {
            const noMask = this.sources.size && inBuffer;

            this.explored.mask = noMask ? null : this.explored.msk;
            this.explored.msk.visible = !noMask;
        }

        // Alter visibility of the lighting layer
        canvas.lighting.illumination.primary.mask = this.visible ? this.los : null;
        canvas.lighting.coloration.mask = this.visible ? this.los : null;
        canvas.lighting.background.mask = this.visible ? this.los : null;

        // Restrict the visibility of other canvas objects
        this._inBuffer = inBuffer;
        this.restrictVisibility();
    });

    patch("SightLayer.prototype.testVisibility", "OVERRIDE", function (point, { tolerance = 2, object = null } = {}) {
        const visionSources = this.sources;
        const lightSources = canvas.lighting.sources;

        if (!visionSources.size) {
            return game.user.isGM;
        }

        // Determine the array of offset points to test
        const t = tolerance;
        const offsets = t > 0 ? [[0, 0], [-t, 0], [t, 0], [0, -t], [0, t], [-t, -t], [-t, t], [t, t], [t, -t]] : [[0, 0]];
        const points = offsets.map(o => new PIXI.Point(point.x + o[0], point.y + o[1]));

        // If the point is inside the buffer region, it may be hidden from view
        if (!this._inBuffer) {
            const sceneRect = canvas.dimensions.sceneRect;

            if (points.every(p => !sceneRect.contains(p.x, p.y))) {
                return false;
            }
        }

        let vision = canvas.lighting._pv_vision;

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            for (const area of areas) {
                if (vision !== area._pv_vision && (
                    area._pv_vision && points.some(p => area._pv_geometry.containsPoint(p)) ||
                    !area._pv_vision && points.every(p => area._pv_geometry.containsPoint(p)))) {
                    vision = area._pv_vision;
                }
            }
        }

        if (vision) {
            return true;
        }

        // We require both LOS and FOV membership for a point to be visible
        let hasLOS = false;
        let hasFOV = false;

        // Check vision sources
        for (const source of visionSources.values()) {
            if (!source.active) {
                continue;
            }

            if (!hasLOS && points.some(p => source._pv_los.containsPoint(p))) {
                hasLOS = true;
            }

            if (!hasFOV && points.some(p => source._pv_fov.containsPoint(p))) {
                hasFOV = true;
            }

            if (hasLOS && hasFOV) {
                return true;
            }
        }

        // Check light sources
        for (const source of lightSources.values()) {
            if (!source.active) {
                continue;
            }

            if (points.some(p => source._pv_los.containsPoint(p))) {
                if (source.data.vision) {
                    hasLOS = true;
                }

                hasFOV = true;
            }

            if (hasLOS && hasFOV) {
                return true;
            }
        }

        return hasLOS && points.some(p => canvas.lighting._pv_getArea(p)._pv_globalLight);
    });

    patch("FogExploration.prototype.explore", "OVERRIDE", function (source, force = false) {
        let globalLight = canvas.lighting.globalLight;

        for (const area of canvas.lighting._pv_areas) {
            if (globalLight !== area._pv_globalLight) {
                globalLight = undefined;

                break;
            }
        }

        const r = globalLight ? canvas.dimensions.maxR : source.fov.radius;

        if (r < 0) {
            return false;
        }

        const coords = canvas.grid.getCenter(source.x, source.y).map(Math.round).join("_");
        const position = this.data.positions[coords];

        // Check whether the position has already been explored
        let explored = position && (position.limit !== true) && (position.radius >= r);

        if (explored && !force) {
            return false;
        }

        // Update explored positions
        if (CONFIG.debug.fog) {
            console.debug("SightLayer | Updating fog exploration for new explored position.");
        }

        this.data.update({
            positions: {
                [coords]: { radius: source.radius, limit: source.limited || globalLight === undefined }
            }
        });

        return true;
    });
});
