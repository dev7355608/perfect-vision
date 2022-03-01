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
    if (this.weather) {
        if (this.weatherOcclusionFilter) {
            const index = this.weather.filters?.indexOf(this.weatherOcclusionFilter);

            if (index >= 0) {
                this.weather.filters.splice(index, 1);
            }
        }

        if (visible) {
            this.weather.mask = new WeatherMaskData();
        } else {
            this.weather.mask = null;
        }

        this.weather.visible = visible;
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

class WeatherMaskData extends MaskData {
    constructor() {
        super(CanvasFramebuffer.get("weatherMask").sprites[0]);
    }

    get enabled() {
        return !CanvasFramebuffer.get("weatherMask").disposed;
    }

    set enabled(value) { }
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
