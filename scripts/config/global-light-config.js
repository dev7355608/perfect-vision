import { Notifications } from "../utils/notifications.js";
import { LightingSystem } from "../core/lighting-system.js";
import { LightingConfigHelper } from "./helper.js";

export class GlobalLightConfig extends DocumentSheet {
    /** @override */
    static _getInheritanceChain() {
        return [];
    }

    /** @inheritdoc */
    static name = "PerfectVision.GlobaLightConfig";

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "perfect-vision.global-light-config",
            template: "modules/perfect-vision/templates/global-light-config.hbs",
            width: AmbientLightConfig.defaultOptions.width,
            height: "auto",
            tabs: [{ navSelector: ".tabs", contentSelector: "form", initial: "basic" }]
        });
    }

    /** @override */
    get title() {
        const name = this.document.name
            ? `${this.document.name}`
            : `${game.i18n.localize(this.document.constructor.metadata.label)}`;
        return `${game.i18n.localize("PERFECTVISION.ConfigureGlobalIllum")}: ${name}`;
    }

    /** @override */
    getData(options) {
        const baseData = this.document instanceof Scene ? {
            data: {
                flags: { "perfect-vision": { globalLight: LightingSystem.getDefaultData().globalLight } }
            }
        } : {};

        return foundry.utils.mergeObject(
            foundry.utils.mergeObject(
                foundry.utils.mergeObject(baseData, super.getData(options)),
                { data: LightingConfigHelper.getData(this, true) },
                { performDeletions: true }),
            {
                isScene: this.document instanceof Scene,
                colorationTechniques: AdaptiveLightingShader.SHADER_TECHNIQUES,
                lightAnimations: CONFIG.Canvas.lightAnimations,
                gridUnits: canvas.scene.grid.units || game.i18n.localize("GridUnits"),
                submitText: `${game.i18n.localize("Save Changes")}`
            }
        );
    }

    /**
     * The picker overlay.
     * @type {PIXI.Container}
     */
    _pickerOverlay = null;

    /** @override */
    async close(options = {}) {
        if (this._pickerOverlay) {
            this._pickerOverlay.destroy(true);
            this._pickerOverlay = null;
        }

        LightingConfigHelper.close(this, options);

        return super.close(options);
    }

    /** @override */
    async _render(force, options) {
        await super._render(force, options);

        LightingConfigHelper.updateFormFields(this);

        if (game.system.id === "pf2e"
            && game.settings.get("pf2e", "automation.rulesBasedVision")
            && this.document instanceof Scene && this.document.tokenVision) {
            const globalLight = this.form.querySelector(`input[name="globalLight"]`);
            const globalLightThreshold = this.form.querySelector(`input[name="globalLightThreshold"]`);

            globalLight.disabled = true;
            globalLightThreshold.disabled = true;

            for (const input of [globalLight, globalLightThreshold]) {
                const managedBy = document.createElement("span");

                managedBy.classList.add("managed");
                managedBy.innerHTML = " ".concat(
                    game.i18n.localize("PF2E.SETTINGS.Automation.RulesBasedVision.ManagedBy")
                );

                const rbvLink = managedBy.querySelector("rbv");
                const anchor = document.createElement("a");

                anchor.innerText = rbvLink?.innerHTML ?? "";
                anchor.setAttribute("href", "");
                anchor.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const menu = game.settings.menus.get("pf2e.automation");
                    const app = new menu.type();

                    app.render(true);
                });

                rbvLink?.replaceWith(anchor);
                input.closest(".form-group")?.querySelector("p.hint")?.append(managedBy);
            }

            this.setPosition();
        }
    }

    /** @override */
    activateListeners(html) {
        html.find('button[type="reset"]').click(this._onResetForm.bind(this));
        html.find(`button[name="perfect-vision.pickCoordinates"]`).click(this._onPickCoordinates.bind(this));

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

        if (this._pickerOverlay) {
            this._pickerOverlay.destroy(true);
            this._pickerOverlay = null;
        }

        LightingConfigHelper.resetDefaults(this);
    }

    /** @param {PointerEvent} */
    _onPickCoordinates(event) {
        event.preventDefault();

        const document = this.document;

        if (document instanceof Scene) {
            if (!document.isView) {
                return;
            }
        } else {
            if (!document.rendered) {
                return;
            }
        }

        let pickerOverlay = this._pickerOverlay;

        if (!pickerOverlay) {
            pickerOverlay = this._pickerOverlay = new PIXI.Container();
            pickerOverlay.hitArea = canvas.dimensions.rect;
            pickerOverlay.cursor = "crosshair";
            pickerOverlay.interactive = true;
            pickerOverlay.zIndex = Infinity;
            pickerOverlay.on("remove", () => pickerOverlay.off("pick"));
            pickerOverlay.on("click", event => {
                pickerOverlay.emit("pick", event.data.getLocalPosition(pickerOverlay));
                pickerOverlay.parent.removeChild(pickerOverlay);
            });

            Hooks.once("canvasTearDown", () => {
                if (pickerOverlay) {
                    pickerOverlay.destroy(true);

                    if (this._pickerOverlay === pickerOverlay) {
                        this._pickerOverlay = null;
                    }

                    pickerOverlay = null;
                }
            });
        }

        canvas.stage.addChild(pickerOverlay).once("pick", position => {
            this.form.elements["flags.perfect-vision.globalLight.x"].value = Math.round(position?.x);
            this.form.elements["flags.perfect-vision.globalLight.y"].value = Math.round(position?.y);

            LightingConfigHelper.updateFormFields(this);
        });

        Notifications.info(
            "Now click on the canvas to pick the origin!",
            { permanent: false, console: false }
        );
    }

    /** @override */
    async _updateObject(event, formData) {
        this.object.reset();

        return this.object.update(formData, { render: false });
    }

    /** @override */
    _getSubmitData(updateData) {
        return LightingConfigHelper.processSumbitData(this, super._getSubmitData(updateData));
    }
}
