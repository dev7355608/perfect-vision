import { patch } from "../utils/patch.js";
import { Framebuffer } from "../utils/framebuffer.js";
import { MaskData } from "../utils/mask-filter.js";

Hooks.once("init", () => {
    patch("WeatherLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        let stage = this._pv_stage;

        if (stage) {
            stage.transform.reference = canvas.stage.transform;

            for (const child of stage.children) {
                child._parentID = -1;
            }
        } else {
            stage = this._pv_stage = new PIXI.Container();
            stage.transform = new SynchronizedTransform(canvas.stage.transform);
            stage.roofs = stage.addChild(new PIXI.Container());
            stage.masks = stage.addChild(new PIXI.Container());
            stage.baseTextures = [];

            if (canvas.performance.blur.enabled) {
                stage.masks.filters = [canvas.createBlurFilter()];
                stage.masks.filterArea = canvas.app.renderer.screen;
            }
        }

        let buffer = this._pv_buffer;

        if (!buffer) {
            buffer = this._pv_buffer = Framebuffer.create(
                "weather",
                [
                    {
                        format: PIXI.FORMATS.RED,
                        type: PIXI.TYPES.UNSIGNED_BYTE,
                        clearColor: [1, 0, 0, 0]
                    }
                ]
            );

            buffer.on("update", buffer => {
                buffer.render(canvas.app.renderer, this._pv_stage);
            });
        }

        await wrapped(...args);

        return this;
    });

    patch("WeatherLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        const stage = this._pv_stage;

        stage.transform.reference = PIXI.Transform.IDENTITY;

        for (const child of stage.children) {
            child._parentID = -1;
        }

        this._pv_weather = false;
        this._pv_buffer.dispose();

        return await wrapped(...args);
    });

    patch("WeatherLayer.prototype.drawWeather", "WRAPPER", function (wrapped, ...args) {
        const weather = wrapped(...args);

        this._pv_updateMask(!!weather);

        return weather;
    });
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
            this.weather.mask = new WeatherMaskData(canvas.weather._pv_buffer.sprites[0]);
        } else {
            this.weather.mask = null;
        }

        this.weather.visible = visible;

        if (this._pv_visible !== visible) {
            this._pv_visible = visible;

            canvas.weather._pv_refreshBuffer();
        }
    }
};

function invalidateBuffer(baseTexture) {
    if (baseTexture.resource?.source?.tagName === "VIDEO") {
        canvas._pv_showTileVideoWarning();
    }

    this.invalidate(true);
}

WeatherLayer.prototype._pv_refreshBuffer = function () {
    const buffer = this._pv_buffer;
    const { roofs, masks, baseTextures } = this._pv_stage;

    roofs.removeChildren().forEach(sprite => sprite.destroy());

    for (const baseTexture of baseTextures) {
        baseTexture.off("update", invalidateBuffer, buffer);
    }

    baseTextures.length = 0;

    this._pv_mask = false;

    if (this._pv_visible || canvas.fxmaster?._pv_visible /* FXMaster */) {
        if (canvas.foreground.roofs.length !== 0) {
            const displayRoofs = canvas.foreground.displayRoofs;

            for (const roof of canvas.foreground.roofs) {
                if (!roof.occluded && displayRoofs || roof.tile.alpha >= 1) {
                    continue;
                }

                const sprite = roof._pv_createSprite();

                if (!sprite) {
                    continue;
                }

                this._pv_mask = true;

                sprite.tint = 0x000000;
                sprite.alpha = 1 - sprite.alpha;

                sprite.texture.baseTexture.on("update", invalidateBuffer, buffer);

                baseTextures.push(sprite.texture.baseTexture);

                roofs.addChild(sprite);
            }

            roofs.visible = this._pv_mask;
        } else {
            roofs.visible = false;
        }

        if (masks.children.length !== 0) {
            this._pv_mask = true;
            masks.visible = true;
        } else {
            masks.visible = false;
        }
    }

    if (this._pv_mask) {
        buffer.invalidate();
    } else {
        this._pv_buffer.dispose();
    }
};

class WeatherMaskData extends MaskData {
    constructor(sprite) {
        super(sprite);
    }

    get enabled() {
        return canvas.weather._pv_mask;
    }

    set enabled(value) { }
}
