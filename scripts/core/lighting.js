import { patch } from "../utils/patch.js";
import { hasChanged } from "../utils/helpers.js";
import { Sprite } from "../utils/sprite.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";
import { LimitSystem } from "./limit-system.js";
import { LightingSystem } from "./lighting-system.js";
import { PointSourceContainer, IlluminationPointSourceContainer } from "./point-source/container.js";
import createTess2, { Tess2 } from "../utils/tess2.js";

Hooks.once("init", () => {
    patch("LightingLayer.prototype._configureChannels", "OVERRIDE", function () {
        return this.channels;
    });

    patch("LightingLayer.prototype.draw", "OVERRIDE", async function () {
        if (!Tess2) {
            await createTess2();
        }

        CanvasFramebuffer.get("lighting").draw();

        this.globalLight = canvas.scene.data.globalLight;
        this.darknessLevel = canvas.scene.data.darkness;

        this._pv_updateLighting({ defer: true });

        await PlaceablesLayer.prototype.draw.call(this);

        this.lighting = this.addChildAt(new PIXI.Container(), 0);
        this.background = this.lighting.addChild(this._drawBackgroundContainer());
        this.illumination = this.lighting.addChild(this._drawIlluminationContainer());
        this.coloration = this.lighting.addChild(this._drawColorationContainer());
        this._pv_delimiter = canvas._pv_highlights_overhead.delimiter.addChild(new ObjectHUD(this)).addChild(this._pv_drawDelimiterContainer());

        const bgRect = canvas.dimensions.rect.clone().pad(canvas.dimensions.size);

        this.illumination.background.x = bgRect.x;
        this.illumination.background.y = bgRect.y;
        this.illumination.background.width = bgRect.width;
        this.illumination.background.height = bgRect.height;

        this.activateAnimation();

        return this;
    });

    patch("LightingLayer.prototype._drawColorationContainer", "OVERRIDE", function () {
        const c = new PointSourceContainer();

        c.filter = new PIXI.filters.AlphaFilter(1.0);
        c.filter.blendMode = PIXI.BLEND_MODES.ADD;
        c.filter.resolution = canvas.app.renderer.resolution;
        c.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        c.filters = [c.filter];
        c.filterArea = canvas.app.renderer.screen;
        c.sortableChildren = true;

        return c;
    });

    patch("LightingLayer.prototype._drawIlluminationContainer", "OVERRIDE", function () {
        const c = new IlluminationPointSourceContainer();

        c.background = c.addChild(new Sprite(IlluminationBackgroundShader.instance));
        c.primary = c.addChild(new PIXI.Container());
        c.lights = c.primary.addChild(new PIXI.Container());
        c.lights.sortableChildren = true;

        if (game.user.isGM) {
            c._pv_filter = new IlluminationContainerFilter();
            c._pv_filter.resolution = canvas.app.renderer.resolution;
            c._pv_filter.multisample = PIXI.MSAA_QUALITY.NONE;

            if (canvas.performance.blur.illumination) {
                c.filter = canvas.createBlurFilter();
                c.filters = [c._pv_filter, c.filter];
            } else {
                c.filter = c._pv_filter;
                c.filters = [c.filter];
            }
        } else {
            c.filter = canvas.performance.blur.illumination ? canvas.createBlurFilter() : new PIXI.filters.AlphaFilter();
            c.filters = [c.filter];
        }

        c.filter.blendMode = PIXI.BLEND_MODES.MULTIPLY;
        c.filter.resolution = canvas.app.renderer.resolution;
        c.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        c.filterArea = canvas.app.renderer.screen;

        return c;
    });

    patch("LightingLayer.prototype._drawBackgroundContainer", "OVERRIDE", function () {
        const c = new PointSourceContainer();

        c.filter = new PIXI.filters.AlphaFilter(1.0);
        c.filter.blendMode = PIXI.BLEND_MODES.NORMAL;
        c.filter.resolution = canvas.app.renderer.resolution;
        c.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        c.filters = [c.filter];
        c.filterArea = canvas.app.renderer.screen;
        c.sortableChildren = true;

        return c;
    });

    let forceUpdateLOS = false;

    patch("LightingLayer.prototype.initializeSources", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        forceUpdateLOS = true;
    });

    patch("LightingLayer.prototype.refresh", "OVERRIDE", function ({ darkness, backgroundColor } = {}) {
        LightingSystem.instance.updateRegion("Scene", {
            globalLight: canvas.scene.data.globalLight,
            globalLightThreshold: canvas.scene.data.globalLightThreshold,
            darkness: Math.clamped(darkness ?? this.darknessLevel, 0, 1)
        });

        let { refreshVision, darknessChanged } = LightingSystem.instance.refresh({
            backgroundColor: foundry.utils.colorStringToHex(backgroundColor),
            forceVision: !canvas.sight.tokenVision || canvas.sight.sources.size === 0 && game.user.isGM || undefined,
            forceUpdateLOS
        });

        forceUpdateLOS = false;

        const sceneRegion = LightingSystem.instance.getRegion("Scene");

        this.darknessLevel = sceneRegion.darknessLevel;
        this.channels = sceneRegion.channels;
        this.version = sceneRegion.version;

        if (canvas._pv_background) {
            canvas._pv_background.tint = this.channels.scene.hex;
        }

        canvas._pv_setBackgroundColor(this.channels.canvas.rgb);

        const bkg = this.background;
        const ilm = this.illumination;
        const col = this.coloration;
        const del = this._pv_delimiter;

        if (game.user.isGM) {
            const gmVision = game.settings.get("perfect-vision", "improvedGMVision") && canvas.sight.sources.size === 0;

            ilm._pv_filter.toggled = gmVision;
            ilm._pv_filter.enabled = ilm._pv_filter === ilm.filter || gmVision;
            ilm._pv_filter.brightness = Math.clamped(game.settings.get("perfect-vision", "improvedGMVisionBrightness") ?? 0.25, 0.05, 0.95);

            del.visible = game.settings.get("perfect-vision", "delimiters");
        }

        bkg.removeChildren();
        ilm.lights.removeChildren();
        col.removeChildren();
        del.removeChildren();

        this._animatedSources = [];

        for (const source of this.sources) {
            if (source.destroyed) {
                continue;
            }

            const region = LightingSystem.instance.getActiveRegionAtPoint(source) ?? sceneRegion;

            if (source._pv_region !== region) {
                source._pv_region = region;
                source._flags.lightingVersion = 0;
                source._resetUniforms.illumination = true;
            }

            const active = !source.skipRender /* Levels */ && region.darknessLevel.between(source.data.darkness.min, source.data.darkness.max);

            if (source.active !== active) {
                source.active = active;

                LimitSystem.instance.updateRegion(source.object?.sourceId, { active });
            }

            if (!active) {
                continue;
            }

            const meshes = source.drawMeshes();

            if (meshes.background) {
                bkg.addChild(meshes.background);
            }

            if (meshes.light) {
                ilm.lights.addChild(meshes.light);
            }

            if (meshes.color) {
                col.addChild(meshes.color);
            }

            if (meshes._pv_delimiter) {
                del.addChild(meshes._pv_delimiter);
            }

            if (source.data.animation?.type) {
                this._animatedSources.push(source);
            }
        }

        if (LimitSystem.instance.update()) {
            canvas.sight.initializeSources();

            refreshVision = true;
        }

        for (const source of canvas.sight.sources) {
            if (source.destroyed) {
                continue;
            }

            const region = LightingSystem.instance.getActiveRegionAtPoint(source) ?? sceneRegion;

            if (source._pv_region !== region) {
                source._pv_region = region;
                source._flags.lightingVersion = 0;
                source._resetUniforms.illumination = true;
            }

            if (source.radius <= 0) {
                continue;
            }

            const delimiter = source._pv_drawDelimiter();

            if (delimiter) {
                del.addChild(delimiter);
            }
        }

        for (const roof of canvas.foreground.roofs) {
            let regionId = roof.document.getFlag("perfect-vision", "lighting") || "";

            if (regionId) {
                regionId = `Drawing.${regionId}`;
            }

            roof._pv_region = LightingSystem.instance.getActiveRegion(regionId) ?? sceneRegion;
        }

        if (refreshVision) {
            canvas.perception.schedule({ sight: { refresh: true } });
        }

        if (darknessChanged) {
            this._onDarknessChange();
            canvas.sounds._onDarknessChange();
        }

        CanvasFramebuffer.get("lighting").refresh();

        Hooks.callAll("lightingRefresh", this);
    });

    patch("LightingLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        CanvasFramebuffer.get("lighting").tearDown();

        LightingSystem.instance.reset();

        return await wrapped(...args);
    });

    patch("AmbientLight.prototype.isVisible", "OVERRIDE", function () {
        return !this.data.hidden && (LightingSystem.instance.getActiveRegionAtPoint(this.source)?.darknessLevel ?? canvas.lighting.darknessLevel).between(this.config.darkness.min ?? 0, this.config.darkness.max ?? 1);
    });

    patch("AmbientSound.prototype.isAudible", "OVERRIDE", function () {
        if (this.levelsInaudible /* Levels */) {
            return false;
        }

        return !this.data.hidden && (LightingSystem.instance.getActiveRegionAtPoint(this.center)?.darknessLevel ?? canvas.lighting.darknessLevel).between(this.data.darkness.min ?? 0, this.data.darkness.max ?? 1);
    });
});

