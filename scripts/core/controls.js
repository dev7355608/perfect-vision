Hooks.on("getSceneControlButtons", controls => {
    const lightingControl = controls.find(c => c.name === "lighting");

    if (lightingControl) {
        let index = lightingControl.tools.findIndex(t => t.name === "preview");

        if (index < 0) {
            index = lightingControl.tools.findIndex(t => t.name === "clear");

            lightingControl.tools.splice(index, 0, {
                name: "preview",
                title: "CONTROLS.LightingDelimiter",
                icon: "far fa-circle",
                toggle: true,
                active: canvas.lighting?.delimiter.visible,
                onClick: toggled => canvas.lighting.toggleDelimiters(toggled)
            });

            index += 1;
        }

        lightingControl.tools.splice(index, 0, {
            name: "perfect-vision.improvedGMVision",
            title: "Toggle GM Vision",
            icon: "far fa-eye",
            toggle: true,
            active: !!game.settings.get("perfect-vision", "improvedGMVision"),
            onClick: toggled => game.settings.set("perfect-vision", "improvedGMVision", toggled)
        });
    }
});
