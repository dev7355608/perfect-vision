import { patch } from "../utils/patch.js";
import { rgb2gray, rgb2srgb, srgb2rgb } from "../utils/color.js";
import { RenderTargetMixin } from "../utils/render-target.js";
import { MonoFilter } from "./mono.js";
import { Logger } from "../utils/logger.js";
import { Region } from "../utils/region.js";
import { LightingSystem } from "./lighting-system.js";

class OverlaysCanvasGroup extends PIXI.Container {
    constructor() {
        super();

        this._createLayers();

        this.sortableChildren = true;
    }

    static groupName = "_pv_overlays";

    _createLayers() {
        this._pv_background = this.addChild(new BackgroundContainer());
        this._pv_background.zIndex = TokenLayer.layerOptions.zIndex;

        for (let [name, config] of Object.entries(CONFIG.Canvas.layers)) {
            if (config.group !== this.constructor.groupName) {
                continue;
            }

            const layer = new config.layerClass();

            Object.defineProperty(this, name, { value: layer, writable: false });

            if (layer.options.zIndex <= this._pv_background.zIndex) {
                this._pv_background.addChild(layer);
            } else {
                this.addChild(layer);
            }
        }
    }
}

class UnderfootHighlightsLayer extends CanvasLayer {
    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            name: "_pv_highlights_underfoot",
            zIndex: TokenLayer.layerOptions.zIndex - 1
        });
    }

    constructor() {
        super();

        this.auras = this.addChild(new PIXI.Container());
        this.auras.interactive = false;
        this.auras.interactiveChildren = false;
        this.bases = this.addChild(new PIXI.Container());
        this.bases.interactive = false;
        this.bases.interactiveChildren = false;
        this.markers = this.addChild(new PIXI.Container());
        this.markers.interactive = false;
        this.markers.interactiveChildren = false;
        this.markers.start = this.markers.addChild(new PIXI.Container());
        this.markers.turn = this.markers.addChild(new PIXI.Container());
        this.markers.next = this.markers.addChild(new PIXI.Container());
        this.borders = this.addChild(new PIXI.Container());
        this.borders.interactive = false;
        this.borders.interactiveChildren = false;
        this.frames = this.addChild(new PIXI.Container());
        this.frames.interactive = false;
    }

    async draw() {
        this.interactiveChildren = true;

        return this;
    }

    async tearDown() {
        this.auras.removeChildren();
        this.bases.removeChildren();
        this.markers.start.removeChildren();
        this.markers.turn.removeChildren();
        this.markers.next.removeChildren();
        this.borders.removeChildren();
        this.frames.removeChildren();
    }

    deactivate() {
        super.deactivate();

        this.interactiveChildren = true;

        return this;
    }
}

class OverheadHighlightsLayer extends CanvasLayer {
    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            name: "_pv_highlights_overhead",
            zIndex: TokenLayer.layerOptions.zIndex + 1
        });
    }

    constructor() {
        super();

        this.markers = this.addChild(new PIXI.Container());
        this.markers.interactive = false;
        this.markers.interactiveChildren = false;
        this.markers.start = this.markers.addChild(new PIXI.Container());
        this.markers.turn = this.markers.addChild(new PIXI.Container());
        this.markers.next = this.markers.addChild(new PIXI.Container());
        this.delimiter = this.addChild(new PIXI.Container());
        this.delimiter.interactive = false;
        this.delimiter.interactiveChildren = false;
        this.borders = this.addChild(new PIXI.Container());
        this.borders.interactive = false;
        this.borders.interactiveChildren = false;
        this.frames = this.addChild(new PIXI.Container());
        this.frames.interactive = false;
    }

    async draw() {
        this.interactiveChildren = true;

        return this;
    }

    async tearDown() {
        this.markers.start.removeChildren();
        this.markers.turn.removeChildren();
        this.markers.next.removeChildren();
        this.borders.removeChildren();
        this.frames.removeChildren();
    }

    deactivate() {
        super.deactivate();

        this.interactiveChildren = true;

        return this;
    }
}

let foregroundTexture = null;

class ForegroundContainer extends RenderTargetMixin(PIXI.Container) {
    constructor() {
        super();

        this.sortableChildren = true;
        this.renderTarget = new PIXI.Sprite();
    }

    render(renderer) {
        this.renderTarget.texture = foregroundTexture = getFilterTexture(renderer);

        super.render(renderer);

        this.renderTarget.texture = null;
    }
}

class BackgroundContainer extends PIXI.Container {
    constructor() {
        super();

        this.sortableChildren = true;
        this.filter = new BackgroundFilter();
    }

