import { extractLightingData } from "./data-model.js";
import { LightingSystem } from "./lighting-system.js";
import { hasChanged, parseColor } from "../utils/helpers.js";

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

    Hooks.on("drawLightingLayer", () => {
        updateLighting({ defer: true });
    });

    Hooks.on("updateScene", (document, changes) => {
        if (!document.isView) {
            return;
        }

        if ("fogExploration" in changes || "globalLight" in changes
            || "globalLightThreshold" in changes || "darkness" in changes
            || hasChanged(changes, "flags.perfect-vision")) {
            updateLighting();
        }
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
