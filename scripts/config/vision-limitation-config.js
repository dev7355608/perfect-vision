import { LightingSystem } from "../core/lighting-system.js";
import { LightingConfigHelper } from "./helper.js";

export class VisionLimitationConfig extends DocumentSheet {
    /** @override */
    static _getInheritanceChain() {
        return [];
    }

    /** @inheritdoc */
    static name = "PerfectVision.VisionLimitationConfig";

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sheet", "token-sheet"],
            id: "perfect-vision.vision-limitation-config",
            template: "modules/perfect-vision/templates/vision-limitation-config.hbs",
            width: 440,
            height: "auto"
        });
    }

    /**
     * Is the object a prototype token?
     * @type {boolean}
     */
    get isPrototype() {
        return this.object instanceof foundry.data.PrototypeToken;
    }

    /** @override */
    get id() {
        return this.isPrototype ? `${this.constructor.name}-${this.object.actor.uuid}` : super.id;
    }

    /** @override */
    get title() {
        const name = this.isPrototype ? this.object.actor.name : this.document.name
            ? `${this.document.name}`
            : `${game.i18n.localize(this.document.constructor.metadata.label)}`;
        return `${game.i18n.localize("PERFECTVISION.ConfigureVisionLimitation")}: ${name}`;
    }

    /** @override */
    getData(options) {
        const baseData = this.document instanceof Scene ? {
            data: {
                flags: { "perfect-vision": { visionLimitation: LightingSystem.getDefaultData().visionLimitation } }
            }
        } : {};
        const data = foundry.utils.mergeObject(
            foundry.utils.mergeObject(baseData, super.getData(options)),
            { data: LightingConfigHelper.getData(this, true) },
            { performDeletions: true });
        const flags = data.data.flags["perfect-vision"] ?? {};
        const visionLimitation = (this.object instanceof TokenDocument
            || this.object instanceof foundry.data.PrototypeToken
            ? flags.light?.visionLimitation : flags.visionLimitation) ?? {};
        let sightLimit = visionLimitation.sight;

        if (!(this.object instanceof DrawingDocument)) {
            if (!Number.isFinite(sightLimit) || !(sightLimit >= 0)) {
                sightLimit = null;
            }
        }

        const detectionLimits = [];

        for (const detectionMode of Object.values(CONFIG.Canvas.detectionModes)) {
            if (detectionMode.id === DetectionMode.BASIC_MODE_ID) {
                continue;
            }

            let limit = visionLimitation.detection?.[detectionMode.id];

            if (limit !== undefined || !(this.object instanceof DrawingDocument)) {
                if (!Number.isFinite(limit) || !(limit >= 0)) {
                    limit = null;
                }
            }

            detectionLimits.push({
                id: detectionMode.id,
                type: detectionMode.type,
                label: game.i18n.localize(detectionMode.label),
                limit
            });
        }

        detectionLimits.sort((a, b) => a.label.localeCompare(b.label));

        return foundry.utils.mergeObject(
            data,
            {
                sightLimit,
                detectionLimits,
                isEnabled: visionLimitation.enabled,
                isToken: this.object instanceof TokenDocument || this.object instanceof foundry.data.PrototypeToken,
                isDrawing: this.object instanceof DrawingDocument,
                gridUnits: canvas.scene.grid.units || game.i18n.localize("GridUnits"),
                submitText: `${game.i18n.localize("Save Changes")}`
            }
        );
    }

    /** @override */
    async close(options = {}) {
        LightingConfigHelper.close(this, options);

        return super.close(options);
    }

    /** @override */
    render(force = false, options = {}) {
        if (this.isPrototype) {
            return FormApplication.prototype.render.call(this, force, options);
        }

        return super.render(force, options);
    }

    /** @override */
    async _render(force, options) {
        await super._render(force, options);

        LightingConfigHelper.updateFormFields(this);
    }

    /** @override */
    activateListeners(html) {
        html.find('button[type="reset"]').click(this._onResetForm.bind(this));

        return super.activateListeners(html);
    }

    /** @override */
    async _onChangeInput(event) {
        await super._onChangeInput(event);

        LightingConfigHelper.updateFormFields(this);
    }

    /** @param {PointerEvent} event */
    _onResetForm(event) {
        event.preventDefault();

        LightingConfigHelper.resetDefaults(this);
    }

    /** @override */
    async _updateObject(event, formData) {
        if (this.isPrototype) {
            return this.object.actor.update({ prototypeToken: formData }, { render: false });
        }

        this.object.reset();

        return this.object.update(formData, { render: false });

    }

    /** @override */
    _getSubmitData(updateData) {
        return LightingConfigHelper.processSumbitData(this, super._getSubmitData(updateData));
    }
}
