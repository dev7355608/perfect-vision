import { patch } from "./patch.js";

Hooks.once("init", () => {
    // https://gitlab.com/foundrynet/foundryvtt/-/issues/4263
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
});
