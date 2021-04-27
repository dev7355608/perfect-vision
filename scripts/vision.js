import { extend } from "./extend.js";
import { Filter as MaskFilter } from "./mask.js";
import { patch } from "./patch.js";
import { presets } from "./presets.js";
import { grayscale } from "./utils.js";

const improvedGMVisionFilter = new MaskFilter("step(1.0, 1.0 - r)");
const visionFilter = new MaskFilter("step(1.0, g)");
const visionMaxFilter = new MaskFilter("step(1.0, g)");
const visionMinFilter = new MaskFilter("step(1.0, g)", "vec4(1.0)");
const lightFilter = new MaskFilter("step(1.0, b)");

function cloneShader(shader, uniforms = {}) {
    return shader ? new (shader instanceof AbstractBaseShader ? shader.constructor : PIXI.Shader)(
        shader.program, { ...shader.uniforms, ...uniforms }) : null;
}

function linkUniforms(shader1, shader2, except) {
    if (!shader1 && !shader2)
        return null;

    except = Array.isArray(except) ? new Set(except) : except;

    const uniforms = new Proxy(shader1.uniforms, {
        set(target, prop, value, receiver) {
            if (!except || !except.has(prop))
                shader2.uniforms[prop] = value;
            return Reflect.set(target, prop, value, receiver);
        }
    });

    return new Proxy(shader1, {
        get(target, prop, receiver) {
            if (prop === "uniforms")
                return uniforms;
            return Reflect.get(target, prop, receiver);
        }
    });
}

function computeFov(source, radius, fovCache = null) {
    if (fovCache && fovCache[radius])
        return fovCache[radius];

    const fovPoints = [];

    if (radius > 0) {
        const d = canvas.dimensions;
        const distance = fovCache?.distance ?? Math.max(
            source.radius,
            Math.hypot(
                Math.max(source.x, d.width - source.x),
                Math.max(source.y, d.height - source.y)
            )
        );

        if (fovCache)
            fovCache.distance = distance;

        const limit = Math.clamped(radius / distance, 0, 1);
        const points = source.los.points;

        for (let i = 0; i < points.length; i += 2) {
            const p = { x: points[i], y: points[i + 1] };
            const r = new Ray(source, p);
            const t0 = Math.clamped(r.distance / distance, 0, 1);
            const q = t0 <= limit ? p : r.project(limit / t0);
            fovPoints.push(q)
        }
    }

    let fov;

    if (isNewerVersion("0.8.0", game.data.version)) {
        fov = new PIXI.Polygon(...fovPoints);
    } else {
        fov = new SourcePolygon(source.x, source.y, radius, ...fovPoints);
    }

    if (fovCache)
        fovCache[radius] = fov;

    return fov;
}

var refreshHookID = null;

function refresh() {
    if (!canvas?.ready) {
        if (refreshHookID == null) {
            refreshHookID = Hooks.once("canvasReady", refresh);
        }

        return;
    }

    if (refreshHookID != null) {
        refreshHookID = null;
        Hooks.off("canvasReady", refresh);
    }

    for (const token of canvas.tokens.placeables) {
        token.updateSource({ defer: true });
    }

    canvas.lighting.refresh();
    canvas.sight.refresh();
}

