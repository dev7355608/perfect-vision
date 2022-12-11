Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    const gmVision = {
        enabled: false,
        brightness: 0.25
    }

    function updateGMVision({ enabled, brightness } = {}) {
        if (enabled !== undefined) {
            gmVision.enabled = enabled;
        }

        if (brightness !== undefined) {
            gmVision.brightness = brightness;
        }

        let brightnessBoost = 0;

        if (gmVision.enabled && game.user.isGM && canvas.effects.visionSources.size === 0) {
            brightnessBoost = gmVision.brightness;
        }

        canvas.effects.illumination.filter.uniforms.brightnessBoost = brightnessBoost;
    }

    game.settings.register("perfect-vision", "improvedGMVision", {
        name: "Improved GM Vision",
        scope: "client",
        config: false,
        type: Boolean,
        default: false,
        onChange: value => {
            if (!canvas.ready || !game.user.isGM) {
                return;
            }

            updateGMVision({ enabled: value });

            if (ui.controls.control.name === "lighting") {
                ui.controls.control.tools.find(tool => tool.name === "perfect-vision.improvedGMVision").active = value;
                ui.controls.render();
            }
        }
    });

    game.settings.register("perfect-vision", "improvedGMVisionBrightness", {
        name: "Improved GM Vision Brightness",
        scope: "client",
        config: false,
        type: Number,
        default: 0.25,
        onChange: value => {
            if (!canvas.ready || !game.user.isGM) {
                return;
            }

            updateGMVision({ brightness: value });
        }
    });

    game.settings.register("perfect-vision", "delimiters", {
        name: "Delimiters",
        scope: "client",
        config: false,
        type: Boolean,
        default: false,
        onChange: value => {
            if (!canvas.ready || !game.user.isGM) {
                return;
            }

            canvas.perception.update({ refreshLighting: true }, true);

            if (ui.controls.control.name === "lighting") {
                ui.controls.control.tools.find(tool => tool.name === "perfect-vision.delimiters").active = value;
                ui.controls.render();
            }
        }
    });

    game.settings.set("perfect-vision", "improvedGMVision", false);
    game.settings.set("perfect-vision", "improvedGMVisionBrightness", 0.25);
    game.settings.set("perfect-vision", "delimiters", false);

    Hooks.once("canvasInit", () => {
        if (!game.user.isGM) {
            return;
        }

        Hooks.on("canvasReady", () => {
            updateGMVision({
                enabled: game.settings.get("perfect-vision", "improvedGMVision"),
                brightness: game.settings.get("perfect-vision", "improvedGMVisionBrightness")
            });
        });

        Hooks.on("sightRefresh", () => {
            updateGMVision();
        });
    });
});
