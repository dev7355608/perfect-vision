import { patch } from "../utils/patch.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";
import { MaskData } from "../utils/mask-filter.js";

Hooks.once("init", () => {
    patch("WeatherLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        CanvasFramebuffer.get("weatherMask").draw();

        await wrapped(...args);

        return this;
    });

    patch("WeatherLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        this.mask = null;

        CanvasFramebuffer.get("weatherMask").tearDown();

        return await wrapped(...args);
    });

    patch("WeatherLayer.prototype.drawWeather", "WRAPPER", function (wrapped, ...args) {
        const weather = wrapped(...args);

        this._pv_updateMask(!!weather);

        return weather;
    });
});

Hooks.once("canvasInit", () => {
    WeatherMaskFramebuffer.create({ name: "weatherMask", dependencies: ["lighting"] });
});

WeatherLayer.prototype._pv_updateMask = function (visible) {
    if (this.weatherOcclusionFilter && this.weather) {
        const index = this.weather.filters?.indexOf(this.weatherOcclusionFilter);

        if (index >= 0) {
            this.weather.filters.splice(index, 1);
        }
    }

    this.weatherOcclusionFilter = WeatherOcclusionMaskFilter.instance;

    if (this.weather) {
        if (this.weather.filters) {
            this.weather.filters.push(this.weatherOcclusionFilter);
        } else {
            this.weather.filters = [this.weatherOcclusionFilter];
        }

        this.weather.visible = visible;
        this.weather.filterArea = canvas.app.renderer.screen;
    }

    if (this.mask) {
        this.mask.destroy(true);
    }

    if (visible && canvas.scene.img) {
        this.mask = this.addChild(new PIXI.LegacyGraphics().beginFill().drawShape(canvas.dimensions.sceneRect).endFill());
    } else {
        this.mask = null;
    }

    if (this._pv_visible !== visible) {
        this._pv_visible = visible;

        CanvasFramebuffer.get("weatherMask").refresh();
    }
};

class WeatherOcclusionMaskFilter extends InverseOcclusionMaskFilter { // TODO
    static fragmentShader(channel) {
        return `\
            precision mediump float;

            varying vec2 vTextureCoord;
            varying vec2 vMaskTextureCoord;

            uniform sampler2D uSampler;
            uniform sampler2D uMaskSampler;

            void main() {
                vec4 mask = texture2D(uMaskSampler, vMaskTextureCoord);
                float r = mask.r;
                float g = mask.g;
                float b = mask.b;
                float a = mask.a;

                gl_FragColor = texture2D(uSampler, vTextureCoord) * (${channel});
            }`;
    };

    static create() {
        return super.create({ uMaskSampler: CanvasFramebuffer.get("weatherMask").textures[0] }, "r");
    }

    get enabled() {
        return !CanvasFramebuffer.get("weatherMask").disposed;
    }

    set enabled(value) { }

    static get instance() {
        if (!this._instance) {
            this._instance = this.create();
        }

        return this._instance;
    }
}

class WeatherMaskFramebuffer extends CanvasFramebuffer {
    constructor() {
        super([
            {
                format: PIXI.FORMATS.RED,
                type: PIXI.TYPES.UNSIGNED_BYTE,
                clearColor: [1, 0, 0, 0]
            }
        ]);
    }

    draw() {
        super.draw();

        this.roofs = this.stage.addChild(new PIXI.Container());
        this.roofs.sortableChildren = true;
        this.masks = this.stage.addChild(new PIXI.Container());

        if (canvas.performance.blur.enabled) {
            this.masks.filters = [canvas.createBlurFilter()];
            this.masks.filterArea = canvas.app.renderer.screen;
        }

        this.stage.visible = false;
    }

    refresh() {
        this.roofs.removeChildren();
        this.baseTextures.forEach(t => t.off("update", this._onBaseTextureUpdate, this));
        this.baseTextures.length = 0;

        this.stage.visible = false;

        if (canvas.weather._pv_visible || canvas.fxmaster?._pv_visible /* FXMaster */) {
            this.acquire();

            for (const roof of canvas.foreground.roofs) {
                const sprite = roof._pv_drawWeatherSprite();

                if (!sprite || sprite.alpha <= 0) {
                    continue;
                }

                sprite.texture.baseTexture.on("update", this._onBaseTextureUpdate, this);

                this.baseTextures.push(sprite.texture.baseTexture);
                this.roofs.addChild(sprite);
            }

            if (this.roofs.children.length !== 0) {
                this.roofs.visible = this.stage.visible = true;
            } else {
                this.roofs.visible = false;
            }

            if (this.masks.children.length !== 0) {
                this.masks.visible = this.stage.visible = true;
            } else {
                this.masks.visible = false;
            }
        } else {
            this.dispose();
        }

        this.invalidate();
    }

    tearDown() {
        this.roofs.removeChildren();

        super.tearDown();
    }
}
