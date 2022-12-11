import { extractLightingData } from "./data-model.js";
import { LightingSystem } from "./lighting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("drawDrawing", drawing => {
        if (drawing.isPreview) {
            return;
        }

        updateLighting(drawing);
    });

    Hooks.on("refreshDrawing", drawing => {
        if (drawing.isPreview) {
            return;
        }

        setTimeout(() => {
            const document = drawing.document;
            const objectId = `Drawing.${document.id}`;

            if (LightingSystem.instance.hasRegion(objectId)
                && LightingSystem.instance.updateRegion(objectId, {
                    active: isActive(drawing), elevation: document.elevation
                })) {
                canvas.perception.update({ refreshLighting: true }, true);
            }
        }, 0);
    });

    Hooks.on("destroyDrawing", drawing => {
        if (drawing.isPreview) {
            return;
        }

        updateLighting(drawing, { deleted: true });
    });

    Hooks.on("updateDrawing", document => {
        if (!document.rendered) {
            return;
        }

        updateLighting(document.object);
    });

    Hooks.on("activateDrawingsLayer", layer => {
        for (const drawing of layer.placeables) {
            updateVisibility(drawing);
        }
    });

    Hooks.on("deactivateDrawingsLayer", layer => {
        for (const drawing of layer.placeables) {
            updateVisibility(drawing);
        }
    });
});

export function updateLighting(drawing, { defer = false, deleted = false } = {}) {
    const document = drawing.document;
    const objectId = `Drawing.${document.id}`;
    const flags = document.flags["perfect-vision"];
    let initializeLighting = false;

    if (!deleted && flags?.enabled) {
        const data = extractLightingData(document);

        data.active = isActive(drawing);

        if (!LightingSystem.instance.hasRegion(objectId)) {
            LightingSystem.instance.createRegion(objectId, data);

            initializeLighting = true;
        } else if (!LightingSystem.instance.updateRegion(objectId, data)) {
            defer = true;
        }
    } else {
        if (!LightingSystem.instance.destroyRegion(objectId)) {
            defer = true;
        }

        initializeLighting = true;
    }

    if (!defer) {
        canvas.perception.update({ initializeLighting, refreshLighting: true }, true);
    }

    updateVisibility(drawing);
};

function isActive(drawing) {
    if (drawing.document.hidden) {
        return false;
    }

    if (CONFIG.Levels) {
        if (!game.user.isGM || !CONFIG.Levels.UI?.rangeEnabled || canvas.tokens.controlled.length) {
            return !!CONFIG.Levels.handlers.DrawingHandler.isDrawingVisible(drawing);
        }

        const { rangeBottom, rangeTop } = CONFIG.Levels.helpers.getRangeForDocument(drawing.document)

        return !!CONFIG.Levels.handlers.UIHandler.inUIRange(rangeBottom, rangeTop);
    }

    return true;
}

function updateVisibility(drawing) {
    const document = drawing.document;
    const flags = document.flags["perfect-vision"];
    const visible = !flags || !flags.enabled || flags.visible
        || drawing.layer.active && (game.user.isGM || game.user === document.author);

    if (!visible) {
        if (canvas.primary === drawing.shape.parent) {
            canvas.primary.removeChild(drawing.shape);
        }

        if (drawing.hasText && drawing.text.parent) {
            drawing.removeChild(drawing.text);
        }
    } else {
        if (canvas.primary !== drawing.shape.parent) {
            canvas.primary.addChild(drawing.shape);
        }

        if (drawing.hasText && !drawing.text.parent) {
            drawing.addChild(drawing.text);
        }
    }
}