Hooks.once("init", () => {
    game.settings.register("perfect-vision", "globalLight", {
        name: "Global Illumination Light",
        hint: "This setting affects only scenes with Global Illumination. If set to Dim (Bright) Light, the entire scene is illuminated with dim (bright) light and, if set to Scene Darkness, the scene is illuminated according to the scene's Darkness Level only. Each scene can also be configured individually. You can find this setting next to Global Illumination in the scene configuration.",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "dim": "Dim Light",
            "none": "Scene Darkness",
        },
        default: "dim",
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "improvedGMVision", {
        name: "Improved GM Vision",
        hint: "Improves the visibility in darkness for the GM massively while lit areas of the scene are still rendered normally.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (game.user.isGM && canvas?.ready)
                canvas.lighting.refresh();
        }
    });

    game.settings.register("perfect-vision", "visionRules", {
        name: "Vision Rules",
        hint: "Choose one of the presets, or select Custom and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the Vision tab. Dim (Bright) Vision in Darkness controls what dim (bright) vision looks like in darkness, i.e., in areas that are not illuminated by light sources. Dim (Bright) Vision in Dim Light controls how dim (bright) vision interacts with dim light, i.e., if dim light becomes bright light or not. Scene Darkness is the level of darkness in areas without light sources. It's the darkness controlled by Darkness Level in the scene configuration. Total Darkness means no vision at all. Select an option with monochrome to create vision without color in darkness. It's grayscale vision as long as the Monochrome Vision Color is white. If the scene's Darkness Level is 0, it looks the same as it would with non-monochrome vision. But as the Darkness Level increases the saturation decreases accordingly.",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "custom": "Custom",
            "fvtt": "Foundry VTT",
            "dnd35e": "Dungeons & Dragons 3.5e",
            "dnd5e": "Dungeons & Dragons 5e",
            "pf1e": "Pathfinder 1e",
            "pf2e": "Pathfinder 2e",
        },
        default: presets["default"]._id,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "dimVisionInDarkness", {
        name: "Dim Vision in Darkness",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "bright_mono": "Bright Light (monochrome)",
            "dim": "Dim Light",
            "dim_mono": "Dim Light (monochrome)",
            "scene": "Scene Darkness",
            "scene_mono": "Scene Darkness (monochrome)",
            "darkness": "Total Darkness",
        },
        default: presets["default"].dimVisionInDarkness,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "dimVisionInDimLight", {
        name: "Dim Vision in Dim Light",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "dim": "Dim Light",
        },
        default: presets["default"].dimVisionInDimLight,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "brightVisionInDarkness", {
        name: "Bright Vision in Darkness",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "bright_mono": "Bright Light (monochrome)",
            "dim": "Dim Light",
            "dim_mono": "Dim Light (monochrome)",
            "scene": "Scene Darkness",
            "scene_mono": "Scene Darkness (monochrome)",
            "darkness": "Total Darkness",
        },
        default: presets["default"].brightVisionInDarkness,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "brightVisionInDimLight", {
        name: "Bright Vision in Dim Light",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "dim": "Dim Light",
        },
        default: presets["default"].brightVisionInDimLight,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "monoVisionColor", {
        name: "Monochrome Vision Color",
        hint: "Set this color to anything other than white to make monochrome vision stand out visibly in darkness. For example, choose a green tone to make it look like night vision goggles. This setting affects only scenes without Global Illumination. You can also choose a color for each token individually in the token configuration under the Vision tab.",
        scope: "world",
        config: true,
        type: String,
        default: "#ffffff",
        onChange: () => refresh()
    });

    patch("PointSource.prototype._createContainer", "POST", function (c, shaderCls) {
        if (shaderCls === StandardIlluminationShader || shaderCls.prototype instanceof StandardIlluminationShader) {
            const c_ = extend(c);

            const lights = new PIXI.Container();
            const index = c.getChildIndex(c.light);

            c.removeChildAt(index);
            c.addChildAt(lights, index);

            c_.light = new PIXI.Mesh(c.light.geometry, cloneShader(c.light.shader, { ratio: 1 }), c.light.state);
            c_.light.transform = c.light.transform;

            c.light.shader = linkUniforms(c.light.shader, c_.light.shader, ["ratio"]);

            c.light = new Proxy(c.light, {
                set(target, prop, value, receiver) {
                    if (prop === "shader")
                        value = linkUniforms(
                            value,
                            c_.light.shader = cloneShader(value, { ratio: c_.light.shader.uniforms.ratio }),
                            ["ratio"]
                        );
                    else if (prop === "_width" || prop === "_height")
                        c_.light[prop] = value;
                    return Reflect.set(target, prop, value, receiver);
                }
            });

            lights.addChild(c.light, c_.light);
        }

        return c;
    });

    function getLightRadius(token, units) {
        if (units === 0) return 0;
        const u = Math.abs(units);
        const hw = (token.w / 2);
        return (((u / canvas.dimensions.distance) * canvas.dimensions.size) + hw) * Math.sign(units);
    }

    patch("PointSource.prototype.initialize", "WRAPPER", function (wrapped, opts) {
        const this_ = extend(this);

        if (!this_.isVision)
            return wrapped(opts);

        const token = this_.token;
        const scene = token.scene ?? token._original?.scene;
        const minR = Math.min(token.w, token.h) * 0.5;

        let dimVisionInDarkness;
        let dimVisionInDimLight;
        let brightVisionInDarkness;
        let brightVisionInDimLight;

        let visionRules = token.getFlag("perfect-vision", "visionRules") || "default";

        if (visionRules === "custom") {
            dimVisionInDarkness = token.getFlag("perfect-vision", "dimVisionInDarkness");
            dimVisionInDimLight = token.getFlag("perfect-vision", "dimVisionInDimLight");
            brightVisionInDarkness = token.getFlag("perfect-vision", "brightVisionInDarkness");
            brightVisionInDimLight = token.getFlag("perfect-vision", "brightVisionInDimLight");
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

        let dim = getLightRadius(token, token.data.dimSight);
        let bright = getLightRadius(token, token.data.brightSight);

        const sign = Math.min(dim, bright) < 0 ? -1 : +1;

        dim = Math.abs(dim);
        bright = Math.abs(bright);

        let sightLimit = parseFloat(token.getFlag("perfect-vision", "sightLimit"));

        if (Number.isNaN(sightLimit))
            sightLimit = parseFloat(scene?.getFlag("perfect-vision", "sightLimit"));

        if (!Number.isNaN(sightLimit)) {
            sightLimit = Math.max(getLightRadius(token, Math.abs(sightLimit)), minR);
            dim = Math.min(dim, sightLimit);
            bright = Math.min(bright, sightLimit);
        }

        opts.dim = sign * Math.max(
            dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
            brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0
        );
        opts.bright = sign * Math.max(
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
        const visionRadiusDimToBright = Math.max(
            dimVisionInDimLight === "bright" ? dim : 0,
            brightVisionInDimLight === "bright" ? bright : 0
        );
        const monoVisionColor = hexToRGB(colorStringToHex(
            token.getFlag("perfect-vision", "monoVisionColor") || game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff"
        ));

        this_.radius = Math.max(Math.abs(opts.dim), Math.abs(opts.bright));

        opts.dim = opts.dim === 0 && opts.bright === 0 ? minR : opts.dim;

        const retVal = wrapped(opts);

        this_.fov = this.fov;

        const fovCache = { [this.radius]: this.fov };

        this.fov = computeFov(this, Math.max(visionRadius, minR), fovCache);

        if (!token._original)
            this_.fovMono = this.fov;
        else
            delete this_.fovMono;

        if (visionRadiusColor > 0 && !token._original)
            this_.fovColor = computeFov(this, Math.max(visionRadiusColor, minR), fovCache);
        else
            delete this_.fovColor;

        if (visionRadiusDimToBright > 0 && !token._original)
            this_.fovDimToBright = computeFov(this, Math.max(visionRadiusDimToBright, minR), fovCache);
        else
            delete this_.fovDimToBright;

        if (monoVisionColor && this_.fovMono)
            this_.monoVisionColor = monoVisionColor;
        else
            delete this_.monoVisionColor

        if (!Number.isNaN(sightLimit))
            this.los = computeFov(this, sightLimit, fovCache);

        return retVal;
    });

    patch("PointSource.prototype._initializeBlending", "POST", function () {
        const this_ = extend(this);

        if (this_.isVision) {
            this.illumination.light.blendMode = PIXI.BLEND_MODES.NORMAL;
            this.illumination.zIndex *= -1;
        }

        return arguments[0];
    });

    patch("PointSource.prototype.drawLight", "WRAPPER", function (wrapped, opts) {
        const this_ = extend(this);

        const ilm = canvas.lighting.illumination;
        const ilm_ = extend(ilm);

        if (ilm_.updateChannels) {
            opts = opts ?? {};
            opts.updateChannels = true;
        }

        const updateChannels = this._resetIlluminationUniforms || opts?.updateChannels;

        const c = wrapped(opts);
        const c_ = extend(c);

        const sight = canvas.sight.tokenVision && canvas.sight.sources.size > 0;

        if (this_.isVision) {
            if (updateChannels) {
                const iu = this.illumination.shader.uniforms;
                grayscale(iu.colorDim, iu.colorDim);
                grayscale(iu.colorBright, iu.colorBright);
            }

            if (this_.fov && this_.fov !== this.fov) {
                if (!c_.fov) {
                    const index = c.getChildIndex(c.fov);
                    c.removeChildAt(index);
                    c_.fov = c.addChildAt(new PIXI.Graphics(), index);
                    c.mask = c_.fov;
                }

                c_.fov.clear();

                if (this_.radius > 0)
                    c_.fov.beginFill(0xFFFFFF, 1.0).drawPolygon(this_.fov).endFill();
            } else if (c_.fov) {
                const index = c.getChildIndex(c_.fov);
                c_.fov.destroy();
                delete c_.fov;
                c.addChildAt(c.fov, index);
                c.mask = c.fov;
            }

            c.light.visible = sight && this_.radius > 0;

            if (!c.light.filters)
                c.light.filters = [];

            c.light.filters[0] = (this.isDarkness ?? this.darkness) ? visionMinFilter : visionMaxFilter;

            c_.light.visible = false;
            c_.light.filters = null;
        } else {
            c.light.visible = true;
            c.light.filters = null;
            c_.light.visible = sight && this.ratio < 1 && !(this.isDarkness ?? this.darkness) && this !== ilm_.globalLight2;

            if (!c_.light.filters && this !== ilm_.globalLight2)
                c_.light.filters = [lightFilter];
            else if (this === ilm_.globalLight2)
                c_.light.filters = null;
        }

        return c;
    });

    patch("LightingLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        const ilm = this.illumination;
        const ilm_ = extend(ilm);

        const bgRect = canvas.dimensions.sceneRect.clone().pad((this._blurDistance ?? 0) * 2);
        ilm_.improvedGMVision.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();
        ilm_.vision.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();

        return retVal;
    });

    patch("LightingLayer.prototype._configureChannels", "WRAPPER", function (wrapped, ...args) {
        const ilm = this.illumination;
        const ilm_ = extend(ilm);

        const daylightColor = CONFIG.Canvas.daylightColor;
        const darknessColor = CONFIG.Canvas.darknessColor;

        CONFIG.Canvas.daylightColor = ilm_.daylightColor;
        CONFIG.Canvas.darknessColor = ilm_.darknessColor;

        const channels = wrapped(...args);

        CONFIG.Canvas.daylightColor = daylightColor;
        CONFIG.Canvas.darknessColor = darknessColor;

        return channels;
    });

    patch("LightingLayer.prototype._drawIlluminationContainer", "POST", function (c) {
        const c_ = extend(c);

        {
            c_.improvedGMVision = c.addChildAt(new PIXI.Graphics(), c.getChildIndex(c.background) + 1);
            c_.improvedGMVision.filter = improvedGMVisionFilter;
            c_.improvedGMVision.filterArea = canvas.app.renderer.screen;
            c_.improvedGMVision.filters = [c_.improvedGMVision.filter];
            c_.improvedGMVision.visible = game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision");
            c_.improvedGMVision.renderable = canvas.sight.sources.size === 0;
        }

        {
            c_.vision = c.addChildAt(new PIXI.Graphics(), c.getChildIndex(c_.improvedGMVision) + 1);
            c_.vision.filter = visionFilter;
            c_.vision.filterArea = canvas.app.renderer.screen;
            c_.vision.filters = [c_.vision.filter];
        }

        {
            const d = canvas.dimensions;
            const radius = 0.5 * Math.hypot(d.width, d.height) + (this._blurDistance ?? 0);
            const opts = {
                x: 0.5 * d.width,
                y: 0.5 * d.height,
                z: -1,
                dim: radius,
                bright: 0,
                type: CONST.SOURCE_TYPES.UNIVERSAL
            };

            c_.globalLight = new PointSource();
            c_.globalLight.initialize(opts);
            c_.globalLight.type = CONST.SOURCE_TYPES.LOCAL;
            Object.defineProperty(c_.globalLight, "dim", {
                get: () => {
                    let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                    if (globalLight === "default")
                        globalLight = game.settings.get("perfect-vision", "globalLight");

                    switch (globalLight) {
                        case "dim":
                            return radius;
                        case "bright":
                            return 0;
                        default:
                            return 0;
                    }
                }
            });
            Object.defineProperty(c_.globalLight, "bright", {
                get: () => {
                    let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                    if (globalLight === "default")
                        globalLight = game.settings.get("perfect-vision", "globalLight");

                    switch (globalLight) {
                        case "dim":
                            return 0;
                        case "bright":
                            return radius;
                        default:
                            return 0;
                    }
                }
            });
            Object.defineProperty(c_.globalLight, "ratio", {
                get: () => {
                    let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                    if (globalLight === "default")
                        globalLight = game.settings.get("perfect-vision", "globalLight");

                    switch (globalLight) {
                        case "dim":
                            return 0;
                        case "bright":
                            return 1;
                        default:
                            return 0;
                    }
                }
            });

            if (!isNewerVersion(game.data.version, "0.8")) {
                Object.defineProperty(c_.globalLight, "darknessThreshold", {
                    get: () => {
                        if (!this.globalLight)
                            return +Infinity;

                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = game.settings.get("perfect-vision", "globalLight");

                        switch (globalLight) {
                            case "dim":
                                return -Infinity;
                            case "bright":
                                return -Infinity;
                            default:
                                return +Infinity;
                        }
                    }
                });
            } else {
                Object.defineProperty(c_.globalLight, "darkness", {
                    get: () => {
                        if (!this.globalLight)
                            return { min: NaN, max: NaN };

                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = game.settings.get("perfect-vision", "globalLight");

                        switch (globalLight) {
                            case "dim":
                                return { min: -Infinity, max: +Infinity };
                            case "bright":
                                return { min: -Infinity, max: +Infinity };
                            default:
                                return { min: NaN, max: NaN };
                        }
                    }
                });
            }

            c_.globalLight2 = new PointSource();
            c_.globalLight2.initialize(opts);
            c_.globalLight2.type = CONST.SOURCE_TYPES.LOCAL;
            c_.globalLight2.dim = 0;
            c_.globalLight2.bright = 0;
            c_.globalLight2.ratio = 0;

            if (!isNewerVersion(game.data.version, "0.8")) {
                Object.defineProperty(c_.globalLight2, "darknessThreshold", { get: () => this.globalLight ? -Infinity : +Infinity });
            } else {
                Object.defineProperty(c_.globalLight2, "darkness", { get: () => this.globalLight ? { min: -Infinity, max: +Infinity } : { min: NaN, max: NaN } });
            }

            c_.globalLight2.illumination.zIndex = -1;
            c_.globalLight2.illumination.renderable = false;
        }

        return c;
    });

    patch("LightingLayer.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        const ilm = this.illumination;
        const ilm_ = extend(ilm);

        this.sources.set("PerfectVision.Light.1", ilm_.globalLight);
        this.sources.set("PerfectVision.Light.2", ilm_.globalLight2);
        ilm_.globalLight._resetIlluminationUniforms = true;

        let daylightColor = canvas.scene.getFlag("perfect-vision", "daylightColor");
        let darknessColor = canvas.scene.getFlag("perfect-vision", "darknessColor");

        if (daylightColor)
            daylightColor = colorStringToHex(daylightColor);
        else
            daylightColor = CONFIG.Canvas.daylightColor;

        if (darknessColor)
            darknessColor = colorStringToHex(darknessColor);
        else
            darknessColor = CONFIG.Canvas.darknessColor;

        const sanitize = hex => {
            const x = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff].map(x => Math.max(x, 0xf));
            return (x[0] << 16) + (x[1] << 8) + x[2];
        }

        daylightColor = sanitize(daylightColor);
        darknessColor = sanitize(darknessColor);

        if (daylightColor !== ilm_.daylightColor || darknessColor !== ilm_.darknessColor)
            ilm_.updateChannels = true;

        ilm_.daylightColor = daylightColor;
        ilm_.darknessColor = darknessColor;

        const retVal = wrapped(...args);

        delete ilm_.updateChannels;

        return retVal;
    });

    patch("Token.prototype.updateSource", "PRE", function () {
        const vision_ = extend(this.vision);
        vision_.isVision = true;
        vision_.token = this;
        return arguments;
    });
});

