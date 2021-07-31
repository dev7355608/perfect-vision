import { Board } from "../board.js";
import { Elevation } from "../elevation.js";
import { Logger } from "../../utils/logger.js";
import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";
import { SourcePolygonMesh } from "../../display/source-polygon-mesh.js";
import { presets } from "../../settings.js";
import { SpriteMesh } from "../../display/sprite-mesh.js";

Hooks.once("init", () => {
    let computePolygon;

    if (!game.modules.get("lichtgeschwindigkeit")?.active) {
        computePolygon = function (source, radius, cache = null) {
            if (cache?.[radius]) {
                return cache[radius];
            }

            const polygon = new SourcePolygon(source.x, source.y, radius);

            if (radius > 0) {
                const d = canvas.dimensions;
                const distance = cache?.distance ?? Math.max(
                    source.radius,
                    Math.hypot(
                        Math.max(source.x, d.width - source.x),
                        Math.max(source.y, d.height - source.y)
                    )
                );

                if (cache) {
                    cache.distance = distance;
                }

                const limit = Math.clamped(radius / distance, 0, 1);
                const points = source.los.points;

                for (let i = 0; i < points.length; i += 2) {
                    const p = { x: points[i], y: points[i + 1] };
                    const r = new Ray(source, p);
                    const t0 = Math.clamped(r.distance / distance, 0, 1);
                    const q = t0 <= limit ? p : r.project(limit / t0);

                    polygon.points.push(q)
                }
            }

            if (cache) {
                cache[radius] = polygon;
            }

            return polygon;
        }
    } else {
        computePolygon = function (source, radius, cache = null) {
            if (cache?.[radius]) {
                return cache[radius];
            }

            const polygon = canvas.walls.computePolygon({ x: source.x, y: source.y }, radius, {
                type: source.sourceType || "sight",
                angle: source.angle,
                rotation: source.rotation,
                unrestricted: source.type === CONST.SOURCE_TYPES.UNIVERSAL
            }).fov;

            polygon.x = source.x;
            polygon.y = source.y;

            if (cache) {
                cache[radius] = polygon;
            }

            return polygon;
        }
    }

    patch("PointSource.prototype.initialize", "WRAPPER", function (wrapped, data) {
        this._pv_version++;

        if (this.sourceType === "light") {
            const document = this.object.document;
            const localUnrestricted = (data?.type == null || data.type === CONST.SOURCE_TYPES.LOCAL) && document.getFlag("perfect-vision", "unrestricted");

            if (localUnrestricted) {
                data = data ?? {};
                data.type = CONST.SOURCE_TYPES.UNIVERSAL;
            }

            wrapped(data);

            this.fov.x = this.x;
            this.fov.y = this.y;
            this.los.x = this.x;
            this.los.y = this.y;

            if (localUnrestricted) {
                this.type = CONST.SOURCE_TYPES.LOCAL;
            }

            this._pv_radius = this.radius;
            this._pv_fov = this.fov;
        } else if (this.sourceType === "sight") {
            const token = this.object;
            const scene = token.scene ?? token._original?.scene;
            const minR = Math.min(token.w, token.h) * 0.5;

            let dimVisionInDarkness;
            let dimVisionInDimLight;
            let brightVisionInDarkness;
            let brightVisionInDimLight;

            const document = token.document;

            let visionRules = document.getFlag("perfect-vision", "visionRules") || "default";

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

            const d = canvas.dimensions;
            const maxR = d.maxR ?? Math.hypot(d.sceneWidth, d.sceneHeight);

            let dim = getLightRadius(token, token.data.dimSight);
            let bright = getLightRadius(token, token.data.brightSight);

            const sign = Math.min(dim, bright) < 0 ? -1 : +1;

            dim = Math.abs(dim);
            bright = Math.abs(bright);

            dim = Math.min(dim, maxR);
            bright = Math.min(bright, maxR);

            let sightLimit = parseFloat(document.getFlag("perfect-vision", "sightLimit"));

            if (Number.isNaN(sightLimit)) {
                sightLimit = parseFloat(scene?.getFlag("perfect-vision", "sightLimit"));
            }

            if (!Number.isNaN(sightLimit)) {
                sightLimit = Math.max(getLightRadius(token, Math.abs(sightLimit)), minR);
                dim = Math.min(dim, sightLimit);
                bright = Math.min(bright, sightLimit);
            }

            data = data ?? {};

            data.dim = sign * Math.max(
                dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
                brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0
            );
            data.bright = sign * Math.max(
                dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
                brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
            );

            const visionRadius = Math.max(
                dimVisionInDarkness === "scene" || dimVisionInDarkness === "scene_mono" ? dim : 0,
                dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
                dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
                brightVisionInDarkness === "scene" || brightVisionInDarkness === "scene_mono" ? bright : 0,
                brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0,
                brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
            );
            const visionRadiusColor = Math.max(
                dimVisionInDarkness === "scene" ? dim : 0,
                dimVisionInDarkness === "dim" ? dim : 0,
                dimVisionInDarkness === "bright" ? dim : 0,
                brightVisionInDarkness === "scene" ? bright : 0,
                brightVisionInDarkness === "dim" ? bright : 0,
                brightVisionInDarkness === "bright" ? bright : 0
            );
            const visionRadiusBrighten = Math.max(
                dimVisionInDimLight === "bright" ? dim : 0,
                brightVisionInDimLight === "bright" ? bright : 0
            );
            const monoVisionColor = colorStringToHex(
                document.getFlag("perfect-vision", "monoVisionColor") || game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff"
            );

            this._pv_radius = Math.max(Math.abs(data.dim), Math.abs(data.bright));

            data.dim = data.dim === 0 && data.bright === 0 ? minR : data.dim;

            wrapped(data);

            this.fov.x = this.x;
            this.fov.y = this.y;
            this.los.x = this.x;
            this.los.y = this.y;

            this._pv_fov = this.fov;

            const cache = { [this.radius]: this.fov };

            this.fov = computePolygon(this, Math.max(visionRadius, minR), cache);

            if (!Number.isNaN(sightLimit)) {
                this.los = computePolygon(this, sightLimit, cache);
            }

            if (!token._original) {
                this._pv_fovMono = this.fov;
            } else {
                this._pv_fovMono = null;
            }

            if (visionRadiusColor > 0 && !token._original) {
                this._pv_fovColor = computePolygon(this, Math.max(visionRadiusColor, minR), cache);
            } else {
                this._pv_fovColor = null;
            }

            if (visionRadiusBrighten > 0 && !token._original) {
                this._pv_fovBrighten = computePolygon(this, Math.max(visionRadiusBrighten, minR), cache);
            } else {
                this._pv_fovBrighten = null;
            }

            if (token._original?.vision) {
                this._pv_tintMono = token._original.vision._pv_tintMono;
            } else if (this._pv_fovMono) {
                this._pv_tintMono = monoVisionColor;
            } else {
                this._pv_tintMono = 0xFFFFFF;
            }
        } else {
            wrapped(data);
        }

        return this;
    });

    function patchFragmentShader(cls, uniforms, code) {
        let i = 0;

        for (const match of cls.fragmentShader.matchAll(/(?:^|\s)main(0|[1-9]\d*)\s*\(/gm)) {
            i = Math.max(i, parseInt(match[1], 10) + 1);
        }

        cls.fragmentShader = cls.fragmentShader.replace(/(^|\W)void\s+main\s*\(\s*\)/gm, `$1void main${i}(${uniforms})`);
        cls.fragmentShader += "\n\n// Patched by Perfect Vision\n\n";
        cls.fragmentShader += code.replace(/%main%/gi, `main${i}`);
    }

    const patchedShaders = new WeakMap();

    function patchShader(cls) {
        const isIlluminationShader = cls === StandardIlluminationShader || cls.prototype instanceof StandardIlluminationShader;
        const isColorationShader = cls === StandardColorationShader || cls.prototype instanceof StandardColorationShader;

        if (!isIlluminationShader && !isColorationShader || !cls.hasOwnProperty("fragmentShader") || patchedShaders.has(cls)) {
            return;
        }

        patchedShaders.set(cls, cls.fragmentShader);

        cls.defaultUniforms.pv_UvsMatrix = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        cls.defaultUniforms.pv_MaskSize = [0, 0, 0, 0];
        cls.defaultUniforms.pv_ElevationRange = [0, 0];
        cls.defaultUniforms.pv_IsSight = false;
        cls.defaultUniforms.pv_IsDarkness = false;

        Logger.debug("Patching %s.fragmentShader (WRAPPER)", cls.name);

        if (isIlluminationShader) {
            patchFragmentShader(cls, "float alpha, float ratio", `\
                varying vec2 pv_MaskCoord;

                uniform bool pv_IsSight;
                uniform bool pv_IsDarkness;
                uniform sampler2D pv_Illumination;

                void main()
                {
                    float a = alpha;
                    float r = ratio;

                    if (pv_IsSight) {
                        float s = texture2D(pv_Illumination, pv_MaskCoord).r;
                        a *= mix(1.0, 0.8125, s);
                        r *= (1.0 - step(1.0, s));
                    } else if (!pv_IsDarkness) {
                        float s = texture2D(pv_Illumination, pv_MaskCoord).b;
                        r = max(r, s);
                    }

                    %main%(a, r);
                }`
            );
        }

        if (Mask.get("elevation")) {
            if (isColorationShader) {
                patchFragmentShader(cls, "", `\
                    varying vec2 pv_MaskCoord;

                    void main()
                    {
                        %main%();
                    }`
                );
            }

            patchFragmentShader(cls, "", `\
                uniform sampler2D pv_Elevation;
                uniform vec2 pv_ElevationRange;

                void main()
                {
                    float elevation = texture2D(pv_Elevation, pv_MaskCoord).r;

                    if (pv_ElevationRange.x <= elevation && elevation < pv_ElevationRange.y) {
                        %main%();
                    } else {
                        gl_FragColor = vec4(0.0);
                    }
                }`
            );
        }
    }

    patch("PointSource.prototype._createContainer", "OVERRIDE", function (shaderCls) {
        patchShader(shaderCls);

        const shader = shaderCls.create();

        shader.source = this;

        const state = new PIXI.State();
        const light = new SourcePolygonMesh(null, shader, state);

        const c = new PIXI.Container();

        c.light = c.addChild(light);
        c.fov = new PIXI.Graphics();

        Object.defineProperty(c, "shader", { get: () => c.light.shader, set: shader => c.light.shader = shader });
        Object.defineProperty(c, "uniforms", { get: () => c.light.shader.uniforms });

        c._pv_version = 0;

        return c;
    });

    patch("PointSource.prototype._drawContainer", "OVERRIDE", function (c) {
        if (this._pv_radius > 0) {
            c.light.polygon = this._pv_fov;

            const s = 1 / (2 * this._pv_radius);
            const tx = -(this.x - this._pv_radius) * s;
            const ty = -(this.y - this._pv_radius) * s;

            const uvsMatrix = c.light.shader.uniforms.pv_UvsMatrix;

            uvsMatrix[0] = s;
            uvsMatrix[4] = s;
            uvsMatrix[6] = tx;
            uvsMatrix[7] = ty;
        } else {
            c.light.polygon = null;
        }

        return c;
    });

    patch("PointSource.prototype._initializeShaders", "WRAPPER", function (wrapped, ...args) {
        const anim = CONFIG.Canvas.lightAnimations[this.animation.type] || {};
        const iCls = anim.illuminationShader || StandardIlluminationShader;
        const cCls = anim.colorationShader || StandardColorationShader;

        patchShader(iCls);
        patchShader(cCls);

        wrapped(...args);

        this.illumination.shader.source = this;
        this.coloration.shader.source = this;
    });

    patch("LightingLayer.prototype._drawIlluminationContainer", "POST", function (c) {
        c.filter.resolution = canvas.app.renderer.resolution;
        c.filter.blendMode = PIXI.BLEND_MODES.MULTIPLY_KEEP_ALPHA;
        return c;
    });

    patch("LightingLayer.prototype._drawColorationContainer", "POST", function (c) {
        c.filter.resolution = canvas.app.renderer.resolution;
        return c;
    });

    patch("LightingLayer.prototype._configureChannels", "WRAPPER", function (wrapped, ...args) {
        const ilm = this.illumination;

        const daylightColor = CONFIG.Canvas.daylightColor;
        const darknessColor = CONFIG.Canvas.darknessColor;

        CONFIG.Canvas.daylightColor = ilm._pv_daylightColor;
        CONFIG.Canvas.darknessColor = ilm._pv_darknessColor;

        const channels = wrapped(...args);

        const dim = CONFIG.Canvas.lightLevels.dim;

        channels.dim.rgb = channels.bright.rgb.map((c, i) => (dim * c) + ((1 - dim) * channels.background.rgb[i]));
        channels.dim.hex = rgbToHex(channels.dim.rgb);

        CONFIG.Canvas.daylightColor = daylightColor;
        CONFIG.Canvas.darknessColor = darknessColor;

        return channels;
    });

    patch("LightingLayer.prototype._drawIlluminationContainer", "POST", function (c) {
        c.background.destroy(true);
        c.background = c.addChildAt(new SpriteMesh(IlluminationBackgroundShader.instance));

        return c;
    });

    patch("LightingLayer.prototype.draw", "OVERRIDE", async function () {
        await PlaceablesLayer.prototype.draw.call(this);

        this.globalLight = canvas.scene.data.globalLight;
        this.darknessLevel = canvas.scene.data.darkness;

        this.lighting = this.addChildAt(new PIXI.Container(), 0);
        this.illumination = this.lighting.addChild(this._drawIlluminationContainer());
        this.coloration = this.lighting.addChild(this._drawColorationContainer());

        const bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);

        this.illumination.background.x = bgRect.x;
        this.illumination.background.y = bgRect.y;
        this.illumination.background.width = bgRect.width;
        this.illumination.background.height = bgRect.height;

        this.activateAnimation();

        Board.place("lighting", this.lighting, "lighting");

        return this;
    });

    patch("LightingLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        IlluminationBackgroundShader.instance.version = -1;

        Board.unplace("lighting");

        return await wrapped(...args);
    });

    patch("LightingLayer.prototype.refresh", "WRAPPER", function (wrapped, darkness) {
        let saturation = this._pv_saturation;

        if (saturation === undefined) {
            if (canvas.scene.getFlag("perfect-vision", "forceSaturation")) {
                saturation = canvas.scene.getFlag("perfect-vision", "saturation") ?? 0;
            } else {
                const darknessLevel = Math.clamped(darkness ?? this.darknessLevel, 0, 1);

                saturation = 1 - darknessLevel;
            }
        }

        this._pv_saturationLevel = saturation = Math.clamped(saturation, 0, 1);

        const ilm = this.illumination;

        let daylightColor = canvas.scene.getFlag("perfect-vision", "daylightColor");
        let darknessColor = canvas.scene.getFlag("perfect-vision", "darknessColor");

        if (daylightColor) {
            daylightColor = colorStringToHex(daylightColor);
        } else {
            daylightColor = CONFIG.Canvas.daylightColor;
        }

        if (darknessColor) {
            darknessColor = colorStringToHex(darknessColor);
        } else {
            darknessColor = CONFIG.Canvas.darknessColor;
        }

        const sanitize = hex => {
            const x = [(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF].map(x => Math.max(x, 0xF));
            return (x[0] << 16) + (x[1] << 8) + x[2];
        }

        daylightColor = sanitize(daylightColor);
        darknessColor = sanitize(darknessColor);

        if (daylightColor !== ilm._pv_daylightColor || darknessColor !== ilm._pv_darknessColor) {
            this.channels = null;
        }

        ilm._pv_daylightColor = daylightColor;
        ilm._pv_darknessColor = darknessColor;

        wrapped(darkness);

        return this;
    });
});

