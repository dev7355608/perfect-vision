import { patch } from "../utils/patch.js";
import { Logger } from "../utils/logger.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    patch("Canvas.layers.fxmaster.prototype.drawWeather", "WRAPPER", async function (wrapped, options = {}) {
        const result = await wrapped(options);

        WeatherLayer.prototype._pv_updateMask.call(this, Object.keys(this.weatherEffects).length === 0);

        return result;
    });

    patch("Canvas.layers.fxmaster.prototype.updateMask", "OVERRIDE", function () {
        this.visible = true;

        if (this._pv_mask) {
            this._pv_mask.destroy(true);
            this._pv_mask = null;
        }

        this._pv_mask = (canvas.scene.getFlag("fxmaster", "invert") ? this._createMask() : this._createInvertMask()) ?? null;

        if (this._pv_mask) {
            canvas.weather._pv_stage.masks.addChild(this._pv_mask);
        }

        canvas.weather._pv_refreshBuffer();
    });

    let filters = [];

    function updateFilters(manager) {
        canvas.background.filters = [];
        canvas.drawings.filters = [];
        canvas.tokens.filters = [];
        canvas.foreground.filters = [];

        if (manager.apply_to.background || manager.apply_to.foreground || manager.apply_to.tokens || manager.apply_to.drawings) {
            if (!manager.apply_to.background || !manager.apply_to.foreground || !manager.apply_to.tokens || !manager.apply_to.drawings) {
                ui.notifications.error("[Perfect Vision] FXMaster's filters cannot be applied to layers separately!");
                Logger.warn("FXMaster's filters cannot be applied to layers separately!");
            }

            manager.apply_to.background = true;
            manager.apply_to.foreground = true;
            manager.apply_to.tokens = true;
            manager.apply_to.drawings = true;
        }

        for (const container of [canvas.stage._pv_scene_without_overlays, canvas.stage._pv_scene_with_overlays]) {
            for (const filter of filters) {
                const index = container.filters.indexOf(filter);

                if (index >= 0) {
                    segment.filters.splice(index, 1);
                }
            }
        }

        filters = [];

        if (manager.apply_to.background) {
            for (const [key, filter] of Object.entries(manager.filters)) {
                filters.push(filter);

                if (key === "core_underwater") {
                    const container = canvas.stage._pv_scene_with_overlays;

                    container.filters.push(filter);
                } else {
                    const container = canvas.stage._pv_scene_without_overlays;

                    if (key === "core_predator" || key === "core_oldfilm") {
                        container.filters.push(filter);
                    } else {
                        container.filters.unshift(filter);
                    }

                    if (manager.apply_to.drawings) {
                        Logger.warn("Perfect Vision does not apply FXMaster's %s filter to the drawings layer", key);
                    }
                }
            }
        }

        for (const filter of filters) {
            filter.resolution = canvas.app.renderer.resolution;
            filter.multisample = PIXI.MSAA_QUALITY.NONE;
        }
    }

    patch("FXMASTER.filters.activate", "POST", function () {
        updateFilters(this);
    });

    patch("FXMASTER.filters.update", "POST", async function (result) {
        await result;

        updateFilters(this);
    });
});
