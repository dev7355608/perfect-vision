import { Board } from "../board.js";
import { Drawings } from "../drawings.js";
import { Elevation } from "../elevation.js";
import { Lighting } from "../lighting.js";
import { Logger } from "../../utils/logger.js";
import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";
import { presets } from "../../settings.js";
import { ShapeData } from "../../display/shape-data.js";
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

                    polygon.points.push(q.x, q.y);
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
        this._pv_version = this._pv_version ?? 0;
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

            const fov = ShapeData.from(this.fov);

            if (this._pv_fov !== fov) {
                if (this._pv_fov) {
                    this._pv_fov.release();
                }

                this._pv_fov = fov;
            }

            const los = ShapeData.from(this.los);

            if (this._pv_los !== los) {
                if (this._pv_los) {
                    this._pv_los.release();
                }

                this._pv_los = los;
            }
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

            let dim = getLightRadius(token, token.data.dimSight);
            let bright = getLightRadius(token, token.data.brightSight);

            const sign = Math.min(dim, bright) < 0 ? -1 : +1;

            dim = Math.abs(dim);
            bright = Math.abs(bright);

            dim = Math.min(dim, d.maxR);
            bright = Math.min(bright, d.maxR);

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
            data.bright = Math.max(
                dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
                brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
            );
            data.dim = Math.max(
                data.bright,
                dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
                brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0
            );

            this._pv_radius = Math.max(data.dim, data.bright);

            if (data.dim === 0 && data.bright === 0) {
                data.dim = minR;
            } else {
                data.dim *= sign;
                data.bright *= sign;
            }

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
            const monoVisionColor = foundry.utils.colorStringToHex(
                document.getFlag("perfect-vision", "monoVisionColor") || game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff"
            );

            wrapped(data);

            this.fov.x = this.x;
            this.fov.y = this.y;
            this.los.x = this.x;
            this.los.y = this.y;

            const cache = { [this.radius]: this.fov };

            const fov = ShapeData.from(this.fov);

            if (this._pv_fov !== fov) {
                if (this._pv_fov) {
                    this._pv_fov.release();
                }

                this._pv_fov = fov;
            }

            if (!Number.isNaN(sightLimit)) {
                this.los = computePolygon(this, sightLimit, cache);
            }

            const los = ShapeData.from(this.los);

            if (this._pv_los !== los) {
                if (this._pv_los) {
                    this._pv_los.release();
                }

                this._pv_los = los;
            }

            this.fov = computePolygon(this, Math.max(visionRadius, minR), cache);

            let fovMono;

            if (visionRadius > 0 && !token._original) {
                fovMono = ShapeData.from(this.fov);
            } else {
                fovMono = null;
            }

            if (this._pv_fovMono !== fovMono) {
                if (this._pv_fovMono) {
                    this._pv_fovMono.release();
                }

                this._pv_fovMono = fovMono;
            }

            let fovColor;

            if (visionRadiusColor > 0 && !token._original) {
                fovColor = ShapeData.from(computePolygon(this, Math.max(visionRadiusColor, minR), cache));
            } else {
                fovColor = null;
            }

            if (this._pv_fovColor !== fovColor) {
                if (this._pv_fovColor) {
                    this._pv_fovColor.release();
                }

                this._pv_fovColor = fovColor;
            }

            let fovBrighten;

            if (visionRadiusBrighten > 0 && !token._original) {
                fovBrighten = ShapeData.from(computePolygon(this, Math.max(visionRadiusBrighten, minR), cache));
            } else {
                fovBrighten = null;
            }

            if (this._pv_fovBrighten !== fovBrighten) {
                if (this._pv_fovBrighten) {
                    this._pv_fovBrighten.release();
                }

                this._pv_fovBrighten = fovBrighten;
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

    function destroyPointSource(source) {
        if (source._pv_fov) {
            source._pv_fov.release();
            source._pv_fov = null;
        }

        if (source._pv_fovMono) {
            source._pv_fovMono.release();
            source._pv_fovMono = null;
        }

        if (source._pv_fovColor) {
            source._pv_fovColor.release();
            source._pv_fovColor = null;
        }

        if (source._pv_fovBrighten) {
            source._pv_fovBrighten.release();
            source._pv_fovBrighten = null;
        }

        if (source._pv_los) {
            source._pv_los.release();
            source._pv_los = null;
        }

        source._pv_area = null;
    }

    patch("Token.prototype.destroy", "PRE", function () {
        destroyPointSource(this.vision);
        destroyPointSource(this.light);

        return arguments;
    });

    patch("AmbientLight.prototype.destroy", "PRE", function () {
        destroyPointSource(this.source);

        return arguments;
    });

    patch("Drawing.prototype.destroy", "PRE", function () {
        if (this._pv_fov) {
            this._pv_fov.release();
            this._pv_fov = null;
        }

        if (this._pv_los) {
            this._pv_los.release();
            this._pv_los = null;
        }

        return arguments;
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
        cls.defaultUniforms.pv_IsSight = false;
        cls.defaultUniforms.pv_IsDarkness = false;
        cls.defaultUniforms.pv_LightLevelDim = CONFIG.Canvas.lightLevels.dim;
        cls.defaultUniforms.pv_LightLevelBright = CONFIG.Canvas.lightLevels.bright;
        cls.defaultUniforms.pv_DarknessLightPenalty = CONFIG.Canvas.darknessLightPenalty;
        cls.defaultUniforms.pv_ElevationRange = [0, 1];

        Logger.debug("Patching %s.fragmentShader (WRAPPER)", cls.name);

        if (isIlluminationShader) {
            patchFragmentShader(cls, "float alpha, float ratio, vec3 colorBright, vec3 colorDim", `\
                varying vec2 pv_MaskCoord;

                uniform sampler2D pv_Illumination;
                uniform sampler2D pv_Lighting;
                uniform sampler2D pv_Vision;
                uniform bool pv_IsSight;
                uniform bool pv_IsDarkness;
                uniform float pv_LightLevelDim;
                uniform float pv_LightLevelBright;
                uniform float pv_DarknessLightPenalty;

                void main()
                {
                    float pAlpha;
                    float pRatio;
                    vec3 pColorBright;
                    vec3 pColorDim;

                    if (!pv_IsDarkness) {
                        if (!pv_IsSight) {
                            pAlpha = alpha;
                            pRatio = max(ratio, texture2D(pv_Vision, pv_MaskCoord).b);
                        } else {
                            float s = texture2D(pv_Vision, pv_MaskCoord).g;

                            pAlpha = alpha * mix(0.8125, 1.0, s);
                            pRatio = ratio * floor(s + 0.5);
                        }

                        vec3 colorBackground = texture2D(pv_Illumination, pv_MaskCoord).rgb;
                        float darkness = texture2D(pv_Lighting, pv_MaskCoord).r;
                        float penalty = 1.0 - pv_DarknessLightPenalty * darkness;

                        pColorBright = vec3(pv_LightLevelBright * penalty);
                        pColorDim = mix(colorBackground, pColorBright, pv_LightLevelDim);
                    } else {
                        pAlpha = alpha;
                        pRatio = ratio;
                        pColorBright = colorBright;
                        pColorDim = colorDim;
                    }

                    %main%(pAlpha, pRatio, pColorBright, pColorDim);
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

                    if (elevation < 0.0 || pv_ElevationRange.x <= elevation && elevation < pv_ElevationRange.y) {
                        %main%();
                    } else {
                        discard;
                    }
                }`
            );
        }
    }

    const EMPTY_GEOMETRY = new PIXI.MeshGeometry();

    patch("PointSource.prototype._createContainer", "OVERRIDE", function (shaderCls) {
        patchShader(shaderCls);

        const shader = shaderCls.create();

        shader.source = this;

        const state = PIXI.State.for2d();
        const light = new PIXI.Mesh(EMPTY_GEOMETRY, shader, state);
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
            c.light.geometry = this._pv_fov.geometry;
            c.light.drawMode = this._pv_fov.drawMode;

            const s = 1 / (2 * this._pv_radius);
            const tx = -(this.x - this._pv_radius) * s;
            const ty = -(this.y - this._pv_radius) * s;

            const uvsMatrix = c.light.shader.uniforms.pv_UvsMatrix;

            uvsMatrix[0] = s;
            uvsMatrix[4] = s;
            uvsMatrix[6] = tx;
            uvsMatrix[7] = ty;
        } else {
            c.light.geometry = EMPTY_GEOMETRY;
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
        c.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        c.filterArea = canvas.app.renderer.screen;

        return c;
    });

    patch("LightingLayer.prototype._drawColorationContainer", "POST", function (c) {
        c.filter.resolution = canvas.app.renderer.resolution;
        c.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        c.filterArea = canvas.app.renderer.screen;

        return c;
    });

    patch("LightingLayer.prototype._configureChannels", "OVERRIDE", function (darkness = null) {
        this._pv_version = ++this.version;

        const channels = configureChannels(darkness, {
            daylightColor: this._pv_daylightColor,
            darknessColor: this._pv_darknessColor
        });

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
        this.channels = null;

        this._pv_active = true;
        this._pv_parent = null;
        this._pv_origin = null;
        this._pv_walls = false;
        this._pv_vision = false;
        this._pv_fov = new ShapeData(canvas.dimensions.rect.clone());
        this._pv_los = null;
        this._pv_globalLight = this.globalLight;

        let daylightColor = canvas.scene.getFlag("perfect-vision", "daylightColor") ?? "";

        if (daylightColor === "") {
            daylightColor = CONFIG.Canvas.daylightColor;
        }

        this._pv_daylightColor = sanitizeLightColor(daylightColor);

        let darknessColor = canvas.scene.getFlag("perfect-vision", "darknessColor") ?? "";

        if (darknessColor === "") {
            darknessColor = CONFIG.Canvas.darknessColor;
        }

        this._pv_darknessColor = sanitizeLightColor(darknessColor);
        this._pv_darknessLevel = this.darknessLevel;
        this._pv_saturationLevel = Math.clamped(canvas.scene.getFlag("perfect-vision", "saturation") ?? (1 - this.darknessLevel), 0, 1);
        this._pv_channels = this.channels;
        this._pv_version = this.version;
        this._pv_zIndex = -Infinity;
        this._pv_data_globalLight = canvas.scene.data.globalLight;
        this._pv_data_globalLightThreshold = canvas.scene.data.globalLightThreshold;
        this._pv_preview = null;
        this._pv_areas = [];

        this.lighting = this.addChildAt(new PIXI.Container(), 0);
        this.illumination = this.lighting.addChild(this._drawIlluminationContainer());
        this.coloration = this.lighting.addChild(this._drawColorationContainer());

        const bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);

        this.illumination.background.x = bgRect.x;
        this.illumination.background.y = bgRect.y;
        this.illumination.background.width = bgRect.width;
        this.illumination.background.height = bgRect.height;

        this.activateAnimation();

        Board.place("lighting.lighting", this.lighting, Board.LAYERS.LIGHTING, 0);

        return this;
    });

    patch("LightingLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        IlluminationBackgroundShader.instance.version = -1;

        Board.unplace("lighting.lighting");

        this._pv_active = false;
        this._pv_parent = null;
        this._pv_origin = null;
        this._pv_walls = false;
        this._pv_vision = false;

        if (this._pv_fov) {
            this._pv_fov.release();
            this._pv_fov = null;
        }

        if (this._pv_los) {
            this._pv_los.release();
            this._pv_los = null;
        }

        this._pv_globalLight = false;
        this._pv_daylightColor = 0;
        this._pv_darknessColor = 0;
        this._pv_darknessLevel = 0;
        this._pv_saturationLevel = 0;
        this._pv_channels = null;
        this._pv_version = 0;
        this._pv_zIndex = -Infinity;
        this._pv_data_globalLight = false;
        this._pv_data_globalLightThreshold = null;
        this._pv_preview = null;
        this._pv_areas = null;

        return await wrapped(...args);
    });

    patch("AmbientLight.prototype.isVisible", "OVERRIDE", function () {
        return !this.data.hidden && getDarknessLevel(this.source).between(this.data.darkness.min ?? 0, this.data.darkness.max ?? 1);
    });

    patch("AmbientSound.prototype.isAudible", "OVERRIDE", function () {
        if (this.levelsInaudible) return false;
        return !this.data.hidden && getDarknessLevel(this.center).between(this.data.darkness.min ?? 0, this.data.darkness.max ?? 1);
    });

    patch("PointSource.prototype.drawLight", "OVERRIDE", function () {
        // Protect against cases where the canvas is being deactivated
        const shader = this.illumination.shader;

        if (!shader) {
            return null;
        }

        // Update shader uniforms
        const iu = shader.uniforms;
        const version = this._pv_area?._pv_version ?? canvas.lighting.version;
        const updateChannels = this._lightingVersion < version;

        if (this._resetIlluminationUniforms || updateChannels) {
            const channels = this._pv_area?._pv_channels ?? canvas.lighting.channels;

            iu.colorDim = this.isDarkness ? channels.dark.rgb : channels.dim.rgb;
            iu.colorBright = this.isDarkness ? channels.black.rgb : channels.bright.rgb;
            this._lightingVersion = version;

            iu.pv_IsSight = this.sourceType === "sight";
            iu.pv_IsDarkness = this.isDarkness;
            iu.pv_LightLevelDim = CONFIG.Canvas.lightLevels.dim;
            iu.pv_LightLevelBright = CONFIG.Canvas.lightLevels.bright;
            iu.pv_DarknessLightPenalty = CONFIG.Canvas.darknessLightPenalty;
        }

        if (this._resetIlluminationUniforms) {
            iu.ratio = this.ratio;
            this._resetIlluminationUniforms = false;
        }

        // Draw the container
        return this._drawContainer(this.illumination);
    });

    patch("LightingLayer.prototype.refresh", "OVERRIDE", function (darkness) {
        this._pv_data_globalLight = canvas.scene.data.globalLight;
        this._pv_data_globalLightThreshold = canvas.scene.data.globalLightThreshold;

        const priorDarknessLevel = this.darknessLevel;
        let darknessChanged = darkness !== undefined && darkness !== priorDarknessLevel;

        this.darknessLevel = darkness = Math.clamped(darkness ?? this.darknessLevel, 0, 1);
        this._pv_darknessLevel = darkness;

        let saturation;

        if (this._pv_preview?.hasOwnProperty("saturation")) {
            saturation = this._pv_preview.saturation ?? null;
        } else {
            saturation = canvas.scene.getFlag("perfect-vision", "saturation") ?? null;

            if (canvas.scene._pv_migration_forceSaturation !== 2) {
                const forceSaturation = canvas.scene.getFlag("perfect-vision", "forceSaturation");

                if (forceSaturation !== undefined) {
                    if (!forceSaturation) {
                        saturation = null;
                    }

                    if (game.user.isGM && canvas.scene._pv_migration_forceSaturation !== 1) {
                        canvas.scene.update({
                            "flags.perfect-vision.-=forceSaturation": null,
                            "flags.perfect-vision.saturation": saturation
                        });

                        canvas.scene._pv_migration_forceSaturation = 1;
                    }
                } else {
                    canvas.scene._pv_migration_forceSaturation = 2;
                }
            }
        }

        if (saturation === null) {
            saturation = 1 - darkness;
        }

        this._pv_saturationLevel = saturation = Math.clamped(saturation, 0, 1);

        let daylightColor;

        if (this._pv_preview?.hasOwnProperty("daylightColor")) {
            daylightColor = this._pv_preview.daylightColor ?? "";
        } else {
            daylightColor = canvas.scene.getFlag("perfect-vision", "daylightColor") ?? "";
        }

        if (daylightColor === "") {
            daylightColor = CONFIG.Canvas.daylightColor;
        }

        daylightColor = sanitizeLightColor(daylightColor);

        let darknessColor;

        if (this._pv_preview?.hasOwnProperty("darknessColor")) {
            darknessColor = this._pv_preview.darknessColor ?? "";
        } else {
            darknessColor = canvas.scene.getFlag("perfect-vision", "darknessColor") ?? "";
        }

        if (darknessColor === "") {
            darknessColor = CONFIG.Canvas.darknessColor;
        }

        darknessColor = sanitizeLightColor(darknessColor);

        if (daylightColor !== this._pv_daylightColor || darknessColor !== this._pv_darknessColor) {
            this.channels = null;
        }

        this._pv_daylightColor = daylightColor;
        this._pv_darknessColor = darknessColor;

        // Update lighting channels
        if (darknessChanged || !this.channels) {
            this.channels = this._configureChannels(darkness);
            this._pv_channels = this.channels;
        }

        // Track global illumination
        const globalLight = this.hasGlobalIllumination();

        if (this.globalLight !== globalLight) {
            this.globalLight = globalLight;
            this._pv_globalLight = globalLight;

            canvas.perception.schedule({ sight: { initialize: true, refresh: true } });
        }

        let refreshVision = false;

        darknessChanged = refreshAreas(this) || darknessChanged;

        // Clear currently rendered sources
        const ilm = this.illumination;
        ilm.lights.removeChildren();
        const col = this.coloration;
        col.removeChildren();
        this._animatedSources = [];

        // Tint the background color
        canvas.app.renderer.backgroundColor = this.channels.canvas.hex;
        ilm.background.tint = this.channels.background.hex;

        // Render light sources
        for (const sources of [this.sources, canvas.sight.sources]) {
            for (const source of sources) {
                const area = Lighting.findArea(source);

                if (source._pv_area !== area) {
                    source._pv_area = area;
                    source._lightingVersion = 0;
                    source._resetIlluminationUniforms = true;
                }

                // Check the active state of the light source
                const active = !source.skipRender && area._pv_darknessLevel.between(source.darkness.min, source.darkness.max);

                if (source.active !== active) {
                    source.active = active;
                    refreshVision = true;
                }

                if (!source.active) {
                    continue;
                }

                // Draw the light update
                const light = source.drawLight();
                if (light) ilm.lights.addChild(light);
                const color = source.drawColor();
                if (color) col.addChild(color);
                if (source.animation?.type) this._animatedSources.push(source);
            }
        }

        // Draw non-occluded roofs that block light
        const displayRoofs = canvas.foreground.displayRoofs;
        for (let roof of canvas.foreground.roofs) {
            if (!displayRoofs || roof.occluded) continue;
            const si = roof.getRoofSprite();
            if (!si) continue;

            // Block illumination
            si.tint = this.channels.background.hex;
            this.illumination.lights.addChild(si)

            // Block coloration
            const sc = roof.getRoofSprite();
            sc.tint = 0x000000;
            this.coloration.addChild(sc);
        }

        // Refresh vision if necessary
        if (refreshVision) {
            canvas.perception.schedule({ sight: { refresh: true } });
        }

        // Refresh audio if darkness changed
        if (darknessChanged) {
            this._onDarknessChange(darkness, priorDarknessLevel);
            canvas.sounds._onDarknessChange(darkness, priorDarknessLevel);
        }

        // Dispatch a hook that modules can use
        Hooks.callAll("lightingRefresh", this);
    });

    patch("LightingLayer.prototype.hasGlobalIllumination", "OVERRIDE", function () {
        const sd = canvas.scene.data;
        return sd.globalLight && (sd.globalLightThreshold === null || this.darknessLevel <= sd.globalLightThreshold);
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

function sanitizeLightColor(color) {
    if (typeof color === "string") {
        color = foundry.utils.colorStringToHex(color);
    }

    const x = [(color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF].map(x => Math.max(x, 0xF));
    return (x[0] << 16) + (x[1] << 8) + x[2];
}

function getDarknessLevel(point) {
    return Lighting.findArea(point)._pv_darknessLevel ?? 0;
}

function refreshAreas(layer) {
    if (!layer._pv_areas) {
        return;
    }

    const sorted = [];
    const visited = {};

    const visit = area => {
        if (area === layer) {
            return;
        }

        if (visited[area.id]) {
            return;
        }

        visited[area.id] = true;

        if (area._pv_active === undefined) {
            area._pv_active = false;
            area._pv_parent = null;
            area._pv_origin = null;
            area._pv_walls = false;
            area._pv_vision = false;
            area._pv_fov = null;
            area._pv_los = null;
            area._pv_globalLight = false;
            area._pv_daylightColor = 0;
            area._pv_darknessColor = 0;
            area._pv_darknessLevel = 0;
            area._pv_saturationLevel = 0;
            area._pv_channels = null;
            area._pv_version = 0;
            area._pv_zIndex = 0;
            area._pv_data_globalLight = false;
            area._pv_data_globalLightThreshold = null;
        }

        let parent;

        if (area._pv_preview?.hasOwnProperty("parent")) {
            parent = area._pv_preview.parent ?? "";
        } else {
            parent = area.document.getFlag("perfect-vision", "parent") ?? "";
        }

        if (parent) {
            parent = canvas.drawings.get(parent) ?? null;
        } else {
            parent = layer;
        }

        area._pv_parent = parent;

        if (parent) {
            visit(parent);
        }

        sorted.push(area);
    }

    for (const drawing of canvas.drawings.placeables) {
        visit(drawing);
    }

    let darknessChanged = false;
    let refreshVision = false;

    layer._pv_areas.length = 0;

    for (const area of sorted) {
        const document = area.document;

        let active;

        if (area._pv_preview?.hasOwnProperty("active")) {
            active = !!area._pv_preview.active;
        } else {
            active = !!document.getFlag("perfect-vision", "active");
        }

        active = active && area._pv_parent?._pv_active;

        if (area._pv_active !== active) {
            area._pv_active = active;

            canvas.perception.schedule({ sight: { initialize: true, refresh: true } });
        }

        if (!active) {
            area._pv_parent = null;
            area._pv_origin = null;
            area._pv_walls = false;
            area._pv_vision = false;

            if (area._pv_fov) {
                area._pv_fov.release();
                area._pv_fov = null;
            }

            if (area._pv_los) {
                area._pv_los.release();
                area._pv_los = null;
            }

            area._pv_globalLight = false;
            area._pv_daylightColor = 0;
            area._pv_darknessColor = 0;
            area._pv_darknessLevel = 0;
            area._pv_saturationLevel = 0;
            area._pv_channels = null;
            area._pv_version = 0;
            area._pv_zIndex = 0;
            area._pv_data_globalLight = false;
            area._pv_data_globalLightThreshold = null;

            continue;
        }

        if (!area.skipRender) {
            layer._pv_areas.push(area);
        }

        let origin;

        if (area._pv_preview?.hasOwnProperty("origin")) {
            origin = area._pv_preview.origin ?? { x: 0.5, y: 0.5 };
        } else {
            origin = document.getFlag("perfect-vision", "origin") ?? { x: 0.5, y: 0.5 };
        }

        const extract = Drawings.extractShapeAndOrigin(area, origin);

        area._pv_origin = extract.origin;

        let walls;

        if (area._pv_preview?.hasOwnProperty("walls")) {
            walls = !!area._pv_preview.walls;
        } else {
            walls = !!document.getFlag("perfect-vision", "walls");
        }

        area._pv_walls = walls;

        if (area._pv_walls !== walls) {
            area._pv_walls = walls;

            refreshVision = true;
        }

        let vision;

        if (area._pv_preview?.hasOwnProperty("vision")) {
            vision = !!area._pv_preview.vision;
        } else {
            vision = !!document.getFlag("perfect-vision", "vision");
        }

        if (area._pv_vision !== vision) {
            area._pv_vision = vision;

            refreshVision = true;
        }

        let fov;

        if (extract.shape) {
            fov = ShapeData.from(extract.shape);
        } else {
            fov = null;
        }

        if (area._pv_fov !== fov) {
            if (area._pv_fov) {
                area._pv_fov.release();
            }

            area._pv_fov = fov;

            refreshVision = true;
        }

        let los;

        if (area._pv_walls) {
            los = ShapeData.from(canvas.walls.computePolygon(area._pv_origin, canvas.dimensions.maxR, { type: "light" }).los);
        } else {
            los = null;
        }

        if (area._pv_los !== los) {
            if (area._pv_los) {
                area._pv_los.release();
            }

            area._pv_los = los;

            refreshVision = true;
        }

        let globalLight;

        if (area._pv_preview?.hasOwnProperty("globalLight")) {
            globalLight = area._pv_preview.globalLight;
        } else {
            globalLight = document.getFlag("perfect-vision", "globalLight");
        }

        if (globalLight === undefined) {
            globalLight = area._pv_parent._pv_data_globalLight;
        }

        area._pv_data_globalLight = globalLight = !!globalLight;

        let daylightColor;

        if (area._pv_preview?.hasOwnProperty("daylightColor")) {
            daylightColor = area._pv_preview.daylightColor;
        } else {
            daylightColor = document.getFlag("perfect-vision", "daylightColor");
        }

        if (daylightColor !== undefined) {
            daylightColor = daylightColor ?? "";

            if (daylightColor === "") {
                daylightColor = CONFIG.Canvas.daylightColor;
            }
        } else {
            daylightColor = area._pv_parent._pv_daylightColor;
        }

        daylightColor = sanitizeLightColor(daylightColor);

        let darknessColor;

        if (area._pv_preview?.hasOwnProperty("darknessColor")) {
            darknessColor = area._pv_preview.darknessColor;
        } else {
            darknessColor = document.getFlag("perfect-vision", "darknessColor");
        }

        if (darknessColor !== undefined) {
            darknessColor = darknessColor ?? "";

            if (darknessColor === "") {
                darknessColor = CONFIG.Canvas.darknessColor;
            }
        } else {
            darknessColor = area._pv_parent._pv_darknessColor;
        }

        darknessColor = sanitizeLightColor(darknessColor);

        if (area._pv_daylightColor !== daylightColor || area._pv_darknessColor !== darknessColor) {
            area._pv_channels = null;
        }

        area._pv_daylightColor = daylightColor;
        area._pv_darknessColor = darknessColor;

        let darkness;

        if (area._pv_preview?.hasOwnProperty("darkness")) {
            darkness = area._pv_preview.darkness;
        } else {
            darkness = document.getFlag("perfect-vision", "darkness");
        }

        if (darkness !== undefined) {
            darkness = darkness ?? 0;
        } else {
            darkness = area._pv_parent._pv_darknessLevel;
        }

        darkness = Math.clamped(darkness, 0, 1);

        if (area._pv_darknessLevel !== darkness) {
            area._pv_channels = null;

            darknessChanged = true;
        }

        area._pv_darknessLevel = darkness;

        let saturation;

        if (area._pv_preview?.hasOwnProperty("saturation")) {
            saturation = area._pv_preview.saturation
        } else {
            saturation = document.getFlag("perfect-vision", "saturation");
        }

        if (saturation !== undefined) {
            if (saturation === null) {
                saturation = 1 - area._pv_darknessLevel;
            }
        } else {
            saturation = area._pv_parent._pv_saturationLevel;
        }

        area._pv_saturationLevel = saturation = Math.clamped(saturation, 0, 1);

        let globalLightThreshold;

        if (area._pv_preview?.hasOwnProperty("globalLightThreshold")) {
            globalLightThreshold = area._pv_preview.globalLightThreshold;
        } else {
            globalLightThreshold = document.getFlag("perfect-vision", "globalLightThreshold");
        }

        if (globalLightThreshold === undefined) {
            globalLightThreshold = area._pv_parent._pv_data_globalLightThreshold;
        }

        area._pv_data_globalLightThreshold = globalLightThreshold;

        globalLight = globalLight && (globalLightThreshold === null || area._pv_darknessLevel <= globalLightThreshold);

        if (area._pv_globalLight !== globalLight) {
            area._pv_globalLight = globalLight;

            refreshVision = true;
        }

        if (area._pv_channels === null) {
            area._pv_version++;
            area._pv_channels = configureChannels(darkness, { daylightColor, darknessColor });
        }

        area._pv_zIndex = area.data.z;
    }

    layer._pv_areas.sort((a, b) => a._pv_zIndex - b._pv_zIndex || a.id.localeCompare(b.id, "en"));

    if (refreshVision) {
        canvas.perception.schedule({ sight: { initialize: true, refresh: true } });
    }

    return darknessChanged;
}

function configureChannels(darkness = null, {
    backgroundColor,
    daylightColor = CONFIG.Canvas.daylightColor,
    darknessColor = CONFIG.Canvas.darknessColor,
    darknessLightPenalty = CONFIG.Canvas.darknessLightPenalty,
    dark = CONFIG.Canvas.lightLevels.dark,
    black = 0.5,
    dim = CONFIG.Canvas.lightLevels.dim,
    bright = CONFIG.Canvas.lightLevels.bright
}) {
    darkness = darkness ?? canvas.scene.data.darkness;
    backgroundColor = backgroundColor ?? canvas.backgroundColor;

    const channels = { daylight: {}, darkness: {}, scene: {}, canvas: {}, background: {}, dark: {}, black: {}, bright: {}, dim: {} };

    channels.daylight.rgb = canvas.scene.data.tokenVision ? foundry.utils.hexToRGB(daylightColor) : [1.0, 1.0, 1.0];
    channels.daylight.hex = foundry.utils.rgbToHex(channels.daylight.rgb);
    channels.darkness.level = darkness;
    channels.darkness.rgb = foundry.utils.hexToRGB(darknessColor);
    channels.darkness.hex = foundry.utils.rgbToHex(channels.darkness.rgb);
    channels.scene.rgb = foundry.utils.hexToRGB(backgroundColor);
    channels.scene.hex = foundry.utils.rgbToHex(channels.scene.rgb);
    channels.canvas.rgb = channels.darkness.rgb.map((c, i) => ((1 - darkness) + darkness * c) * channels.scene.rgb[i]);
    channels.canvas.hex = foundry.utils.rgbToHex(channels.canvas.rgb);
    channels.background.rgb = channels.darkness.rgb.map((c, i) => darkness * c + (1 - darkness) * channels.daylight.rgb[i]);
    channels.background.hex = foundry.utils.rgbToHex(channels.background.rgb);
    channels.dark.rgb = channels.darkness.rgb.map(c => (1 + dark) * c);
    channels.dark.hex = foundry.utils.rgbToHex(channels.dark.rgb);
    channels.black.rgb = channels.dark.rgb.map(c => black * c);
    channels.black.hex = foundry.utils.rgbToHex(channels.black.rgb);
    channels.bright.rgb = [1, 1, 1].map(c => bright * (1 - darknessLightPenalty * darkness) * c);
    channels.bright.hex = foundry.utils.rgbToHex(channels.bright.rgb);
    channels.dim.rgb = channels.bright.rgb.map((c, i) => dim * c + (1 - dim) * channels.background.rgb[i]);
    channels.dim.hex = foundry.utils.rgbToHex(channels.dim.rgb);

    return channels;
}

Hooks.on("updateScene", (scene, change, options, userId) => {
    if (!scene.isView || !("flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change)) {
        return;
    }

    canvas.perception.schedule({
        lighting: { initialize: true, refresh: true },
        sight: { initialize: true, refresh: true },
        foreground: { refresh: true },
    });
});

Hooks.on("updateToken", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView || !("flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change)) {
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

Hooks.on("updateAmbientLight", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView || !("flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change)) {
        return;
    }

    const light = document.object;

    if (light) {
        light.updateSource({ defer: true });

        canvas.perception.schedule({
            lighting: { refresh: true },
            sight: { refresh: true, forceUpdateFog: true }
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
    const uniforms = this.uniforms;

    if (uniforms.pv_MaskSize !== Mask.size) {
        uniforms.pv_MaskSize = Mask.size;
    }

    if (!this._pv_init) {
        this._pv_init = true;

        uniforms.pv_Illumination = Mask.getTexture("illumination");
        uniforms.pv_Lighting = Mask.getTexture("lighting");
        uniforms.pv_Vision = Mask.getTexture("vision");

        const elevation = Mask.get("elevation");

        if (elevation) {
            uniforms.pv_Elevation = elevation.texture;
        }
    }

    Elevation.getElevationRange(this.source.object, uniforms.pv_ElevationRange);
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
        uniform sampler2D uVision;
        uniform bool uImprovedGMVision;

        void main()
        {
            vec3 mask = texture2D(uVision, vMaskCoord).rgb;
            vec3 background = texture2D(uIllumination, vMaskCoord).rgb;

            if (uImprovedGMVision) {
                background /= mix(max(max(background.r, background.g), background.b), 1.0, mask.r);
            }

            gl_FragColor = vec4(background, 1.0);
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
            uVision: Mask.getTexture("vision"),
            uImprovedGMVision: false
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
    }

    update() {
        const improvedGMVision = canvas.sight.sources.size === 0 && game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision");

        if (this.uniforms.uImprovedGMVision !== improvedGMVision) {
            this.uniforms.uImprovedGMVision = improvedGMVision;
        }
    }
}