function getLightRadius(token, units) {
    if (units === 0) {
        return 0;
    }

    const u = Math.abs(units);
    const hw = token.w / 2;

    return (u / canvas.dimensions.distance * canvas.dimensions.size + hw) * Math.sign(units);
}

Hooks.once("canvasInit", () => {
    PIXI.BLEND_MODES.MULTIPLY_KEEP_ALPHA = canvas.app.renderer.state.blendModes.push([
        WebGL2RenderingContext.ZERO,
        WebGL2RenderingContext.SRC_COLOR,
        WebGL2RenderingContext.ZERO,
        WebGL2RenderingContext.ONE
    ]) - 1;
});

Hooks.on("updateScene", (scene, change, options, userId) => {
    if (!scene.isView || !hasProperty(change, "flags.perfect-vision")) {
        return;
    }

    canvas.perception.schedule({
        lighting: { initialize: true, refresh: true },
        sight: { initialize: true, refresh: true }
    });
});

Hooks.on("updateToken", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView || !hasProperty(change, "flags.perfect-vision")) {
        return;
    }

    const token = canvas.tokens.get(document.id);

    if (token) {
        token.updateSource({ defer: true });

        canvas.perception.schedule({
            lighting: { refresh: true },
            sight: { refresh: true, forceUpdateFog: token.hasLimitedVisionAngle }
        });
    }
});

