import { patch } from "../../utils/patch.js";
import { presets } from "../settings.js";
import { PointSourceGeometry } from "./geometry.js";
import { PointSourceMesh } from "./mesh.js";
import { Region } from "../../utils/region.js";
import { GeometrySegment } from "../../utils/geometry-segment.js";
import { DelimiterShader } from "./shader.js";
import { LimitSystem } from "../limit-system.js";

Hooks.once("init", () => {
    patch("PointSource.prototype.destroy", "WRAPPER", function (wrapped, ...args) {
        LimitSystem.instance.deleteRegion(this.object.sourceId);

        wrapped(...args);

        if (this.background && !this.background.destroyed) {
            this.background.destroy({ children: true });
        }

        if (this.illumination && !this.illumination.destroyed) {
            this.illumination.destroy({ children: true });
        }

        if (this.coloration && !this.coloration.destroyed) {
            this.coloration.destroy({ children: true });
        }

        if (this._pv_delimiter && !this._pv_delimiter.destroyed) {
            this._pv_delimiter.destroy({ children: true });
        }

        this.destroyed = true;

        this._pv_fov = null;
        this._pv_los = null;
        this._pv_constrainedLos = null;
        this._pv_losGeometry = null;
        this._pv_constrainedLosGeometry = null;
        this._pv_geometry = null;

        if (this._pv_shader) {
            this._pv_shader.destroy();
        }

        this._pv_shader = null;

        if (this._pv_mesh) {
            this._pv_mesh.destroy({ children: true });
        }

        this._pv_mesh = null;
        this._pv_region = null;
        this._pv_occlusionTiles = null;
    });

    patch("PointSource.prototype._createMesh", "OVERRIDE", function (shaderCls) {
        const shader = shaderCls.create();
        const mesh = new PointSourceMesh(PointSourceGeometry.EMPTY, shader);

        Object.defineProperty(mesh, "uniforms", { get: () => mesh.shader.uniforms });

        shader.source = this;

        return mesh;
    });

    patch("PointSource.prototype._updateMesh", "OVERRIDE", function (mesh) {
        const geometry = this._pv_geometry ?? PointSourceGeometry.EMPTY;

        mesh.geometry = geometry;

        if (this.data.walls) {
            mesh.occlusionObjects = this._pv_occlusionTiles;
        } else {
            mesh.occlusionObjects = null;
        }

        const { x, y } = this.data;
        const radius = this.radius;
        const uniforms = mesh.uniforms;

        uniforms.pv_origin[0] = x;
        uniforms.pv_origin[1] = y;
        uniforms.pv_radius = radius;
        uniforms.pv_smoothness = geometry.inset;

        return mesh;
    });

    patch("LightSource.prototype.initialize", "WRAPPER", function (wrapped, data, ...args) {
        data.z = Number.parseInt(data.z, 10);
        data.z = !Number.isNaN(data.z) ? data.z : null;

        wrapped(data, ...args);

        this._pv_los = this.los ? Region.from(this.los) : null;
        this._pv_geometry = this.los ? new PointSourceGeometry([this._pv_los.contour], canvas.dimensions._pv_inset, "ONE") : PointSourceGeometry.EMPTY;
        this._pv_shader = new LightSourceShader(this);

        if (!this._pv_mesh) {
            this._pv_mesh = new PointSourceMesh(this._pv_geometry, this._pv_shader);
            this._pv_mesh.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
        }

        this._flags.useFov = false;
        this._flags.renderFOV = false;

        const object = this.object;

        if ((object instanceof AmbientLight || object instanceof Token) && this.object.id) {
            const sourceId = object.sourceId;

            let sightLimit = object.document.getFlag("perfect-vision", object instanceof AmbientLight ? "sightLimit" : "light.sightLimit");

            if (sightLimit !== undefined) {
                sightLimit = Math.max(sightLimit ?? Infinity, 0) * (canvas.dimensions.size / canvas.dimensions.distance);
            }

            if (sightLimit !== undefined) {
                LimitSystem.instance.addRegion(sourceId, {
                    shape: this._pv_los,
                    limit: sightLimit,
                    mode: this.isDarkness ? "min" : "max",
                    index: [3, this.data.z ?? (this.isDarkness ? 10 : 0), this.isDarkness],
                    active: this.active
                });
            } else {
                LimitSystem.instance.deleteRegion(sourceId);
            }
        }

        return this;
    });

    patch("AmbientLight.prototype.updateSource", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (!canvas.lighting.sources.has(this.sourceId)) {
            LimitSystem.instance.deleteRegion(this.sourceId)

            this.source.active = false;
        }
    });

    patch("Token.prototype.updateLightSource", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (!canvas.lighting.sources.has(this.sourceId)) {
            LimitSystem.instance.deleteRegion(this.sourceId);

            this.light.active = false;
        }
    });

    patch("LightSource.prototype._initializeShaders", "OVERRIDE", function () {
        // Create each shader
        const createShader = (cls, container) => {
            const current = container.shader;

            if (current?.constructor.name === cls.name) {
                return;
            }

            const shader = cls.create({ uBkgSampler: canvas.primary.renderTexture });

            shader.source = this;
            shader.container = container;
            container.shader = shader;

            if (current) {
                current.destroy();
            }
        }

        // Initialize shaders
        createShader(DelimiterShader, this._pv_delimiter);
        createShader(this.animation.backgroundShader || AdaptiveBackgroundShader, this.background);
        createShader(this.animation.illuminationShader || AdaptiveIlluminationShader, this.illumination);
        createShader(this.animation.colorationShader || AdaptiveColorationShader, this.coloration);

        /**
         * A hook event that fires after LightSource shaders have initialized.
         * @function initializeLightSourceShaders
         * @memberof hookEvents
         * @param {PointSource} source   The LightSource being initialized
         */
        Hooks.callAll("initializeLightSourceShaders", this);
    });

    patch("LightSource.prototype._initializeBlending", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        const defaultZ = this.isDarkness ? 10 : 0;
        const BM = PIXI.BLEND_MODES;

        this.illumination.zIndex += 0.5 * this.isDarkness;
        this.coloration.zIndex += 0.5 * this.isDarkness;

        this._pv_delimiter.blendMode = BM[this.isDarkness ? "NORMAL" : "MAX_COLOR"];
        this._pv_delimiter.zIndex = (this.data.z ?? defaultZ) + 0.5 * this.isDarkness;
    });

    patch("LightSource.prototype.drawMeshes", "OVERRIDE", function () {
        const background = this.drawBackground();
        const light = this.drawLight();
        const color = this.drawColor();
        const delimiter = this._pv_drawDelimiter();

        return { background, light, color, _pv_delimiter: delimiter };
    });

    patch("LightSource.prototype.drawLight", "OVERRIDE", function () {
        const shader = this.illumination.shader;

        // Protect against cases where the canvas is being deactivated
        if (!shader) {
            return null;
        }

        // Update illumination uniforms
        const ic = this.illumination;
        const version = this._pv_region.version;
        const updateChannels = !(this._flags.lightingVersion >= version);

        if (this._resetUniforms.illumination || updateChannels) {
            this._updateIlluminationUniforms(shader);

            if (this._shutdown.illumination) {
                this._shutdown.illumination = !(ic.renderable = true);
            }

            this._flags.lightingVersion = version;
        }

        if (this._resetUniforms.illumination) {
            this._resetUniforms.illumination = false;
        }

        // Draw the container
        return this._updateMesh(ic);
    });

    patch("LightSource.prototype._updateIlluminationUniforms", "OVERRIDE", function (shader) {
        const u = shader.uniforms;
        const c = this._pv_region.channels;
        const colorIntensity = this.data.alpha * 2;
        const blend = (rgb1, rgb2, w) => rgb1.map((x, i) => (w * x) + ((1 - w) * (rgb2[i]))); // linear interpolation

        // Darkness [-1, 0)
        if (this.isDarkness) {
            let lc, cdim1, cdim2, cbr1, cbr2;

            // Construct intensity-adjusted darkness colors for "black" and the midpoint between dark and black
            const iMid = c.background.rgb.map((x, i) => (x + c.black.rgb[i]) / 2);
            const mid = this.data.color ? this.colorRGB.map((x, i) => x * iMid[i] * colorIntensity) : iMid;
            const black = this.data.color ? this.colorRGB.map((x, i) => x * c.black.rgb[i] * colorIntensity) : c.black.rgb;

            // For darkness [-1, -0.5), blend between the chosen darkness color and black
            if (this.data.luminosity < -0.5) {
                lc = Math.abs(this.data.luminosity) - 0.5;

                // Darkness Dim colors -> tend to darker tone
                cdim1 = black;
                cdim2 = black.map(x => x * 0.625);

                // Darkness Bright colors -> tend to darkest tone
                cbr1 = black.map(x => x * 0.5);
                cbr2 = black.map(x => x * 0.125);
            }
            // For darkness [-0.5, 0) blend between the chosen darkness color and the dark midpoint
            else {
                lc = Math.pow((Math.abs(this.data.luminosity) * 2), 0.4); // Accelerating easing toward dark tone with pow

                // Darkness Dim colors -> tend to medium tone
                cdim1 = mid;
                cdim2 = black;

                // Darkness Bright colors -> tend to dark tone
                cbr1 = mid;
                cbr2 = black.map(x => x * 0.5);
            }

            // Linear interpolation between tones according to luminosity
            u.colorDim = blend(cdim1, cdim2, 1 - lc);
            u.colorBright = blend(cbr1, cbr2, 1 - lc);
        }
        // Light [0,1]
        else {
            const ll = CONFIG.Canvas.lightLevels;
            const penalty = shader.getDarknessPenalty(c.darkness.level, this.data.luminosity);
            const lumPenalty = Math.clamped(this.data.luminosity * 2, 0, 1);

            u.colorBright = [1, 1, 1].map((x, i) => Math.max(ll.bright * x * (1 - penalty) * lumPenalty, c.background.rgb[i]));
            u.colorDim = u.colorBright.map((x, i) => (ll.dim * x) + ((1 - ll.dim) * c.background.rgb[i]));
        }

        // Apply standard uniforms for this PointSource
        this._updateCommonUniforms(shader);

        u.pv_colorAlpha = this.data.color ? colorIntensity : 1.0;

        u.color = this.data.color ? this.colorRGB : [1, 1, 1];
        u.colorBackground = c.background.rgb;

        u.pv_sight = false;
        u.pv_luminosity = this.data.luminosity;
    });

    patch("VisionSource.prototype.initialize", "OVERRIDE", function (data = {}) {
        const token = this.object;
        const document = token.document;

        let visionRules;
        let dimVisionInDarkness;
        let dimVisionInDimLight;
        let brightVisionInDarkness;
        let brightVisionInDimLight;

        if (game.system.id === "pf2e" && canvas.sight.rulesBasedVision && (token.actor?.type === "character" || token.actor?.type === "familiar")) {
            visionRules = token.actor.traits.has("fetchling") ? "pf2e_fetchling" : "pf2e";
        } else {
            visionRules = document.getFlag("perfect-vision", "visionRules") || "default";
        }

        if (visionRules === "custom") {
            dimVisionInDarkness = document.getFlag("perfect-vision", "dimVisionInDarkness");
            dimVisionInDimLight = document.getFlag("perfect-vision", "dimVisionInDimLight");
            brightVisionInDarkness = document.getFlag("perfect-vision", "brightVisionInDarkness");
            brightVisionInDimLight = document.getFlag("perfect-vision", "brightVisionInDimLight");
        } else {
            if (visionRules === "default") {
                visionRules = game.settings.get("perfect-vision", "visionRules");
            }

            if (visionRules !== "custom") {
                dimVisionInDarkness = presets[visionRules].dimVisionInDarkness;
                dimVisionInDimLight = presets[visionRules].dimVisionInDimLight;
                brightVisionInDarkness = presets[visionRules].brightVisionInDarkness;
                brightVisionInDimLight = presets[visionRules].brightVisionInDimLight;
            }
        }

        dimVisionInDarkness = dimVisionInDarkness || game.settings.get("perfect-vision", "dimVisionInDarkness");
        dimVisionInDimLight = dimVisionInDimLight || game.settings.get("perfect-vision", "dimVisionInDimLight");
        brightVisionInDarkness = brightVisionInDarkness || game.settings.get("perfect-vision", "brightVisionInDarkness");
        brightVisionInDimLight = brightVisionInDimLight || game.settings.get("perfect-vision", "brightVisionInDimLight");

        this._pv_minRadius = token.w / 2 - 1.5;

        let sightLimit;

        if (game.system.id === "pf2e"
            && token.scene.rulesBasedVision
            && (token.actor.type === "character" || token.actor.type === "familiar")
            && token.actor.visionLevel === 0) {
            sightLimit = 0;
        } else {
            sightLimit = parseFloat(document.getFlag("perfect-vision", "sightLimit"));
        }

        if (!Number.isNaN(sightLimit)) {
            sightLimit = Math.max(sightLimit, 0) * (canvas.dimensions.size / canvas.dimensions.distance) + this._pv_minRadius;
        } else {
            sightLimit = undefined;
        }

        this._pv_sightLimit = sightLimit;

        let { dim, bright } = data;

        if (sightLimit !== undefined) {
            dim = Math.min(dim, sightLimit);
            bright = Math.min(bright, sightLimit);
        }

        data.bright = Math.max(
            dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
            brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
        );
        data.dim = Math.max(
            data.bright,
            dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
            brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0
        );

        // Initialize new input data
        const changes = this._initializeData(data);

        // Compute derived data attributes
        this.radius = Math.max(Math.abs(this.data.dim), Math.abs(this.data.bright));
        this.ratio = Math.clamped(Math.abs(this.data.bright) / this.radius, 0, 1);
        this.limited = this.data.angle !== 360;

        const radiusSight = Math.max(
            dimVisionInDarkness === "scene" || dimVisionInDarkness === "scene_mono" ? dim : 0,
            dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
            dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
            brightVisionInDarkness === "scene" || brightVisionInDarkness === "scene_mono" ? bright : 0,
            brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0,
            brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
        );
        const radiusColor = Math.max(
            dimVisionInDarkness === "scene" ? dim : 0,
            dimVisionInDarkness === "dim" ? dim : 0,
            dimVisionInDarkness === "bright" ? dim : 0,
            brightVisionInDarkness === "scene" ? bright : 0,
            brightVisionInDarkness === "dim" ? bright : 0,
            brightVisionInDarkness === "bright" ? bright : 0
        );
        const radiusBoost = Math.max(
            dimVisionInDimLight === "bright" ? dim : 0,
            brightVisionInDimLight === "bright" ? bright : 0
        );

        // Compute the source polygon
        const origin = { x: this.data.x, y: this.data.y };

        this.los = CONFIG.Canvas.losBackend.create(origin, {
            type: "sight",
            angle: this.data.angle,
            rotation: this.data.rotation,
            radius: sightLimit,
            radiusMin: this._pv_minRadius,
            source: this
        });
        this.constrainedLos = constrainLos(this.los, radiusSight);

        // Store the FOV circle
        this.fov = new PIXI.Circle(origin.x, origin.y, radiusSight);

        this._pv_fov = Region.from(this.fov);
        this._pv_los = Region.from(this.los);
        this._pv_constrainedLos = this.constrainedLos !== this.los ? Region.from(this.constrainedLos) : this._pv_los;

        this._pv_losGeometry = new PointSourceGeometry([this._pv_los.contour], canvas.dimensions._pv_inset, "ONE");
        this._pv_constrainedLosGeometry = this._pv_constrainedLos !== this._pv_los
            ? new PointSourceGeometry([this._pv_constrainedLos.contour], canvas.dimensions._pv_inset, "ONE")
            : this._pv_losGeometry;
        this._pv_geometry = this.radius === radiusSight
            ? this._pv_constrainedLosGeometry
            : new PointSourceGeometry([this._pv_los.contour, Region.from(new PIXI.Circle(origin.x, origin.y, this.radius)).contour], canvas.dimensions._pv_inset, "ABS_GEQ_TWO");

        this._pv_shader = new VisionSourceShader(this);

        if (!this._pv_mesh) {
            this._pv_mesh = new PointSourceMesh(this._pv_losGeometry, this._pv_shader);
            this._pv_mesh.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
        }

        this._pv_radiusColor = radiusColor;
        this._pv_radiusBoost = radiusBoost;

        if (radiusSight > 0) {
            this._pv_tintMono = foundry.utils.colorStringToHex(
                document.getFlag("perfect-vision", "monoVisionColor") || game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff"
            );
        } else {
            this._pv_tintMono = 0xFFFFFF;
        }

        this._flags.useFov = false;
        this._flags.renderFOV = false;

        if (this.constructor._appearanceKeys.some(k => k in changes)) {
            for (let k of Object.keys(this._resetUniforms)) {
                this._resetUniforms[k] = true;
            }
        }

        // Set the correct blend mode
        this._initializeBlending();

        return this;
    });

    patch("VisionSource.prototype._initializeBlending", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        const defaultZ = this.isDarkness ? 10 : 0;
        const BM = PIXI.BLEND_MODES;

        this.illumination.zIndex += 0.5 * this.isDarkness;

        this._pv_delimiter.blendMode = BM[this.isDarkness ? "NORMAL" : "MAX_COLOR"];
        this._pv_delimiter.zIndex = (this.data.z ?? defaultZ) + 0.5 * this.isDarkness;
    });

    // TODO
    patch("VisionSource.prototype.drawVision", "OVERRIDE", function () {
        return LightSource.prototype.drawLight.call(this);
    });

    patch("VisionSource.prototype._updateIlluminationUniforms", "OVERRIDE", function (shader) {
        const u = shader.uniforms;
        const c = this._pv_region.channels;

        // Determine light colors
        const ll = CONFIG.Canvas.lightLevels;
        const penalty = shader.getDarknessPenalty(c.darkness.level, 0.5);

        u.colorBright = [1, 1, 1].map((x, i) => Math.max(ll.bright * x * (1 - penalty), c.background.rgb[i]));
        u.colorDim = u.colorBright.map((x, i) => (ll.dim * x) + ((1 - ll.dim) * c.background.rgb[i]));
        u.colorBackground = c.background.rgb;

        // Apply standard uniforms for this PointSource
        u.ratio = this.ratio;
        u.screenDimensions = canvas.screenDimensions;;
        u.uBkgSampler = canvas.primary.renderTexture;

        u.pv_sight = true;
        u.pv_luminosity = 0.5;
    });
});

