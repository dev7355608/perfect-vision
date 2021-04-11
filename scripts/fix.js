import { extend } from "./extend.js";
import { patch } from "./patch.js";

Hooks.once("init", () => {
    // https://gitlab.com/foundrynet/foundryvtt/-/issues/4263
    if (isNewerVersion(game.data.version, "0.7.8")) {
        let _darknessChanged;

        patch("PointSource.prototype.drawLight", "PRE", function (opts) {
            opts = typeof (opts) === "object" ? opts : { updateChannels: !!opts };

            if (_darknessChanged !== undefined) {
                opts.updateChannels = opts.updateChannels || _darknessChanged;
            }

            return [opts];
        });

        const _sources = new Set();

        patch("LightingLayer.prototype.refresh", "WRAPPER", function (wrapped, darkness) {
            _darknessChanged = darkness != undefined && (darkness !== this.darknessLevel)

            for (const sources of [this.sources, canvas.sight.sources]) {
                for (const key in sources) {
                    if (!_sources.has(key)) {
                        sources[key]._resetIlluminationUniforms = true;
                    }
                }
            }

            _sources.clear();

            for (const sources of [this.sources, canvas.sight.sources]) {
                for (const key in sources) {
                    _sources.set(key);
                }
            }

            const retVal = wrapped(darkness);

            _darknessChanged = undefined;

            return retVal;
        });
    }

    patch("SceneConfig.prototype.close", "POST", async function () {
        canvas.lighting.refresh(canvas.scene.data.darkness);

        return await arguments[0];
    });

    // Fix flickering border pixels
    patch("BackgroundLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        const this_ = extend(this);

        this_.msk = this.addChild(new PIXI.Graphics());
        this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
        this.mask = this_.msk;

        return retVal;
    });

    patch("EffectsLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        const this_ = extend(this);

        this_.msk = this.addChild(new PIXI.Graphics());
        this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
        this.mask = this_.msk;

        return retVal;
    });

    patch("EffectsLayer.layerOptions", "POST", function () {
        return mergeObject(arguments[0], {
            zIndex: Canvas.layers.fxmaster?.layerOptions.zIndex ?? 180
        });
    });

    patch("LightingLayer.prototype._configureChannels", "POST", function (channels) {
        const dim = CONFIG.Canvas.lightLevels.dim;
        channels.dim.rgb = channels.bright.rgb.map((c, i) => (dim * c) + ((1 - dim) * channels.background.rgb[i]));
        channels.dim.hex = rgbToHex(channels.dim.rgb);
        return channels;
    });

    // https://gitlab.com/foundrynet/foundryvtt/-/issues/4565
    patch("normalizeRadians", "POST", function (nr) {
        return nr < -Math.PI ? nr + 2 * Math.PI : nr;
    });

    patch("Ray.fromAngle", "POST", function (ray) {
        ray.angle = normalizeRadians(ray.angle);
        return ray;
    });

    patch("SightLayer._castRays", "POST", function (rays) {
        for (const ray of rays) {
            rays.angle = normalizeRadians(ray.angle);
        }

        rays.sort((ray1, ray2) => ray1.angle - ray2.angle);

        for (let i = rays.length - 1; i > 0; i--) {
            if (rays[i].angle === rays[i - 1].angle) {
                rays.splice(i, 1);
            }
        }

        return rays;
    });

    patch("LightingLayer.prototype._drawColorationContainer", "POST", function (c) {
        c.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
        return c;
    });

    patch("LightingLayer.prototype._drawIlluminationContainer", "POST", function (c) {
        c.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
        return c;
    });

    patch("SightLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];
        this.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
        return retVal;
    });
});