Hooks.once("canvasInit", () => {
    LightingFramebuffer.create({ name: "lighting" });
});

Hooks.on("updateScene", (document, change, options, userId) => {
    if (!document.isView || !canvas.ready || !("globalLight" in change || "globalLightThreshold" in change || "darkness" in change
        || "fogExploration" in change || hasChanged(change, "flags.perfect-vision"))) {
        return;
    }

    canvas.lighting._pv_updateLighting();
});

LightingLayer.prototype._pv_updateLighting = function ({ defer = false } = {}) {
    const revealed = !!canvas.scene.getFlag("perfect-vision", "revealed");

    let sightLimit = canvas.scene.getFlag("perfect-vision", "sightLimit");

    sightLimit = Number.isFinite(sightLimit)
        ? Math.max(sightLimit, 0) * (canvas.dimensions.size / canvas.dimensions.distance)
        : Infinity;

    const parseColor = (color, defaultColor) => foundry.utils.rgbToHex(
        foundry.utils.hexToRGB(
            typeof color === "string" && /^#[0-9A-F]{6,6}$/i.test(color)
                ? foundry.utils.colorStringToHex(color)
                : defaultColor
        ).map(x => Math.max(x, 0.05))
    );

    let daylightColor = canvas.scene.getFlag("perfect-vision", "daylightColor");

    daylightColor = parseColor(daylightColor, CONFIG.Canvas.daylightColor);

    let darknessColor = canvas.scene.getFlag("perfect-vision", "darknessColor");

    darknessColor = parseColor(darknessColor, CONFIG.Canvas.darknessColor);

    let saturation = canvas.scene.getFlag("perfect-vision", "saturation");
    const forceSaturation = canvas.scene.getFlag("perfect-vision", "forceSaturation");

    if (forceSaturation !== undefined && !forceSaturation) {
        saturation = null;
    }

    saturation = Number.isFinite(saturation) ? Math.clamped(saturation, 0, 1) : null;

    if (!LightingSystem.instance.hasRegion("Scene")) {
        LightingSystem.instance.addRegion("Scene", {
            shape: canvas.dimensions.rect.clone().pad(canvas.dimensions.size),
            z: -Infinity, inset: canvas.dimensions._pv_inset,
            globalLight: canvas.scene.data.globalLight,
            globalLightThreshold: canvas.scene.data.globalLightThreshold,
            darkness: canvas.scene.data.darkness,
            sightLimit, daylightColor, darknessColor, saturation,
            fogExploration: canvas.scene.data.fogExploration, revealed
        });
    } else {
        LightingSystem.instance.updateRegion("Scene", {
            globalLight: canvas.scene.data.globalLight,
            globalLightThreshold: canvas.scene.data.globalLightThreshold,
            darkness: canvas.scene.data.darkness,
            sightLimit, daylightColor, darknessColor, saturation,
            fogExploration: canvas.scene.data.fogExploration, revealed
        });
    }

    if (!defer) {
        canvas.perception.schedule({ lighting: { refresh: true } });
    }
};