Hooks.on("canvasInit", () => {
    visionMaxFilter.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    visionMinFilter.blendMode = PIXI.BLEND_MODES.MIN_COLOR;
    lightFilter.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    const resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));

    improvedGMVisionFilter.resolution = resolution;
    visionFilter.resolution = resolution;
    visionMaxFilter.resolution = resolution;
    visionMinFilter.resolution = resolution;
    lightFilter.resolution = resolution;
});

Hooks.on("updateToken", (document, change, options, userId, arg) => {
    let scene;

    if (isNewerVersion(game.data.version, "0.8")) {
        scene = document.parent;
    } else {
        [scene, document, change, options, userId] = [document, change, options, userId, arg];
    }

    if (!scene?.isView || !hasProperty(change, "flags.perfect-vision"))
        return;

    const token = canvas.tokens.get(document._id);

    if (token) {
        token.updateSource({ defer: true });

        canvas.addPendingOperation("LightingLayer.refresh", canvas.lighting.refresh, canvas.lighting);
        canvas.addPendingOperation("SightLayer.refresh", canvas.sight.refresh, canvas.sight, [{
            forceUpdateFog: token.hasLimitedVisionAngle
        }]);
    }
});

Hooks.on("updateScene", (scene, change, options, userId) => {
    if (!scene.isView || !hasProperty(change, "flags.perfect-vision"))
        return;

    for (const token of canvas.tokens.placeables) {
        token.updateSource({ defer: true });
    }

    canvas.lighting.refresh();
    canvas.sight.refresh();
});

Hooks.on("lightingRefresh", () => {
    const channels = canvas.lighting.channels;

    const ilm = canvas.lighting.illumination;
    const ilm_ = extend(ilm);

    const s = 1 / Math.max(...channels.background.rgb);
    ilm_.improvedGMVision.tint = rgbToHex(channels.background.rgb.map(c => c * s));
    ilm_.improvedGMVision.visible = game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision");

    ilm_.vision.tint = rgbToHex(grayscale(channels.background.rgb));
});

Hooks.on("sightRefresh", () => {
    const ilm = canvas.lighting.illumination;
    const ilm_ = extend(ilm);

    ilm_.improvedGMVision.renderable = canvas.sight.sources.size === 0;
});