PointSource.prototype.destroyed = false;

for (const cls of [LightSource, VisionSource]) {
    Object.defineProperty(cls.prototype, "_pv_delimiter", {
        get() {
            if (!this._pv_delimiter_) {
                this._pv_delimiter_ = this._createMesh(DelimiterShader);
                this._resetUniforms._pv_delimiter = true;
            }

            return this._pv_delimiter_;
        }
    });
}

LightSource.prototype._pv_drawDelimiter = VisionSource.prototype._pv_drawDelimiter = function () {
    const shader = this._pv_delimiter.shader;

    if (!shader) {
        return null;
    }

    if (this._resetUniforms._pv_delimiter) {
        this._pv_updateDelimiterUniforms(shader);
        this._resetUniforms._pv_delimiter = false;
    }

    return this._updateMesh(this._pv_delimiter);
};

LightSource.prototype._pv_updateDelimiterUniforms = VisionSource.prototype._pv_updateDelimiterUniforms = function (shader) {
    const uniforms = shader.uniforms;

    uniforms.screenDimensions = canvas.screenDimensions;
    uniforms.ratio = this.ratio;
    uniforms.darkness = this.isDarkness;
    uniforms.pv_sight = this.sourceType === "vision";
};

LightSource.prototype._pv_drawMesh = function () {
    const mesh = this._pv_mesh;
    const shader = this._pv_shader;
    const uniforms = shader.uniforms;
    const { x, y } = this.data;

    mesh.geometry = this._pv_geometry;
    mesh.shader = shader;
    mesh.colorMask = [this.data.vision, true, true, true];

    if (this.data.walls) {
        mesh.occlusionObjects = this._pv_occlusionTiles;
    } else {
        mesh.occlusionObjects = null;
    }

    uniforms.uOrigin[0] = x;
    uniforms.uOrigin[1] = y;
    uniforms.uRadius = this.radius;
    uniforms.uGradual = this.data.gradual;
    uniforms.uDarkness = this.isDarkness;

    return mesh;
};

