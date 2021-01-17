import { extend } from "./extend.js";
import { patch } from "./patch.js";

Hooks.once("init", () => {
    // Fix https://gitlab.com/foundrynet/foundryvtt/-/issues/4263
    if (game.data.version === "0.7.9") {
        patch("PointSource.prototype.drawLight", "PRE", function (opts) {
            return [typeof (opts) === "boolean" || opts === 0 ? { updateChannels: opts === 0 || opts } : opts];
        });

        const _sources = new Set();

        patch("LightingLayer.prototype.refresh", "PRE", function () {
            for (const sources of [this.sources, canvas.sight.sources])
                for (const key in sources)
                    if (!_sources.has(key))
                        sources[key]._resetIlluminationUniforms = true;

            _sources.clear();

            for (const sources of [this.sources, canvas.sight.sources])
                for (const key in sources)
                    _sources.set(key);

            return arguments;
        });
    }

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
});