Hooks.on("updateAmbientLight", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView || !hasProperty(change, "flags.perfect-vision")) {
        return;
    }

    const light = canvas.lighting.get(document.id);

    if (light) {
        light.updateSource({ defer: true });

        canvas.perception.schedule({
            lighting: { refresh: true },
            sight: { refresh: true }
        });
    }
});

Logger.debug("Patching AbstractBaseShader.vertexShader (OVERRIDE)");

AbstractBaseShader.vertexShader = `\
    precision mediump float;

    attribute vec2 aVertexPosition;

    uniform mat3 translationMatrix;
    uniform mat3 projectionMatrix;
    uniform mat3 pv_UvsMatrix;
    uniform vec4 pv_MaskSize;

    varying vec2 vUvs;
    varying vec2 pv_MaskCoord;

    void main()
    {
        vec3 position = translationMatrix * vec3(aVertexPosition, 1.0);
        gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
        vUvs = (pv_UvsMatrix * vec3(aVertexPosition, 1.0)).xy;
        pv_MaskCoord = position.xy * pv_MaskSize.zw;
    }`;

Logger.debug("Patching AbstractBaseShader.prototype.update (OVERRIDE)");

AbstractBaseShader.prototype.update = function () {
    this.uniforms.pv_IsSight = this.source.sourceType === "sight";
    this.uniforms.pv_IsDarkness = this.source.isDarkness;

    if (this.uniforms.pv_MaskSize !== Mask.size) {
        this.uniforms.pv_MaskSize = Mask.size;
    }

    const illumination = Mask.getTexture("illumination");

    if (this.uniforms.pv_Illumination !== illumination) {
        this.uniforms.pv_Illumination = illumination;
    }

    const elevation = Mask.get("elevation");

    if (elevation) {
        if (this.uniforms.pv_Elevation !== elevation.texture) {
            this.uniforms.pv_Elevation = elevation.texture;
        }

        Elevation.getSourceElevationRange(this.source, this.uniforms.pv_ElevationRange);
    }
};

