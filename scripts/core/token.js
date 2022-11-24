Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    const wallHeight = !!game.modules.get("wall-height")?.active;

    function sourceWasUpdated(document, changes) {
        const token = document.object;
        const positionChange = "x" in changes || "y" in changes;
        const visibilityChange = "hidden" in changes;
        const rotationChange = "rotation" in changes && token.hasLimitedSourceAngle;
        const perspectiveChange = visibilityChange || positionChange || rotationChange;
        const visionChange = "sight" in changes || token.hasSight && perspectiveChange || "detectionModes" in changes;
        const lightChange = "light" in changes || token.emitsLight && perspectiveChange;

        return visionChange || lightChange;
    }

    Hooks.on("updateToken", (document, changes) => {
        if (!document.rendered) {
            return;
        }

        if ("elevation" in changes) {
            if (!wallHeight && !sourceWasUpdated(document, changes)) {
                document.object.updateSource({ defer: true });
                canvas.perception.update({
                    forceUpdateFog: true,
                    refreshLighting: true,
                    refreshVision: true,
                    refreshSounds: true,
                    refreshTiles: true
                }, true);
            }
        } else if ("flags" in changes) {
            let updateLightSource = false;
            let updateVisionSource = false;

            if ("perfect-vision" in changes.flags) {
                const flags = changes.flags["perfect-vision"];

                if ("light" in flags || "-=light" in flags) {
                    updateLightSource = true;
                }

                if ("sight" in flags || "-=sight" in flags) {
                    updateVisionSource = true;

                }
            } else if ("-=perfect-vision" in changes.flags) {
                updateLightSource = true;
                updateVisionSource = true;
            }

            if ((updateLightSource || updateVisionSource) && !sourceWasUpdated(document, changes)) {
                if (updateLightSource) {
                    document.object.updateLightSource();
                }

                if (updateVisionSource) {
                    document.object.updateVisionSource();
                }
            }
        }
    });
});
