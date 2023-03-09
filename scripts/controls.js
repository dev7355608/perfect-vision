Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    if (!game.modules.get("gm-vision")?.active) {
        game.keybindings.register("perfect-vision", "improvedGMVision", {
            name: "Toggle GM Vision",
            editable: [
                { key: "KeyG", modifiers: [KeyboardManager.MODIFIER_KEYS.CONTROL] }
            ],
            onDown: () => {
                game.settings.set("perfect-vision", "improvedGMVision", !game.settings.get("perfect-vision", "improvedGMVision"));

                return true;
            },
            restricted: true
        });
    }

    game.keybindings.register("perfect-vision", "delimiters", {
        name: "Toggle Delimiters",
        editable: [
            { key: "KeyH", modifiers: [KeyboardManager.MODIFIER_KEYS.CONTROL] }
        ],
        onDown: () => {
            game.settings.set("perfect-vision", "delimiters", !game.settings.get("perfect-vision", "delimiters"));

            return true;
        },
        restricted: true
    });

    Hooks.on("getSceneControlButtons", controls => {
        if (!game.user.isGM) {
            return;
        }

        const lightingControls = controls.find(c => c.name === "lighting");

        if (lightingControls) {
            const index = lightingControls.tools.findIndex(t => t.name === "clear");

            lightingControls.tools.splice(index, 0, {
                name: "perfect-vision.delimiters",
                title: "Toggle Delimiters",
                icon: "far fa-circle",
                toggle: true,
                active: !!game.settings.get("perfect-vision", "delimiters"),
                onClick: toggled => game.settings.set("perfect-vision", "delimiters", toggled)
            });

            if (!game.modules.get("gm-vision")?.active) {
                lightingControls.tools.splice(index + 1, 0, {
                    name: "perfect-vision.improvedGMVision",
                    title: "Toggle GM Vision",
                    icon: "far fa-eye",
                    toggle: true,
                    active: !!game.settings.get("perfect-vision", "improvedGMVision"),
                    onClick: toggled => game.settings.set("perfect-vision", "improvedGMVision", toggled)
                });
            }
        }
    });

    Hooks.on("renderSceneControls", (app, html) => {
        if (!game.user.isGM) {
            return;
        }

        html[0].querySelector(`li[data-tool="perfect-vision.improvedGMVision"]`)
            ?.addEventListener("wheel", event => {
                event.preventDefault();
                event.stopPropagation();

                if (game.settings.get("perfect-vision", "improvedGMVision")) {
                    game.settings.set("perfect-vision", "improvedGMVisionBrightness",
                        Math.clamped(
                            0.05 * (Math.round((game.settings.get("perfect-vision", "improvedGMVisionBrightness") ?? 0.25) / 0.05) - Math.sign(event.deltaY)),
                            0.05,
                            0.95
                        )
                    );
                }
            }, { passive: false });
    });
});