LightSource.prototype._pv_drawMask = function (fov, los) {
    const geometry = this._pv_geometry.fill;

    fov.pushMask({ geometry });

    if (this.data.vision) {
        los.pushMask({ geometry });
    }

    if (this._pv_occlusionTiles && this.data.walls) {
        const bounds = this._pv_geometry.bounds;

        for (const occlusionTile of this._pv_occlusionTiles) {
            if (occlusionTile.destroyed || !occlusionTile.visible || !occlusionTile.renderable || occlusionTile.worldAlpha <= 0) {
                continue;
            }

            if (!occlusionTile.geometry.bounds.intersects(bounds)) {
                continue;
            }

            {
                const geometry = occlusionTile.geometry;
                const mask = {
                    geometry: new GeometrySegment(geometry, geometry.drawMode, 4, 0),
                    texture: occlusionTile.texture,
                    threshold: 0.75,
                    hole: true
                };

                fov.pushMask(mask);

                if (this.data.vision) {
                    los.pushMask(mask);
                }
            }
        }
    }

    fov.draw({ hole: false });
    fov.popMasks();

    if (this.data.vision) {
        los.draw({ hole: false });
        los.popMasks();
    }
};

VisionSource.prototype._pv_drawMesh = function () {
    const mesh = this._pv_mesh;
    const shader = this._pv_shader;
    const uniforms = shader.uniforms;
    const { x, y } = this.data;

    mesh.geometry = this._pv_losGeometry;
    mesh.shader = shader;

    uniforms.uOrigin[0] = x;
    uniforms.uOrigin[1] = y;
    uniforms.uRadius = this.fov.radius;
    uniforms.uRadiusDim = this.radius;
    uniforms.uRadiusBright = this.radius * this.ratio;
    uniforms.uRadiusColor = this._pv_radiusColor;
    uniforms.uRadiusBoost = this._pv_radiusBoost;
    uniforms.uSmoothness = mesh.geometry.inset;

    return mesh;
};

