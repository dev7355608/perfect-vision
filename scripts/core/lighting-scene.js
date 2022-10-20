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

    Hooks.on("updateScene", document => {
        if (!document.isView) {
            return;
        }

        updateLighting();
    });

    if (game.modules.get("levels")?.active) {
        function updateOcclusion() {
            if (LightingSystem.instance.hasRegion("globalLight")
                && LightingSystem.instance.updateRegion("globalLight", {
                    occluded: isOccluded()
                })) {
                canvas.perception.update({ refreshLighting: true }, true);
            }
        }

        Hooks.on("updateToken", updateOcclusion);
        Hooks.on("controlToken", updateOcclusion);
        Hooks.on("renderLevelsUI", updateOcclusion);
        Hooks.on("closeLevelsUI", updateOcclusion);
    }
});

export function updateLighting({ defer = false } = {}) {
    let initializeLighting = false;
    const data = extractLightingData(canvas.scene);

    if (game.modules.get("levels")?.active) {
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

function isOccluded() {
    const background = canvas.primary.background;

    if (!background || background.texture === PIXI.Texture.EMPTY) {
        return false;
    }

    if (CONFIG.Levels.UI?.rangeEnabled) {
        return (parseFloat(CONFIG.Levels.UI.range[0]) ?? Infinity) < background.elevation;
    }

    if (CONFIG.Levels.currentToken) {
        return CONFIG.Levels.currentToken.losHeight < background.elevation;
    }

    return false;
}
