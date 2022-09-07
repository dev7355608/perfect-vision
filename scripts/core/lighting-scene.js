import { extractLightingData } from "./data-model.js";
import { LightingSystem } from "./lighting-system.js";
import { parseColor } from "../utils/helpers.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.colorManager.prototype.initialize",
        function (wrapped, colors = {}) {
            const flags = canvas.scene.flags["perfect-vision"];

            colors.daylightColor = parseColor(flags?.daylightColor, colors.daylightColor ?? CONFIG.Canvas.daylightColor).maximize(0.05);
            colors.darknessColor = parseColor(flags?.darknessColor, colors.darknessColor ?? CONFIG.Canvas.darknessColor).maximize(0.05);

            const result = wrapped(colors);

            if (LightingSystem.instance.hasRegion("Scene")) {
                LightingSystem.instance.updateRegion("Scene", {
                    darkness: this.darknessLevel,
                    lightLevels: this.weights,
                    daylightColor: this.colors.ambientDaylight.valueOf(),
                    darknessColor: this.colors.ambientDarkness.valueOf(),
                    brightestColor: this.colors.ambientBrightest.valueOf()
                });
            }

            return result;
        },
        libWrapper.WRAPPER
    );

    Hooks.on("drawEffectsCanvasGroup", () => {
        updateLighting({ defer: true });
    });

    Hooks.on("updateScene", document => {
        if (!document.isView) {
            return;
        }

        updateLighting();
    });

    Hooks.on("updateScene", document => {
        if (!document.isView) {
            return;
        }

        updateLighting();

        setTimeout(() => {
            let elevation, sort;
            const background = canvas.primary.background;

            if (background.visible) {
                elevation = background.elevation;
                sort = background.sort;
            } else {
                elevation = -Infinity;
                sort = -Infinity;
            }

            if (LightingSystem.instance.updateRegion("Scene", { elevation, sort })) {
                canvas.perception.update({ refreshLighting: true }, true);
            }
        }, 0);
    });
});

export function updateLighting({ defer = false } = {}) {
    let initializeLighting = false;
    const data = extractLightingData(canvas.scene);

    if (!LightingSystem.instance.hasRegion("Scene")) {
        LightingSystem.instance.createRegion("Scene", data);

        initializeLighting = true;
    } else if (!LightingSystem.instance.updateRegion("Scene", data)) {
        defer = true;
    }

    canvas.colorManager.initialize();

    if (!defer) {
        canvas.perception.update({ initializeLighting, refreshLighting: true }, true);
    }
};
