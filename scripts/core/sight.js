import { StencilMask, StencilMaskData } from "../utils/stencil-mask.js";
import { patch } from "../utils/patch.js";
import { Region } from "../utils/region.js";
import { Sprite } from "../utils/sprite.js";
import { GeometrySegment } from "../utils/geometry-segment.js";
import { LightingSystem } from "./lighting-system.js";
import { LimitSystem } from "./limit-system.js";
import { SightSystem } from "./sight-system.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";

Hooks.once("init", () => {
    patch("SightLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        this._pv_bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);

        await wrapped(...args);

        this.filter.autoFit = true;
        this.filter.resolution = canvas.app.renderer.resolution;
        this.filterArea = canvas.app.renderer.screen;

        this._pv_circle = new Region(new PIXI.Circle(0, 0, canvas.dimensions.size)).contour;

        for (let i = 0; i < this._pv_circle.length; i++) {
            this._pv_circle[i] /= canvas.dimensions.size;
            this._pv_circle[i] *= 9 / 10;
        }

        this._pv_vision = new Sprite(SightMaskShader.instance);
        this._pv_vision.x = this._pv_bgRect.x;
        this._pv_vision.y = this._pv_bgRect.y;
        this._pv_vision.width = this._pv_bgRect.width;
        this._pv_vision.height = this._pv_bgRect.height;

        this._pv_debounceRestrictVisibility = (
            () => {
                const restrictVisibility = foundry.utils.debounce(() => {
                    if (this._pv_restrictVisibility) {
                        this.restrictVisibility();
                    }
                }, 50);

                return () => {
                    this._pv_restrictVisibility = true;
                    restrictVisibility();
                };
            }
        )();

        this._pv_exactVisibility = !game.modules.get("levels")?.active;

        if (this._pv_exactVisibility) {
            SightSystem.instance.on("vision", this._pv_debounceRestrictVisibility);
        }

        return this;
    });

    patch("SightLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        if (this._pv_exactVisibility) {
            SightSystem.instance.off("vision", this._pv_debounceRestrictVisibility);
            SightSystem.instance.reset();
        }

        this._pv_debounceRestrictVisibility = null;

        return await wrapped(...args);
    });

    patch("SightLayer.prototype._createCachedMask", "OVERRIDE", function () {
        this.losCache = new PIXI.Container();
        this.losCache.sprite = null;
    });

    patch("SightLayer.prototype._createVisionContainer", "OVERRIDE", function () {
        const c = new PIXI.Container();

        c._explored = false;

        c._pv_fov = c.addChild(new StencilMask());
        c._pv_los = c.addChild(new StencilMask());
        c._pv_rect = c.addChild(new PIXI.LegacyGraphics().beginFill(0xFFFFFF).drawShape(this._pv_bgRect).endFill());
        c._pv_rect.mask = new StencilMaskData(c._pv_fov);
        c.mask = new StencilMaskData(c._pv_los);

        // Assign to the instance
        this.vision = c;
        this.los = c._pv_los;

        return c;
    });

    patch("SightLayer.prototype.initializeSources", "WRAPPER", function (wrapped, ...args) {
        LimitSystem.instance.update();

        return wrapped(...args);
    });

    patch("SightLayer.prototype.refresh", "OVERRIDE", function ({ forceUpdateFog = false, skipUpdateFog = false } = {}) {
        if (!this._initialized) {
            return;
        }

        if (!this.tokenVision) {
            this.visible = false;

            if (this._pv_exactVisibility) {
                SightSystem.instance.reset();
            }

            return this.restrictVisibility();
        }

        // Configuration variables
        const d = canvas.dimensions;
        let commitFog = false;

        // Stage the prior vision container to be saved to the FOW texture
        const prior = this.vision;

        this.explored.removeChild(prior);

        if (prior._explored && !skipUpdateFog) {
            this.pending.addChild(prior);

            commitFog = this.pending.children.length >= this.constructor.FOG_COMMIT_THRESHOLD;
        } else {
            prior.destroy({ children: true });
        }

        // Create a new vision container for this frame
        const vision = this._createVisionContainer();
        let fov;
        let los;
        const fovMask = vision._pv_fov;
        const losMask = vision._pv_los;
        const visionTexture = !this.fogExploration && LightingSystem.instance.globalLight !== undefined;
        const exactVisibility = this._pv_exactVisibility;

        if (exactVisibility) {
            fov = [];
            los = [];
        }

        this.explored.removeChild(this._pv_vision);

        if (!visionTexture) {
            this.explored.addChild(vision);
        } else {
            this.explored.addChild(this._pv_vision);
        }

        // Draw standard vision sources
        let inBuffer = canvas.scene.data.padding === 0;

        for (const region of LightingSystem.instance.activeRegions) {
            if (!visionTexture) {
                if (region.id === "Scene") {
                    fovMask.draw({ hole: !region.vision && !region.globalLight });
                    losMask.draw({ hole: !region.vision });
                } else {
                    region.drawSight(fovMask, losMask);
                }
            }

            if (exactVisibility) {
                if (region.vision || region.globalLight) {
                    fov.push(...region.clos1);
                } else {
                    fov.push(...region.clos2);
                }

                if (region.vision) {
                    los.push(...region.clos1);
                } else {
                    los.push(...region.clos2);
                }
            }
        }

        // Draw field-of-vision for lighting sources
        for (const source of canvas.lighting.sources) {
            if (!this.sources.size || !source.active || source.destroyed) {
                continue;
            }

            if (!visionTexture) {
                source._pv_drawMask(fovMask, losMask);
            }

            if (exactVisibility) {
                fov.push(source._pv_los.contour);

                if (source.data.vision) {
                    los.push(source._pv_los.contour);
                }
            }
        }

        if (!visionTexture) {
            this._pv_drawMinFOV(fovMask);
        }

        // Draw sight-based visibility for each vision source
        for (const source of this.sources) {
            if (source.destroyed) {
                continue;
            }

            source.active = true;

            if (!inBuffer && !d.sceneRect.contains(source.x, source.y)) {
                inBuffer = true;
            }

            if (!visionTexture) {
                source._pv_drawMask(fovMask, losMask);
            }

            if (!skipUpdateFog) { // Update fog exploration
                this.updateFog(source, forceUpdateFog);
            }

            if (exactVisibility) {
                if (source.fov.radius > 0) {
                    fov.push(source._pv_clos.contour);
                }

                los.push(source._pv_los.contour);
            }
        }

        if (exactVisibility) {
            SightSystem.instance.updateVision(fov, los, false);
        }

        // Commit updates to the Fog of War texture
        if (commitFog) {
            this.commitFog();
        }

        // Alter visibility of the vision layer
        this.visible = this.sources.size || !game.user.isGM;

        // Apply a mask to the exploration container
        if (this.explored.msk) {
            const noMask = this.sources.size && inBuffer;

            this.explored.mask = noMask ? null : this.explored.msk;
            this.explored.msk.visible = !noMask;
        }

        // Restrict the visibility of other canvas objects
        this._inBuffer = inBuffer;
        this.restrictVisibility();
    });

    const radialOffsets = [
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
    const doorOffsets = [new PIXI.Point(), new PIXI.Point()];
    const tempPoint = new PIXI.Point();

    patch("SightLayer.prototype.testVisibility", "OVERRIDE", function (point, { tolerance = 2, object = null } = {}) {
        const visionSources = this.sources;
        const lightSources = canvas.lighting.sources;

        if (!visionSources.size) {
            return game.user.isGM;
        }

        let polygon;
        let offsets = radialOffsets;

        if (object instanceof Token) {
            const v = object._velocity;

            point = {
                x: point.x - v.sx,
                y: point.y - v.sy
            };

            polygon = object._pv_getVisibilityPolygon(point);
            tolerance = polygon.radius * Math.SQRT1_2;
        } else if (object instanceof DoorControl) {
            const c = object.wall.data.c;
            const s = Math.hypot(c[0] - c[2], c[1] - c[3]);
            const x = (c[1] - c[3]) / s;
            const y = (c[2] - c[0]) / s;

            offsets = doorOffsets;
            offsets[0].set(x, y);
            offsets[1].set(-x, -y);
        }

        if (!this._pv_exactVisibility) {
            polygon = null;
        }

        const exact = this._pv_exactVisibility && canvas.tokens.preview.children.length === 0;

        if (!this._inBuffer) {
            const sceneRect = canvas.dimensions._pv_sceneRect;

            if (!sceneRect.intersectsCircle(point, polygon?.radius ?? tolerance)) {
                return false;
            }
        }

        const vision = LightingSystem.instance.vision;

        if (vision === true) {
            return true;
        }

        for (let i = 0, n = offsets.length; i < n; i++) {
            const offset = offsets[i];
            const p = tempPoint.set(point.x + tolerance * offset.x, point.y + tolerance * offset.y);

            if (i > 0 && polygon) {
                if (!polygon.computed) {
                    break;
                }

                if (!polygon.contains(p.x, p.y)) {
                    continue;
                }
            }

            if (exact) {
                const visible = SightSystem.instance.testVisibility(polygon ?? { origin: p });

                if (visible !== undefined) {
                    if (visible) {
                        return true;
                    }

                    if (polygon) {
                        break;
                    }

                    continue;
                }
            }

            const globalLight = LightingSystem.instance.globalLight;

            let hasLOS = false;
            let hasFOV = globalLight;

            if (vision === undefined || globalLight === undefined) {
                const region = LightingSystem.instance.getActiveRegionAtPoint(p) ?? LightingSystem.instance.getRegion("Scene");

                if (region.vision) {
                    return true;
                }

                if (region.globalLight) {
                    hasFOV = true;
                }
            }

            for (const source of visionSources.values()) {
                if (!source.active || source.destroyed) {
                    continue;
                }

                if ((!hasLOS || source.fov.radius > 0) && source._pv_los.containsPoint(p)) {
                    if (!hasFOV && source._pv_fov.containsPoint(p)) {
                        hasFOV = true;
                    }

                    if (hasFOV) {
                        return true;
                    }

                    hasLOS = true;
                }
            }

            for (const source of lightSources.values()) {
                if (!source.active || source.destroyed) {
                    continue;
                }

                if ((hasLOS || source.data.vision) && source._pv_los.containsPoint(p)) {
                    return true;
                }
            }
        }

        return false;
    });

    patch("FogExploration.prototype.explore", "OVERRIDE", function (source, force = false) {
        const globalLight = LightingSystem.instance.globalLight;
        const radius = Math.min(globalLight ? canvas.dimensions.maxR : source.fov.radius, source.los.config.radius);

        if (radius < 0) {
            return false;
        }

        const coords = canvas.grid.getCenter(source.x, source.y).map(Math.round).join("_");
        const position = this.data.positions[coords];

        // Check whether the position has already been explored
        const explored = position && position.limit !== true && position.radius >= radius;

        if (explored && !force) {
            return false;
        }

        const limit = source.limited || source.los._pv_limited === true || globalLight === undefined;

        // Update explored positions
        if (CONFIG.debug.fog) {
            console.debug("SightLayer | Updating fog exploration for new explored position.");
        }

        this.data.update({
            positions: {
                [coords]: { radius, limit }
            }
        });

        return true;
    });
});