class IlluminationBackgroundShader extends PIXI.Shader {
    static vertexSource = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;
        uniform vec4 uMaskSize;

        varying vec2 vMaskCoord;

        void main()
        {
            vec3 position = translationMatrix * vec3(aVertexPosition, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
            vMaskCoord = position.xy * uMaskSize.zw;
        }`;

    static fragmentSource = `\
        varying vec2 vMaskCoord;

        uniform sampler2D uIllumination;
        uniform vec3 uColorLight;
        uniform vec3 uColorDarkness;

        void main()
        {
            vec3 mask = texture2D(uIllumination, vMaskCoord).rgb;
            gl_FragColor = vec4(mix(uColorDarkness, uColorLight, mask.r), 1.0);
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSource, this.fragmentSource);
        }

        return this._program;
    }

    static defaultUniforms() {
        return {
            uMaskSize: Mask.size,
            uIllumination: Mask.getTexture("illumination"),
            uColorLight: new Float32Array(3),
            uColorDarkness: new Float32Array(3),
        };
    }

    static get instance() {
        if (!this._instance) {
            this._instance = new IlluminationBackgroundShader();
        }

        return this._instance;
    }

    constructor() {
        super(IlluminationBackgroundShader.program, IlluminationBackgroundShader.defaultUniforms());

        this.version = -1;
        this.improvedGMVision = null;
    }

    update() {
        if (this.version !== canvas.lighting.version) {
            this.version = canvas.lighting.version;

            const channels = canvas.lighting.channels;

            this.uniforms.uColorLight = channels.background.rgb;

            this.improvedGMVision = null;
        }

        const improvedGMVision = canvas.sight.sources.size === 0 && game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision");

        if (this.improvedGMVision !== improvedGMVision) {
            this.improvedGMVision = improvedGMVision;

            const channels = canvas.lighting.channels;

            if (improvedGMVision) {
                const s = 1 / Math.max(...channels.background.rgb);

                this.uniforms.uColorDarkness = channels.background.rgb.map(c => c * s);
            } else {
                this.uniforms.uColorDarkness = channels.background.rgb;
            }
        }
    }
}
