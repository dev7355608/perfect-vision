import { patch } from "../utils/patch.js";
import { SpriteMesh } from "../utils/sprite-mesh.js";
import { RenderTargetMixin } from "../utils/render-target.js";
import { MonoFilter } from "./mono.js";
import { Logger } from "../utils/logger.js";

class OverlaysCanvasGroup extends PIXI.Container {
    constructor() {
        super();

        this._createLayers();

        this.sortableChildren = true;
    }

    static groupName = "_pv_overlays";

    _createLayers() {
        this._pv_background = this.addChild(new BackgroundContainer());
        this._pv_background.zIndex = TokenLayer.layerOptions.zIndex - 1;

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
        this.bases = this.addChild(new PIXI.Container());
        this.markers = this.addChild(new PIXI.Container());
        this.markers.start = this.markers.addChild(new PIXI.Container());
        this.markers.turn = this.markers.addChild(new PIXI.Container());
        this.markers.next = this.markers.addChild(new PIXI.Container());
        this.borders = this.addChild(new PIXI.Container());
    }

    async draw() {
        return this;
    }

    async tearDown() {
        this.auras.removeChildren();
        this.bases.removeChildren();
        this.markers.start.removeChildren();
        this.markers.turn.removeChildren();
        this.markers.next.removeChildren();
        this.borders.removeChildren();
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
        this.markers.start = this.markers.addChild(new PIXI.Container());
        this.markers.turn = this.markers.addChild(new PIXI.Container());
        this.markers.next = this.markers.addChild(new PIXI.Container());
        this.delimiter = this.addChild(new PIXI.Container());
        this.borders = this.addChild(new PIXI.Container());
    }

    async draw() {
        return this;
    }

    async tearDown() {
        this.markers.start.removeChildren();
        this.markers.turn.removeChildren();
        this.markers.next.removeChildren();
        this.borders.removeChildren();
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
            this.filter.uniforms.uMaskFrame = foregroundTexture.filterFrame;
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
        super(BackgroundFilter.vertexSrc, BackgroundFilter.fragmentSrc);
    }
}

let currentRenderer = null;
let filterTextures = [];
let framePool = [];

function getFilterTexture(renderer) {
    const rt = renderer.renderTexture;
    const current = rt.current;
    const { width, height } = rt.destinationFrame;
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

            if (layer.options.zIndex >= this._pv_foreground.zIndex) {
                this._pv_foreground.addChild(layer);
            } else {
                this.addChild(layer);
            }
        }
    });

    patch("Canvas.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        await wrapped(...args);

        if (this.scene === null) {
            return this;
        }

        this._pv_background = this.stage._pv_scene_without_overlays.addChildAt(new SpriteMesh(new BackgroundColorShader()), 0);

        const bgRect = this.dimensions.rect;

        this._pv_background.x = bgRect.x;
        this._pv_background.y = bgRect.y;
        this._pv_background.width = bgRect.width;
        this._pv_background.height = bgRect.height;

        this._pv_overlays.mask = this.msk;

        return this;
    });

    patch("Canvas.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        if (this._pv_background) {
            this._pv_background.destroy();
            this._pv_background = null;
        }

        return await wrapped(...args);
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
});

Hooks.on("canvasInit", () => {
    canvas._pv_nextTileVideoWarning = 0;
});

Canvas.prototype._pv_showTileVideoWarning = function () {
    if (game.user.isGM && game.time.serverTime >= this._pv_nextTileVideoWarning) {
        ui.notifications.warn("[Perfect Vision] Roof/Levels tiles with video texture may impact performance significantly!");
        Logger.warn("Roof/Levels tiles with video texture may impact performance significantly!");

        if (this._pv_nextTileVideoWarning === 0) {
            this._pv_nextTileVideoWarning = game.time.serverTime + 300000;
        } else {
            this._pv_nextTileVideoWarning = undefined;
        }
    }
}

class BackgroundColorShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;

        void main() {
            gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        uniform vec3 uColor;

        void main() {
            gl_FragColor = vec4(uColor, 1.0);
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    static get instance() {
        if (!this._instance) {
            this._instance = new BackgroundColorShader();
        }

        return this._instance;
    }

    constructor() {
        super(BackgroundColorShader.program, { uColor: new Float32Array(3) });
    }

    update() {
        const channels = canvas.lighting.channels;

        if (channels) {
            this.uniforms.uColor.set(channels.canvas.rgb);
        }
    }
}
