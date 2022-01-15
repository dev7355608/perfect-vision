import { StencilMask, StencilMaskData } from "../utils/stencil-mask.js";
import { patch } from "../utils/patch.js";
import { TransformedShape } from "../utils/transformed-shape.js";
import { SpriteMesh } from "../utils/sprite-mesh.js";
import { GeometrySegment } from "../utils/geometry-segment.js";

Hooks.once("init", () => {
    patch("SightLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        this._pv_bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);

        await wrapped(...args);

        this.pending.filters = null;

        this.filter.autoFit = true;
        this.filter.resolution = canvas.app.renderer.resolution;
        this.filterArea = canvas.app.renderer.screen;

        this._pv_circle = Float32Array.from(new TransformedShape(new PIXI.Circle(0, 0, canvas.dimensions.size)).contour);

        for (let i = 0; i < this._pv_circle.length; i++) {
            this._pv_circle[i] /= canvas.dimensions.size;
            this._pv_circle[i] *= 9 / 10;
        }

        this._pv_vision = new SpriteMesh(SightMaskShader.instance);
        this._pv_vision.x = this._pv_bgRect.x;
        this._pv_vision.y = this._pv_bgRect.y;
        this._pv_vision.width = this._pv_bgRect.width;
        this._pv_vision.height = this._pv_bgRect.height;

        return this;
    });

    patch("SightLayer.prototype._createCachedMask", "OVERRIDE", function () { });

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
        const prior = this.vision;

        this.explored.removeChild(prior);

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
        const smooth = !this.fogExploration && canvas.foreground.roofs.length === 0;

        this.explored.removeChild(this._pv_vision);

        if (!smooth) {
            this.explored.addChild(vision);
        } else {
            this.explored.addChild(this._pv_vision);
        }

        // Draw standard vision sources
        let inBuffer = canvas.scene.data.padding === 0;

        canvas.lighting._pv_drawMask(vision._pv_fov, vision._pv_los);

        for (const area of canvas.lighting._pv_areas) {
            area._pv_drawMask(vision._pv_fov, vision._pv_los);
        }

        if (!smooth) {
            // Draw field-of-vision for lighting sources
            for (const source of canvas.lighting.sources) {
                if (!this.sources.size || !source.active) {
                    continue;
                }

                source._pv_drawMask(vision._pv_fov, vision._pv_los);
            }

            this._pv_drawMinFOV(vision._pv_fov);
        }

        // Draw sight-based visibility for each vision source
        for (const source of this.sources) {
            source.active = true;

            if (!inBuffer && !d.sceneRect.contains(source.x, source.y)) {
                inBuffer = true;
            }

            if (!smooth) {
                source._pv_drawMask(vision._pv_fov, vision._pv_los);

                if (!skipUpdateFog) { // Update fog exploration
                    this.updateFog(source, forceUpdateFog);
                }
            }
        }

        // Commit updates to the Fog of War texture
        if (commitFog) {
            this.commitFog();
        }

        // Alter visibility of the vision layer
        this.visible = this.sources.size || !game.user.isGM;
        this.unexplored.tint = CONFIG.Canvas.unexploredColor;

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

    patch("SightLayer.prototype.testVisibility", "OVERRIDE", function (point, { tolerance = 2, object = null } = {}) {
        const visionSources = this.sources;
        const lightSources = canvas.lighting.sources;

        if (!visionSources.size) {
            return game.user.isGM;
        }

        let radius;

        if (object instanceof Token) {
            radius = object.w / 2 - 1.5;
            tolerance = radius * 0.95;

            const v = object._velocity;

            point = {
                x: point.x - v.sx,
                y: point.y - v.sy
            };
        } else {
            radius = tolerance;
        }

        if (!this._inBuffer) {
            const sceneRect = canvas.dimensions._pv_sceneRect;

            if (!sceneRect.intersectsCircle(point, radius)) {
                return false;
            }
        }

        const uniformVision = canvas.lighting._pv_uniformVision;
        const uniformGlobalLight = canvas.lighting._pv_uniformGlobalLight;

        let hasLOS = false;
        let hasFOV = false;

        if (uniformVision && uniformGlobalLight) {
            if (canvas.lighting._pv_vision) {
                return true;
            }

            hasFOV = canvas.lighting._pv_globalLight;
        } else {
            if (uniformVision && canvas.lighting._pv_vision) {
                return true;
            }

            for (const offset of offsets) {
                const p = tempPoint.set(point.x + tolerance * offset.x, point.y + tolerance * offset.y);
                const area = canvas.lighting._pv_getArea(p);

                if (area._pv_vision) {
                    return true;
                }

                if (area._pv_globalLight) {
                    hasFOV = true;

                    if (uniformVision) {
                        break;
                    }
                }

                if (!(tolerance > 0)) {
                    break;
                }
            }
        }

        for (const source of visionSources.values()) {
            if (!source.active) {
                continue;
            }

            if ((!hasLOS || !hasFOV) && source._pv_los.intersectsCircle(point, radius)) {
                hasLOS = true;

                if (!hasFOV && source._pv_fov.intersectsCircle(point, radius)) {
                    hasFOV = true;
                }
            }

            if (hasLOS && hasFOV) {
                return true;
            }
        }

        for (const source of lightSources.values()) {
            if (!source.active) {
                continue;
            }

            if ((!hasFOV || !hasLOS && source.data.vision) && source._pv_los.intersectsCircle(point, radius)) {
                if (source.data.vision) {
                    hasLOS = true;
                }

                hasFOV = true;
            }

            if (hasLOS && hasFOV) {
                return true;
            }
        }

        return false;
    });

    patch("FogExploration.prototype.explore", "OVERRIDE", function (source, force = false) {
        const globalLight = canvas.lighting._pv_uniformGlobalLight ? canvas.lighting._pv_globalLight : undefined;
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

        this.uniforms.uSampler = canvas.lighting._pv_buffer.textures[0];
    }
}