    render(renderer) {
        let cachedFilterArea;

        if (foregroundTexture) {
            cachedFilterArea = this.filterArea;

            this.filter.resolution = foregroundTexture.resolution;
            this.filter.multisample = foregroundTexture.multisample;
            this.filter.uniforms.uMask = foregroundTexture;
            this.filter.uniforms.uMaskFrame.x = foregroundTexture.filterFrame.x;
            this.filter.uniforms.uMaskFrame.y = foregroundTexture.filterFrame.y;
            this.filter.uniforms.uMaskFrame.width = foregroundTexture.width;
            this.filter.uniforms.uMaskFrame.height = foregroundTexture.height;
            this.filterArea = foregroundTexture.filterFrame;
            this.filters = this.filters ?? [];
            this.filters.push(this.filter);
        }

        super.render(renderer);

        if (foregroundTexture) {
            returnFilterTexture(foregroundTexture);

            foregroundTexture = null;

            this.filter.uniforms.uMask = null;
            this.filterArea = cachedFilterArea;
            this.filters.pop();
        }
    }
}

class BackgroundFilter extends PIXI.Filter {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;
        uniform vec4 uMaskFrame;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        void main() {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);

            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);

            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
            vMaskCoord = (position.xy - uMaskFrame.xy) / uMaskFrame.zw;
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;

        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);

            gl_FragColor = color * (1.0 - mask.a);
        }`;

    constructor() {
        super(BackgroundFilter.vertexSrc, BackgroundFilter.fragmentSrc, { uMaskFrame: new PIXI.Rectangle() });
    }
}

let currentRenderer = null;
let filterTextures = [];
let framePool = [];

function getFilterTexture(renderer) {
    const rt = renderer.renderTexture;
    const current = rt.current;
    const { width, height } = rt.sourceFrame;
    const resolution = current ? current.resolution : renderer.resolution;
    const multisample = current ? current.multisample : renderer.multisample;
    const filterTexture = renderer.filter.getOptimalFilterTexture(width, height, resolution, multisample);

    filterTexture.filterFrame = (framePool.pop() ?? new PIXI.Rectangle()).copyFrom(rt.sourceFrame);
    filterTextures.push(filterTexture);

    if (!currentRenderer) {
        currentRenderer = renderer;
        currentRenderer.on("postrender", returnFilterTextures);
    }

    return filterTexture;
}

function returnFilterTexture(filterTexture) {
    const index = filterTextures.indexOf(filterTexture);

    if (index >= 0) {
        filterTextures.splice(index, 1);

        framePool.push(filterTexture.filterFrame);

        currentRenderer.filter.returnFilterTexture(filterTexture);
    }
}

function returnFilterTextures() {
    for (const filterTexture of filterTextures) {
        framePool.push(filterTexture.filterFrame);

        currentRenderer.filter.returnFilterTexture(filterTexture);
    }

    filterTextures.length = 0;

    currentRenderer.off("postrender", returnFilterTextures);
    currentRenderer = null;

    foregroundTexture = null;
}

const groups = { ...CONFIG.Canvas.groups };

for (const name in CONFIG.Canvas.groups) {
    delete CONFIG.Canvas.groups[name];
}

for (const name in groups) {
    CONFIG.Canvas.groups[name] = groups[name];

    if (name === "effects") {
        CONFIG.Canvas.groups._pv_overlays = {
            groupClass: OverlaysCanvasGroup
        };
    }
}

Logger.debug("Patching CONFIG.Canvas.cullingBackend (OVERRIDE)");

CONFIG.Canvas.cullingBackend = null;

Logger.debug("Patching CONFIG.Canvas.layers.weather.group (OVERRIDE)");
Logger.debug("Patching CONFIG.Canvas.layers.grid.group (OVERRIDE)");
Logger.debug("Patching CONFIG.Canvas.layers.drawings.group (OVERRIDE)");
Logger.debug("Patching CONFIG.Canvas.layers.sight.group (OVERRIDE)");

CONFIG.Canvas.layers.weather.group = "primary";
CONFIG.Canvas.layers.grid.group = "_pv_overlays";
CONFIG.Canvas.layers.drawings.group = "_pv_overlays";
CONFIG.Canvas.layers.sight.group = "_pv_overlays";
CONFIG.Canvas.layers._pv_highlights_underfoot = {
    layerClass: UnderfootHighlightsLayer,
    group: "_pv_overlays"
};
CONFIG.Canvas.layers._pv_highlights_overhead = {
    layerClass: OverheadHighlightsLayer,
    group: "_pv_overlays"
};

Hooks.once("init", () => {
    patch("Canvas.getDimensions", "WRAPPER", function (wrapped, ...args) {
        const d = wrapped(...args);

        d._pv_sceneRect = Region.from(d.sceneRect);
        d._pv_inset = d.size / 10;

        return d;
    });

    patch("Canvas.prototype._createGroups", "OVERRIDE", function () {
        this.stage._pv_scene_with_overlays = this.stage.addChild(new PIXI.Container());
        this.stage._pv_scene_with_overlays.filters = [];
        this.stage._pv_scene_with_overlays.filterArea = canvas.app.renderer.screen;
        this.stage._pv_scene_without_overlays = this.stage._pv_scene_with_overlays.addChild(new PIXI.Container());
        this.stage._pv_scene_without_overlays.filters = [MonoFilter.instance];
        this.stage._pv_scene_without_overlays.filterArea = canvas.app.renderer.screen;

        for (let [name, config] of Object.entries(CONFIG.Canvas.groups)) {
            const group = new config.groupClass();

            Object.defineProperty(this, name, { value: group, writable: false });

            if (name === "primary" || name === "effects") {
                this.stage._pv_scene_without_overlays.addChild(group);
            } else if (name === "_pv_overlays") {
                this.stage._pv_scene_with_overlays.addChild(group);
            } else {
                this.stage.addChild(group);
            }
        }

        for (let [name, config] of Object.entries(CONFIG.Canvas.layers)) {
            const group = this[config.group];

            Object.defineProperty(this, name, { value: group[name], writable: false });
        }
    });

    patch("PrimaryCanvasGroup.prototype._createLayers", "OVERRIDE", function () {
        this._pv_foreground = this.addChild(new ForegroundContainer());
        this._pv_foreground.zIndex = TokenLayer.layerOptions.zIndex;

        for (let [name, config] of Object.entries(CONFIG.Canvas.layers)) {
            if (config.group !== this.constructor.groupName) {
                continue;
            }

            const layer = new config.layerClass();

            Object.defineProperty(this, name, { value: layer, writable: false });

            if (layer.options.zIndex >= this._pv_foreground.zIndex || name === "foreground") {
                this._pv_foreground.addChild(layer);
            } else {
                this.addChild(layer);
            }
        }
    });

    patch("Canvas.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        if (!this._pv_background || this._pv_background.destroyed) {
            this._pv_background = new PIXI.LegacyGraphics();
            this._pv_background.tint = 0x000000;
            this._pv_background.zIndex = -Infinity;
        }

        if (this._pv_background.parent) {
            this._pv_background.parent.removeChild(this._pv_background);
        }

        this._pv_background.clear();

        await wrapped(...args);

        if (this.scene === null) {
            return this;
        }

        this.outline.zIndex = -Infinity;
        this._pv_overlays._pv_background.addChildAt(this.outline, 0);

        this._pv_background.beginFill(0xFFFFFF).drawShape(this.dimensions.rect).endFill();
        this.primary.addChildAt(this._pv_background, 0);

        this._pv_overlays.mask = this.msk;

        return this;
    });

    patch("Canvas.prototype._configurePerformanceMode", "POST", function (settings) {
        if (canvas.performance && (
            (canvas.performance.blur.enabled || canvas.performance.blur.illumination) !== (settings.blur.enabled || settings.blur.illumination) &&
            !(settings.blur.enabled || settings.blur.illumination) ||
            canvas.performance.msaa !== settings.msaa)) {
            canvas.app.renderer.filter.texturePool.clear();
        }

        return settings;
    });

    patch("Canvas.prototype.setBackgroundColor", "POST", function (result, color) {
        this._pv_setBackgroundColor(color);
    });
});

Canvas.prototype._pv_setBackgroundColor = function (color) {
    if (typeof color === "string") {
        color = foundry.utils.colorStringToHex(color);
    }

    if (typeof color === "number") {
        color = foundry.utils.hexToRGB(color);
    }

    if (!(game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision") && this.sight.sources.size === 0) && LightingSystem.instance.hasRegion("Scene")) {
        const a = srgb2rgb(color);
        const b = rgb2gray(a);
        const s = LightingSystem.instance.getRegion("Scene").saturationLevel;

        color = rgb2srgb([
            a[0] * s + b[0] * (1 - s),
            a[1] * s + b[1] * (1 - s),
            a[2] * s + b[2] * (1 - s)
        ]);
    }

    this.app.renderer.backgroundColor = foundry.utils.rgbToHex(color);
};
