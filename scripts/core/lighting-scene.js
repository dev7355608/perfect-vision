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

            colors.daylightColor = parseColor(flags?.daylightColor, colors.daylightColor ?? CONFIG.Canvas.daylightColor);
            colors.darknessColor = parseColor(flags?.darknessColor, colors.darknessColor ?? CONFIG.Canvas.darknessColor);

            const result = wrapped(colors);

            if (LightingSystem.instance.hasRegion("globalLight")
                && LightingSystem.instance.updateRegion("globalLight", {
                    darkness: this.darknessLevel,
                    lightLevels: this.weights,
                    daylightColor: this.colors.ambientDaylight.valueOf(),
                    darknessColor: this.colors.ambientDarkness.valueOf(),
                    brightestColor: this.colors.ambientBrightest.valueOf()
                })) {
                canvas.perception.update({ refreshLighting: true }, true);
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

    if (game.modules.get("levels")?.active) {
        function updateBackground() {
            if (LightingSystem.instance.hasRegion("globalLight")
                && LightingSystem.instance.updateRegion("globalLight", {
                    active: isActive(),
                    occluded: isOccluded()
                })) {
                canvas.perception.update({ refreshLighting: true }, true);
            }
        }

        Hooks.on("updateToken", updateBackground);
        Hooks.on("controlToken", updateBackground);
        Hooks.on("levelsUiChangeLevel", updateBackground);
        Hooks.on("renderLevelsUI", updateBackground);
        Hooks.on("closeLevelsUI", updateBackground);
    }
});

export function updateLighting({ defer = false } = {}) {
    let initializeLighting = false;
    const data = extractLightingData(canvas.scene);

    if (game.modules.get("levels")?.active) {
        data.active = isActive();
        data.occluded = isOccluded();
        data.occlusionMode = CONST.TILE_OCCLUSION_MODES.FADE;
    }

    if (!LightingSystem.instance.hasRegion("globalLight")) {
        LightingSystem.instance.createRegion("globalLight", data);

        initializeLighting = true;
    } else if (!LightingSystem.instance.updateRegion("globalLight", data)) {
        defer = true;
    }

    canvas.colorManager.initialize();

    if (!defer) {
        canvas.perception.update({ initializeLighting, refreshLighting: true }, true);
    }
};

function isActive() {
    if (CONFIG.Levels.UI?.rangeEnabled && !canvas.tokens.controlled.length) {
        return (parseFloat(CONFIG.Levels.UI.range?.[0]) ?? Infinity)
            >= (canvas.primary.background?.elevation ?? PrimaryCanvasGroup.BACKGROUND_ELEVATION);
    }

    return true;
}

function isOccluded() {
    if (canvas.tokens.controlled.length) {
        return (CONFIG.Levels.currentToken ?? canvas.tokens.controlled[0]).losHeight
            < (canvas.primary.background?.elevation ?? PrimaryCanvasGroup.BACKGROUND_ELEVATION);
    }

    return false;
}