VisionSource.prototype._pv_drawMask = function (fov, los) {
    if (this.fov.radius > 0) {
        fov.draw({ geometry: this._pv_constrainedLosGeometry.fill });
    }

    los.draw({ geometry: this._pv_losGeometry.fill });
};

class LightSourceShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;
        layout(location = 1) in lowp float aVertexDepth;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        void main() {
            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(aVertexPosition, 1.0))).xy, aVertexDepth, 1.0);
        }`;

    static get fragmentSrc() {
        return `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        uniform ${PIXI.settings.PRECISION_VERTEX} vec4 viewportFrame;
        uniform ${PIXI.settings.PRECISION_VERTEX} mat3 projectionMatrixInverse;
        uniform ${PIXI.settings.PRECISION_VERTEX} mat3 translationMatrixInverse;

        uniform vec2 uOrigin;
        uniform float uRadius;
        uniform bool uGradual;
        uniform bool uDarkness;

        ${game.modules.get("levels")?.active ? "#define OCCLUSION_MASK" : ""}
        ${game.modules.get("lightmask")?.active ? "#define LIGHT_MASK" : ""}

        #ifdef OCCLUSION_MASK
        uniform sampler2D uOcclusionMaskSampler;
        uniform vec4 uOcclusionMaskFrame;

        float occlusionMaskAlpha(vec2 worldPosition) {
            return texture(uOcclusionMaskSampler, (worldPosition - uOcclusionMaskFrame.xy) / uOcclusionMaskFrame.zw).r;
        }
        #endif

        #ifdef LIGHT_MASK
        uniform float uSmoothness;
        #endif

        layout(location = 0) out vec3 textures[1];

        float fade(in float dist) {
            float ampdist = dist;
            for (int i = 1; i < 3; i++) {
                ampdist *= ampdist;
            }
            return 1.0 - (1.0 * ampdist * (4.0 - 3.0 * dist));
        }

        void main() {
            ${PIXI.settings.PRECISION_VERTEX} vec3 worldPosition = projectionMatrixInverse * vec3(((gl_FragCoord.xy - viewportFrame.xy) / viewportFrame.zw) * 2.0 - 1.0, 1.0);
            ${PIXI.settings.PRECISION_VERTEX} vec2 localPosition = (translationMatrixInverse * worldPosition).xy - uOrigin;

            float dist = length(localPosition) / uRadius;
            float alpha1 = smoothstep(0.0, 1.0, gl_FragCoord.z);

            #ifdef OCCLUSION_MASK
            alpha1 = min(alpha1, occlusionMaskAlpha(worldPosition.xy));
            #endif

            float alpha2 = alpha1;

            if (uGradual) {
                #ifdef LIGHT_MASK
                dist = min(dist, 1.0);
                #endif

                alpha2 *= fade(dist * dist);
            }
            #ifdef LIGHT_MASK
            else {
                alpha2 = min(alpha2, smoothstep(uRadius, uRadius - uSmoothness, length(localPosition)));
            }
            #endif

            textures[0] = vec3(alpha1, alpha1, alpha2);
        }`;
    }

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    constructor(source) {
        super(LightSourceShader.program, {
            uOrigin: new Float32Array(2),
            uRadius: 0,
            uGradual: false,
            uDarkness: false,
            uOcclusionMaskSampler: PIXI.Texture.WHITE,
            uOcclusionMaskFrame: new Float32Array(4),
            uSmoothness: 0
        });

        this.source = source;
    }

    get occlusionMask() {
        return this.uniforms.uOcclusionMaskSampler;
    }

    set occlusionMask(value) {
        this.uniforms.uOcclusionMaskSampler = value ?? PIXI.Texture.EMPTY;
    }

    update(renderer, mesh) {
        const uniforms = this.uniforms;

        uniforms.translationMatrixInverse = mesh.worldTransformInverse.toArray(true);

        const occlusionMaskFrame = uniforms.uOcclusionMaskFrame;
        const occlusionMaskTexture = uniforms.uOcclusionMaskSampler;
        const occlusionMaskTextureFilterFrame = occlusionMaskTexture.filterFrame;

        if (occlusionMaskTextureFilterFrame) {
            occlusionMaskFrame[0] = occlusionMaskTextureFilterFrame.x;
            occlusionMaskFrame[1] = occlusionMaskTextureFilterFrame.y;
        } else {
            occlusionMaskFrame[0] = 0;
            occlusionMaskFrame[1] = 0;
        }

        occlusionMaskFrame[2] = occlusionMaskTexture.width;
        occlusionMaskFrame[3] = occlusionMaskTexture.height;

        uniforms.uSmoothness = canvas.dimensions._pv_inset;
    }
}

class VisionSourceShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;
        layout(location = 1) in lowp float aVertexDepth;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        void main() {
            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(aVertexPosition, 1.0))).xy, aVertexDepth, 1.0);
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        uniform ${PIXI.settings.PRECISION_VERTEX} vec4 viewportFrame;
        uniform ${PIXI.settings.PRECISION_VERTEX} mat3 projectionMatrixInverse;
        uniform ${PIXI.settings.PRECISION_VERTEX} mat3 translationMatrixInverse;

        uniform vec2 uOrigin;
        uniform float uRadius;
        uniform float uRadiusDim;
        uniform float uRadiusBright;
        uniform float uRadiusColor;
        uniform float uRadiusBoost;
        uniform float uSmoothness;

        layout(location = 0) out vec3 textures[2];

        void main() {
            ${PIXI.settings.PRECISION_VERTEX} vec3 worldPosition = projectionMatrixInverse * vec3(((gl_FragCoord.xy - viewportFrame.xy) / viewportFrame.zw) * 2.0 - 1.0, 1.0);
            ${PIXI.settings.PRECISION_VERTEX} vec2 localPosition = (translationMatrixInverse * worldPosition).xy - uOrigin;

            float dist = length(localPosition);

            float sight = smoothstep(uRadius, uRadius - uSmoothness, dist);
            float dim = smoothstep(uRadiusDim, uRadiusDim - uSmoothness, dist);
            float bright = smoothstep(uRadiusBright, uRadiusBright - uSmoothness, dist);
            float vision = mix(bright, 1.0, dim / 2.0);
            float color = smoothstep(uRadiusColor, uRadiusColor - uSmoothness, dist);
            float boost = smoothstep(uRadiusBoost, uRadiusBoost - uSmoothness, dist);

            float alpha = smoothstep(0.0, 1.0, gl_FragCoord.z);

            textures[0] = vec3(alpha, min(sight, alpha), 0.0);
            textures[1] = vec3(min(vision, alpha), min(color, alpha), min(boost, alpha));
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    constructor(source) {
        super(VisionSourceShader.program, {
            uOrigin: new Float32Array(2),
            uRadius: 0,
            uRadiusDim: 0,
            uRadiusBright: 0,
            uRadiusColor: 0,
            uRadiusBoost: 0,
            uSmoothness: 0
        });

        this.source = source;
    }

    update(renderer, mesh) {
        this.uniforms.translationMatrixInverse = mesh.worldTransformInverse.toArray(true);
    }
}

function constrainLos(polygon, radius) {
    if (radius >= polygon.config.radius) {
        return polygon;
    }

    if (radius <= 0) {
        return new PIXI.Polygon();
    }

    const { origin, points } = polygon;
    const { x: x0, y: y0 } = origin;
    const m = points.length;
    const rr = radius * radius;
    const cp = [];
    const sa = Math.PI / Math.min(60, 2 * Math.sqrt(radius));
    let x1 = points[m - 2] - x0;
    let y1 = points[m - 1] - y0;

    for (let i = 0; i < m; i += 2) {
        const x2 = points[i] - x0;
        const y2 = points[i + 1] - y0;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dd = x1 * x1 + y1 * y1;
        const a = dx * dx + dy * dy;
        const b = dx * x1 + dy * y1;
        const c = dd - rr;
        const d1 = b * b - a * c;

        if (a === 0) {
            continue;
        }

        if (c <= 0) {
            if (x0 + x1 !== cp[cp.length - 2] || y0 + y1 !== cp[cp.length - 1]) {
                cp.push(x0 + x1, y0 + y1);
            }
        }

        if (d1 >= 0) {
            const d2 = Math.sqrt(d1);
            let t1 = (-b - d2) / a;
            let t2 = (-b + d2) / a;

            if (t2 <= -1e-6 || t2 >= 1 + 1e-6) {
                t2 = NaN;
            } else {
                t2 = Math.clamped(t2, 0, 1);
            }

            if (t1 <= -1e-6 || t1 >= 1 + 1e-6) {
                [t1, t2] = [t2, NaN];
            } else {
                t1 = Math.clamped(t1, 0, 1);
            }

            if (t1 === t1) {
                const xt1 = x0 + (x1 + dx * t1);
                const yt1 = y0 + (y1 + dy * t1);

                if (c > 0) {
                    const a0 = Math.atan2(cp[cp.length - 1] - y0, cp[cp.length - 2] - x0);
                    const a1 = Math.atan2(yt1 - y0, xt1 - x0);
                    const da = a1 - a0 + (a1 < a0 ? Math.PI * 2 : 0);
                    const na = Math.ceil(da / sa);

                    for (let j = 1; j < na; j++) {
                        const a = a0 + da * (j / na);

                        cp.push(
                            x0 + Math.cos(a) * radius,
                            y0 + Math.sin(a) * radius
                        );
                    }
                }

                if (xt1 !== cp[cp.length - 2] || yt1 !== cp[cp.length - 1]) {
                    cp.push(xt1, yt1);
                }

                if (t2 > t1) {
                    const xt2 = x0 + (x1 + dx * t2);
                    const yt2 = y0 + (y1 + dy * t2);

                    if (xt2 !== xt1 || yt2 !== yt1) {
                        cp.push(xt2, yt2);
                    }
                }
            }
        }

        x1 = x2;
        y1 = y2;
    }

    if (cp.length === 0) {
        const na = Math.ceil(Math.PI * 2 / sa);

        for (let j = 0; j < na; j++) {
            const a = Math.PI * 2 * (j / na);

            cp.push(
                x0 + Math.cos(a) * radius,
                y0 + Math.sin(a) * radius
            );
        }
    } else if (x1 * x1 + y1 * y1 - rr > 0) {
        const a0 = Math.atan2(cp[cp.length - 1] - y0, cp[cp.length - 2] - x0);
        const a1 = Math.atan2(cp[1] - y0, cp[0] - x0);
        const da = a1 - a0 + (a1 < a0 ? Math.PI * 2 : 0);
        const na = Math.ceil(da / sa);

        for (let j = 1; j < na; j++) {
            const a = a0 + da * (j / na);

            cp.push(
                x0 + Math.cos(a) * radius,
                y0 + Math.sin(a) * radius
            );
        }
    }

    return new PIXI.Polygon(cp);
}