LightingLayer.prototype._pv_drawDelimiterContainer = function () {
    const c = new PointSourceContainer();

    c.filterDelimiter = new PIXI.filters.AlphaFilter(0.5);
    c.filterDelimiter.blendMode = PIXI.BLEND_MODES.NORMAL;
    c.filterDelimiter.resolution = canvas.app.renderer.resolution;
    c.filterDelimiter.multisample = PIXI.MSAA_QUALITY.NONE;
    c.filters = [c.filterDelimiter];
    c.filterArea = canvas.app.renderer.screen;
    c.sortableChildren = true;
    c.visible = false;

    return c;
};

LightingLayer.prototype._pv_toggleGMVision = function (toggled) {
    game.settings.set("perfect-vision", "improvedGMVision", toggled ?? !game.settings.get("perfect-vision", "improvedGMVision"));
};

LightingLayer.prototype._pv_toggleDelimiters = function (toggled) {
    game.settings.set("perfect-vision", "delimiters", toggled ?? !game.settings.get("perfect-vision", "delimiters"));
};

class IlluminationContainerFilter extends PIXI.Filter {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;
        uniform vec2 screenDimensions;

        varying vec2 vTextureCoord;
        varying vec2 vScreenCoord;

        void main() {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);

            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);

            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
            vScreenCoord = position.xy / screenDimensions;
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;
        varying vec2 vScreenCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uDarknessLevel;
        uniform float uAlpha;
        uniform bool uToggled;
        uniform float uBrightness;

        void main() {
            float darkness = texture2D(uDarknessLevel, vScreenCoord).r;
            float brightness = uToggled ? uBrightness * darkness : 0.0;

            gl_FragColor = vec4(texture2D(uSampler, vTextureCoord).rgb * (1.0 - brightness) + brightness, 1.0) * uAlpha;
        }`;

    constructor(alpha = 1) {
        super(IlluminationContainerFilter.vertexSrc, IlluminationContainerFilter.fragmentSrc, {
            screenDimensions: new Float32Array(2),
            uAlpha: alpha,
            uToggled: false,
            uBrightness: 0.25
        });
    }

    get alpha() {
        return this.uniforms.uAlpha;
    }

    set alpha(value) {
        this.uniforms.uAlpha = value;
    }

    get toggled() {
        return this.uniforms.uToggled;
    }

    set toggled(value) {
        this.uniforms.uToggled = value;
    }

    get brightness() {
        return this.uniforms.uBrightness;
    }

    set brightness(value) {
        this.uniforms.uBrightness = value;
    }

    apply(filterManager, input, output, clearMode, currentState) {
        const { width, height } = canvas.app.renderer.screen;
        const screenDimensions = this.uniforms.screenDimensions;

        screenDimensions[0] = width;
        screenDimensions[1] = height;

        this.uniforms.uDarknessLevel = CanvasFramebuffer.get("lighting").textures[2];

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}

class IlluminationBackgroundShader extends PIXI.Shader {
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

        %PF2E_RULES_BASED_VISION%

        varying vec2 vScreenCoord;

        uniform sampler2D uSampler1;
        uniform sampler2D uSampler2;
        uniform sampler2D uSampler3;
        uniform sampler2D uSampler4;

        const vec3 lightLevels = %LIGHT_LEVELS%;

        vec3 colorVision(vec3 colorBackground, float darknessLevel, float vision) {
            float luminosity = 0.5;
            float darknessPenalty = darknessLevel * 0.25 * (1.0 - luminosity);
            float luminosityPenalty = clamp(luminosity * 2.0, 0.0, 1.0);
            float lightPenalty = (1.0 - darknessPenalty) * luminosityPenalty;
            vec3 colorBright = max(vec3(lightLevels.x * lightPenalty), colorBackground);
            vec3 colorDim = mix(colorBackground, colorBright, lightLevels.y);
            return mix(mix(colorBackground, colorDim, vision * 2.0),
                       mix(colorDim, colorBright, vision * 2.0 - 1.0),
                       step(0.5, vision));
        }

        void main() {
            float light = texture2D(uSampler1, vScreenCoord).b;
            float vision = texture2D(uSampler2, vScreenCoord).r;
            vec2 darknessRoofs = texture2D(uSampler3, vScreenCoord).rb;
            float darknessLevel = darknessRoofs.x;
            vec3 colorBackground = texture2D(uSampler4, vScreenCoord).rgb;
            float alpha = min(1.0 - light, darknessRoofs.y);

            #ifdef PF2E_RULES_BASED_VISION
            alpha = min(alpha, clamp((darknessLevel - 0.25) / 0.5, 0.0, 1.0));
            #endif

            gl_FragColor = vec4(
                mix(
                    colorBackground,
                    colorVision(colorBackground, darknessLevel, vision),
                    alpha
                ),
                1.0
            );
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(
                this.vertexSrc,
                this.fragmentSrc
                    .replace(
                        /%LIGHT_LEVELS%/gm,
                        `vec3(
                            ${CONFIG.Canvas.lightLevels.bright.toFixed(3)},
                            ${CONFIG.Canvas.lightLevels.dim.toFixed(3)},
                            ${CONFIG.Canvas.lightLevels.dark.toFixed(3)}
                        )`
                    )
                    .replace(
                        /%PF2E_RULES_BASED_VISION%/gm,
                        game.system.id === "pf2e" && game.settings.get("pf2e", "automation.rulesBasedVision")
                            ? "#define PF2E_RULES_BASED_VISION" : ""
                    )
            );
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
        super(IlluminationBackgroundShader.program, {
            screenDimensions: new Float32Array(2),
            uSampler1: PIXI.Texture.EMPTY,
            uSampler2: PIXI.Texture.EMPTY,
            uSampler3: PIXI.Texture.EMPTY,
            uSampler4: PIXI.Texture.EMPTY
        });
    }

    update() {
        const uniforms = this.uniforms;
        const screenDimensions = uniforms.screenDimensions;
        const { width, height } = canvas.app.renderer.screen;

        screenDimensions[0] = width;
        screenDimensions[1] = height;

        const textures = CanvasFramebuffer.get("lighting").textures;

        uniforms.uSampler1 = textures[0];
        uniforms.uSampler2 = textures[1];
        uniforms.uSampler3 = textures[2];
        uniforms.uSampler4 = textures[3];
    }
}

class DrawBuffersContainer extends PIXI.Container {
    constructor(...buffers) {
        super();

        this._drawBuffers = Array.from(buffers);
    }

    render(renderer) {
        if (this.children.length === 0) {
            return;
        }

        renderer.batch.flush();

        renderer.gl.drawBuffers(this._drawBuffers);

        super.render(renderer);

        renderer.batch.flush();
    }
}

class BindFramebufferContainer extends PIXI.Container {
    constructor(buffer, ...attachments) {
        super();

        this.buffer = buffer;
        this.attachments = Array.from(attachments);
    }

    render(renderer) {
        renderer.batch.flush();

        this.buffer.bind(renderer, this.attachments);

        super.render(renderer);

        renderer.batch.flush();
    }
}

class MinFOVShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;
        attribute vec3 aCenterRadius;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        varying vec3 vCoord;

        void main() {
            vec2 center = aCenterRadius.xy;
            float radius = aCenterRadius.z;
            vec2 local = aVertexPosition * radius;

            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(center + local, 1.0))).xy, 0.0, 1.0);

            vCoord = vec3(local, radius);
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        uniform float uSmoothness;

        varying vec3 vCoord;

        void main() {
            gl_FragColor = vec4(0.0, 1.0 - smoothstep(vCoord.z - uSmoothness, vCoord.z, length(vCoord.xy)), 0.0, 0.0);
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
        super(MinFOVShader.program, { uSmoothness: 0 });
    }

    update() {
        this.uniforms.uSmoothness = canvas.dimensions._pv_inset;
    }
}

class LightingFramebuffer extends CanvasFramebuffer {
    constructor() {
        super([
            {
                format: PIXI.FORMATS.RGB,
                type: PIXI.TYPES.UNSIGNED_BYTE
            },
            {
                format: PIXI.FORMATS.RGB,
                type: PIXI.TYPES.UNSIGNED_BYTE
            },
            {
                format: PIXI.FORMATS.RGB,
                type: PIXI.TYPES.UNSIGNED_BYTE,
                clearColor: [0, 0, 1, 0]
            },
            {
                format: PIXI.FORMATS.RGB,
                type: PIXI.TYPES.UNSIGNED_BYTE
            },
            {
                format: PIXI.FORMATS.RGB,
                type: PIXI.TYPES.UNSIGNED_BYTE
            }
        ]);
    }

    update() {
        this.render(canvas.app.renderer, this.stage, true, null, false, []);
    }

    draw() {
        super.draw();

        this.regions = this.stage.addChild(new BindFramebufferContainer(this, 0, 2, 3, 4));

        const sources = this.stage.addChild(new BindFramebufferContainer(this, 0, 1));

        this.visions = sources.addChild(new PointSourceContainer());

        const lights = sources.addChild(new DrawBuffersContainer(
            WebGL2RenderingContext.COLOR_ATTACHMENT0,
            WebGL2RenderingContext.NONE
        ));

        const geometry = new PIXI.Geometry()
            .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]), true, false), 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aCenterRadius", new PIXI.Buffer(new Float32Array([]), false, false), 3, false, PIXI.TYPES.FLOAT, undefined, undefined, true);
        const shader = MinFOVShader.instance;

        this.minFOV = lights.addChild(new PIXI.Mesh(geometry, shader, undefined, PIXI.DRAW_MODES.TRIANGLE_FAN));
        this.minFOV.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
        this.minFOV.visible = false;
        this.minFOV.geometry.instanceCount = 0;
        this.lights = lights.addChild(new PointSourceContainer());
        this.roofs = this.stage.addChild(new BindFramebufferContainer(this, 2, 3, 4));
        this.roofs.sortableChildren = true;
    }

    refresh() {
        this.baseTextures.forEach(t => t.off("update", this._onBaseTextureUpdate, this));
        this.baseTextures.length = 0;

        const { regions, visions, lights, roofs } = this;

        regions.removeChildren();
        visions.removeChildren();
        lights.removeChildren();
        roofs.removeChildren();

        const textures = this.textures;

        for (const region of LightingSystem.instance.activeRegions) {
            if (region.id === "Scene") {
                textures[0].baseTexture.clearColor[0] = region.vision ? 1 : 0;
                textures[0].baseTexture.clearColor[1] = region.vision || region.globalLight ? 1 : 0;
                textures[2].baseTexture.clearColor[0] = region.darknessLevel;
                textures[2].baseTexture.clearColor[1] = region.saturationLevel;
                textures[3].baseTexture.clearColor.set(region.channels.background.rgb);
                textures[4].baseTexture.clearColor.set(region.channels.darkness.rgb);
            } else {
                const mesh = region.drawMesh();

                if (mesh) {
                    regions.addChild(mesh);
                }
            }
        }

        {
            const minFOV = [];

            for (const source of canvas.sight.sources) {
                if (source.destroyed) {
                    continue;
                }

                const mesh = source._pv_drawMesh();

                if (mesh) {
                    visions.addChild(mesh);
                    minFOV.push(source.x, source.y, source._pv_minRadius);
                }
            }

            const minFOVMesh = this.minFOV;
            const minFOVGeometry = minFOVMesh.geometry;

            minFOVGeometry.buffers[1].update(minFOV);
            minFOVGeometry.instanceCount = minFOV.length / 3;
            minFOVMesh.visible = minFOVGeometry.instanceCount > 0;
        }

        for (const source of canvas.lighting.sources) {
            if (!source.active || source.destroyed) {
                continue;
            }

            const mesh = source._pv_drawMesh();

            if (!mesh) {
                continue;
            }

            lights.addChild(mesh);

            if (mesh.occlusionObjects) {
                for (const occlusionTile of mesh.occlusionObjects) {
                    if (occlusionTile.destroyed || !occlusionTile.visible || !occlusionTile.renderable || occlusionTile.worldAlpha <= 0) {
                        continue;
                    }

                    if (!occlusionTile.geometry.bounds.intersects(source._pv_geometry.bounds)) {
                        continue;
                    }

                    occlusionTile.texture.baseTexture.on("update", this._onBaseTextureUpdate, this);

                    this.baseTextures.push(occlusionTile.texture.baseTexture);
                }
            }
        }

        for (const roof of canvas.foreground.roofs) {
            const sprite = roof._pv_drawLightingSprite();

            if (!sprite) {
                continue;
            }

            sprite.texture.baseTexture.on("update", this._onBaseTextureUpdate, this);

            this.baseTextures.push(sprite.texture.baseTexture);

            roofs.addChild(sprite);
        }

        regions.visible = regions.children.length !== 0
            && !(LightingSystem.instance.vision !== undefined
                && LightingSystem.instance.globalLight !== undefined
                && LightingSystem.instance.darknessLevel !== undefined
                && LightingSystem.instance.saturationLevel !== undefined
                && LightingSystem.instance.daylightColor !== undefined
                && LightingSystem.instance.darknessColor !== undefined);
        roofs.visible = roofs.children.length !== 0;

        this.acquire();
        this.invalidate();
    }

    tearDown() {
        this.regions.removeChildren();
        this.visions.removeChildren();
        this.lights.removeChildren();
        this.roofs.removeChildren();

        super.tearDown();
    }
}
