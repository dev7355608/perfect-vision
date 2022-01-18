export const presets = {
    "fvtt": {
        dimVisionInDarkness: "dim",
        dimVisionInDimLight: "dim",
        brightVisionInDarkness: "bright",
        brightVisionInDimLight: "bright"
    },
    "dnd35e": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "dim",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "dim"
    },
    "dnd5e": {
        dimVisionInDarkness: "dim_mono",
        dimVisionInDimLight: "bright",
        brightVisionInDarkness: "bright",
        brightVisionInDimLight: "bright"
    },
    "pf1e": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "dim",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "dim"
    },
    "pf2e": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "bright",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "bright"
    },
    "pf2e_fetchling": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "bright",
        brightVisionInDarkness: "bright",
        brightVisionInDimLight: "bright"
    },
    "sf": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "bright",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "bright"
    },
};

Hooks.once("init", () => {
    for (const [id, preset] of Object.entries(presets)) {
        preset._id = id;
    }

    presets["default"] = presets[game.system.id === "dnd5e" ? "dnd5e" : (game.system.id === "pf1" ? "pf1e" : (game.system.id === "pf2e" ? "pf2e" : (game.system.id === "D35E" ? "dnd35e" : (game.system.id === "sfrpg" ? "sf" : "fvtt"))))];
});

function refresh() {
    if (canvas?.ready) {
        canvas.perception.schedule({
            lighting: { initialize: true, refresh: true },
            sight: { initialize: true, refresh: true }
        });
    }
}

Hooks.once("init", () => {
    game.settings.register("perfect-vision", "improvedGMVision", {
        name: "Improved GM Vision",
        scope: "client",
        config: false,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (!canvas?.ready || !game.user.isGM) {
                return;
            }

            canvas.perception.schedule({ lighting: { refresh: true } });

            if (ui.controls.control.name === "lighting") {
                ui.controls.control.tools.find(tool => tool.name === "perfect-vision.improvedGMVision").active = value;
                ui.controls.render();
            }
        }
    });

    game.settings.set("perfect-vision", "improvedGMVision", false);

    game.settings.register("perfect-vision", "improvedGMVisionBrightness", {
        name: "Improved GM Vision Brightness",
        scope: "client",
        config: false,
        type: Number,
        default: 0.25,
        onChange: (value) => {
            if (!canvas?.ready || !game.user.isGM) {
                return;
            }

            if (game.settings.get("perfect-vision", "improvedGMVision")) {
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }
    });

    game.settings.register("perfect-vision", "delimiters", {
        name: "Delimiters",
        scope: "client",
        config: false,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (!canvas?.ready || !game.user.isGM) {
                return;
            }

            canvas.perception.schedule({ lighting: { refresh: true } });

            if (ui.controls.control.name === "lighting") {
                ui.controls.control.tools.find(tool => tool.name === "perfect-vision.delimiters").active = value;
                ui.controls.render();
            }
        }
    });

    game.settings.set("perfect-vision", "delimiters", false);

    game.settings.register("perfect-vision", "visionRules", {
        name: "Vision Rules",
        hint: "Choose one of the presets, or select Custom and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the Vision tab. Dim (Bright) Vision in Darkness controls what dim (bright) vision looks like in in areas that are not illuminated by light sources. Dim (Bright) Vision in Dim Light controls how dim (bright) vision interacts with dim light, i.e., if dim light becomes bright light or not. Scene Darkness is the level of darkness in areas without light sources. Total Darkness means no vision at all.",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "custom": "Custom",
            "fvtt": "Foundry VTT",
            "dnd35e": "Dungeons & Dragons 3.5e",
            "dnd5e": "Dungeons & Dragons 5e",
            "pf1e": "Pathfinder 1e",
            "pf2e": "Pathfinder 2e",
            "sf": "Starfinder",
        },
        default: presets["default"]._id,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "dimVisionInDarkness", {
        name: "Dim Vision in Darkness",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "bright_mono": "Bright Light (monochrome)",
            "dim": "Dim Light",
            "dim_mono": "Dim Light (monochrome)",
            "scene": "Scene Darkness",
            "scene_mono": "Scene Darkness (monochrome)",
            "darkness": "Total Darkness",
        },
        default: presets["default"].dimVisionInDarkness,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "dimVisionInDimLight", {
        name: "Dim Vision in Dim Light",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "dim": "Dim Light",
        },
        default: presets["default"].dimVisionInDimLight,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "brightVisionInDarkness", {
        name: "Bright Vision in Darkness",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "bright_mono": "Bright Light (monochrome)",
            "dim": "Dim Light",
            "dim_mono": "Dim Light (monochrome)",
            "scene": "Scene Darkness",
            "scene_mono": "Scene Darkness (monochrome)",
            "darkness": "Total Darkness",
        },
        default: presets["default"].brightVisionInDarkness,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "brightVisionInDimLight", {
        name: "Bright Vision in Dim Light",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "bright": "Bright Light",
            "dim": "Dim Light",
        },
        default: presets["default"].brightVisionInDimLight,
        onChange: () => refresh()
    });

    game.settings.register("perfect-vision", "monoVisionColor", {
        name: "Monochrome Vision Color",
        hint: "If it is set to white, monochrome vision is grayscale. Set this color to anything other than white to make monochrome vision stand out visibly in darkness. For example, choose a green tone to make it look like night vision goggles. You can also choose a color for each token individually in the token configuration under the Vision tab. The amount of desaturation is linked to the scene's Darkness Level in a way such that, if it is 0, monochrome and non-monochrome vision are indistinguishable, unless the Saturation Level is set to a specific value in the scene configuration.",
        scope: "world",
        config: true,
        type: String,
        default: "#ffffff",
        onChange: () => refresh()
    });
});
