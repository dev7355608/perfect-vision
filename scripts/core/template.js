import { RayCastingSystem } from "./ray-casting-system.js";
import { Shape } from "../utils/shape.js";
import { extractVisionLimitationData } from "./data-model.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("refreshMeasuredTemplate", template => {
        if (template.isPreview) {
            return;
        }

        setTimeout(() => updateVisionLimitation(template), 0);
    });

    Hooks.on("destroyMeasuredTemplate", template => {
        if (template.isPreview) {
            return;
        }

        updateVisionLimitation(template, { deleted: true });
    });
});

function updateVisionLimitation(template, { defer = false, deleted = false } = {}) {
    if (template.destroyed) {
        return;
    }

    const document = template.document;
    const objectId = `Template.${document.id}`;

    if (!deleted && document.flags["perfect-vision"]?.visionLimitation?.enabled) {
        const visionLimitation = extractVisionLimitationData(document);
        const data = {
            object: template,
            active: !document.hidden,
            mode: "min",
            limits: {
                ...visionLimitation.detection,
                [DetectionMode.BASIC_MODE_ID]: visionLimitation.sight
            },
            shapes: [{
                points: Shape.from(
                    template.shape,
                    new PIXI.Matrix().translate(document.x, document.y)
                ).contour, type: "p"
            }],
            elevation: -Infinity,
            height: Infinity,
            priority: [3]
        };

        if (!RayCastingSystem.instance.hasRegion(objectId)) {
            RayCastingSystem.instance.createRegion(objectId, data);
        } else if (!RayCastingSystem.instance.updateRegion(objectId, data)) {
            defer = true;
        }
    } else if (!RayCastingSystem.instance.destroyRegion(objectId)) {
        defer = true;
    }

    if (!defer) {
        canvas.perception.update({ initializeVision: true }, true);
    }
};
