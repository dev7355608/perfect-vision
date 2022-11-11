import { LightingFramebuffer } from "./lighting-framebuffer.js";

const uniformGroup = new PIXI.UniformGroup({
    ambientBrightest: [0, 0, 0],
    ambientDaylight: [0, 0, 0],
    ambientDarkness: [0, 0, 0],
    weights: [0, 0, 0, 0],
    lightingLevels: [0, 0, 0, 0],
    darknessLevel: 0,
    darknessPenalty: 0,
    darknessLightPenalty: 0,
    lightingTextures: LightingFramebuffer.instance.uniformGroup
});

export default uniformGroup;

function updateUniforms() {
    const uniforms = uniformGroup.uniforms;
    const { ambientBrightest, ambientDaylight, ambientDarkness } = canvas.colorManager.colors;

    uniforms.ambientBrightest[0] = ambientBrightest.r;
    uniforms.ambientBrightest[1] = ambientBrightest.g;
    uniforms.ambientBrightest[2] = ambientBrightest.b;
    uniforms.ambientDaylight[0] = ambientDaylight.r;
    uniforms.ambientDaylight[1] = ambientDaylight.g;
    uniforms.ambientDaylight[2] = ambientDaylight.b;
    uniforms.ambientDarkness[0] = ambientDarkness.r;
    uniforms.ambientDarkness[1] = ambientDarkness.g;
    uniforms.ambientDarkness[2] = ambientDarkness.b;

    const weights = canvas.colorManager.weights;

    uniforms.weights[0] = weights.bright;
    uniforms.weights[1] = weights.dim;
    uniforms.weights[2] = weights.halfdark;
    uniforms.weights[3] = weights.dark;

    const levels = VisionMode.LIGHTING_LEVELS;

    uniforms.lightingLevels[0] = getCorrectedColor(levels.BRIGHT);
    uniforms.lightingLevels[1] = getCorrectedColor(levels.DIM);
    uniforms.lightingLevels[2] = getCorrectedColor(levels.HALFDARK);
    uniforms.lightingLevels[3] = getCorrectedColor(levels.DARKNESS);

    uniforms.darknessLevel = canvas.colorManager.darknessLevel;
    uniforms.darknessPenalty = canvas.colorManager.darknessPenalty;
    uniforms.darknessLightPenalty = CONFIG.Canvas.darknessLightPenalty;
}

function getCorrectedColor(level) {
    const lightingOptions = canvas.effects.visibility.visionModeData?.activeLightingOptions;
    const correctedLevel = lightingOptions?.levels?.[level] ?? level;
    const levels = VisionMode.LIGHTING_LEVELS;

    switch (correctedLevel) {
        case levels.UNLIT:
            return 0;
        case levels.DIM:
        case levels.HALFDARK:
            return 1;
        case levels.BRIGHT:
        case levels.DARKNESS:
            return 2;
        case levels.BRIGHTEST:
            return 3;
        default:
            return 1;
    }
};

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("canvasInit", updateUniforms);
    Hooks.on("initializeVisionSources", updateUniforms);
    Hooks.on("lightingRefresh", updateUniforms);
});
