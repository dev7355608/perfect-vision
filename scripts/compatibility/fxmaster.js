import { patch } from "../utils/patch.js";
import { Logger } from "../utils/logger.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    CONFIG.Canvas.layers.fxmaster.group = "primary";
    CONFIG.Canvas.layers.specials.group = "primary";

    patch("Canvas.layers.fxmaster.layerClass.prototype.drawWeather", "WRAPPER", async function (wrapped, ...args) {
        const result = await wrapped(...args);

        WeatherLayer.prototype._pv_updateMask.call(this, Object.keys(this.weatherEffects).length !== 0);

        return result;
    });

    patch("Canvas.layers.fxmaster.layerClass.prototype.updateMask", "OVERRIDE", function () {
        this.visible = true;

        if (this._pv_mask) {
            this._pv_mask.destroy(true);
            this._pv_mask = null;
        }

        this._pv_mask = (canvas.scene.getFlag("fxmaster", "invert") ? this._createMask() : this._createInvertedMask()) ?? null;

        if (this._pv_mask) {
            canvas.weather._pv_stage.masks.addChild(this._pv_mask);
        }

        canvas.weather._pv_refreshBuffer();
    });

    let filters = [];

    patch("FXMASTER.filters.applyFiltersToLayers", "OVERRIDE", function () {
        canvas.background.filters = canvas.background.filters ?? [];
        canvas.drawings.filters = canvas.drawings.filters ?? [];
        canvas.tokens.filters = canvas.tokens.filters ?? [];
        canvas.foreground.filters = canvas.foreground.filters ?? [];

        if (this.filteredLayers.background || this.filteredLayers.foreground || this.filteredLayers.tokens || this.filteredLayers.drawings) {
            if (!this.filteredLayers.background || !this.filteredLayers.foreground || !this.filteredLayers.tokens || !this.filteredLayers.drawings) {
                ui.notifications.warn("[Perfect Vision] FXMaster's filters cannot be applied to layers separately!");
                Logger.warn("FXMaster's filters cannot be applied to layers separately!");
            }

            this.filteredLayers.background = true;
            this.filteredLayers.foreground = true;
            this.filteredLayers.tokens = true;
            this.filteredLayers.drawings = true;
        }

        for (const container of [canvas.stage._pv_scene_without_overlays, canvas.stage._pv_scene_with_overlays]) {
            for (const filter of filters) {
                const index = container.filters.indexOf(filter);

                if (index >= 0) {
                    container.filters.splice(index, 1);
                }
            }
        }

        filters = [];

        if (this.filteredLayers.background) {
            let pos = 0;

            for (const [key, filter] of Object.entries(this.filters)) {
                filters.push(filter);

                if (filter instanceof CONFIG.fxmaster.filters.underwater) {
                    const container = canvas.stage._pv_scene_with_overlays;

                    container.filters.push(filter);
                } else {
                    const container = canvas.stage._pv_scene_without_overlays;

                    if (filter instanceof CONFIG.fxmaster.filters.predator || filter instanceof CONFIG.fxmaster.filters.oldfilm) {
                        container.filters.push(filter);
                    } else {
                        container.filters.splice(pos++, 0, filter);
                    }

                    if (this.filteredLayers.drawings) {
                        Logger.warn("Perfect Vision does not apply FXMaster's %s filter to the drawings layer!", key);
                    }
                }
            }
        }
    });
});