Hooks.on("sightRefresh", () => {
    canvas.sight._pv_restrictVisibility = false;
});

SightLayer.prototype._pv_drawMinFOV = function (fov) {
    if (this.sources.size === 0) {
        return;
    }

    // TODO: draw instanced
    const c = this._pv_circle;
    const m = c.length;
    const n = m >>> 1;
    const s = this.sources.size;

    let i = 0;
    let j = s;

    const vertices = new Float32Array(j * (m + 4) - 4);

    for (const source of this.sources) {
        if (source.destroyed) {
            continue;
        }

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

    fov.draw({ geometry: new GeometrySegment(geometry, PIXI.DRAW_MODES.TRIANGLE_STRIP) });
};

class SightMaskShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec2 screenDimensions;

        varying vec2 vScreenCoord;

        void main() {
            gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);

            vScreenCoord = aVertexPosition / screenDimensions;
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vScreenCoord;

        uniform sampler2D uSampler;

        void main() {
            vec4 mask = texture2D(uSampler, vScreenCoord);

            gl_FragColor = vec4(min(mask.r, mask.g));
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }

        return this._instance;
    }

    constructor() {
        super(SightMaskShader.program, {
            screenDimensions: new Float32Array(2)
        });
    }

    update() {
        const { width, height } = canvas.app.renderer.screen;
        const screenDimensions = this.uniforms.screenDimensions;

        screenDimensions[0] = width;
        screenDimensions[1] = height;

        this.uniforms.uSampler = CanvasFramebuffer.get("lighting").textures[0];
    }
}
