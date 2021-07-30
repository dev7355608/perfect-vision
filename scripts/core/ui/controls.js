Hooks.on("getSceneControlButtons", controls => {
    const lightingControl = controls.find(c => c.name === "lighting");

    if (lightingControl) {
        let index = lightingControl.tools.findIndex(t => t.name === "clear");

        if (index < 0) {
            return;
        }

        lightingControl.tools.splice(index, 0, {
            name: "perfect-vision.improvedGMVision",
            title: "Improved GM Vision",
            icon: "fas fa-eye",
            toggle: true,
            active: !!game.settings.get("perfect-vision", "improvedGMVision"),
            visible: game.user.isGM,
            onClick: toggled => game.settings.set("perfect-vision", "improvedGMVision", toggled),
        });
    }
});
