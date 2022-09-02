import { GlobalLightConfig } from "./global-light-config.js";
import { LightingConfigHelper } from "./helper.js";
import { LightingSystem } from "../core/lighting-system.js";
import { VisionLimitationConfig } from "./vision-limitation-config.js";

Hooks.once("setup", () => {
    libWrapper.register(
        "perfect-vision",
        "DrawingConfig.prototype._getSubmitData", function (wrapped, ...args) {
            const data = wrapped(...args);

            if (!game.user.isGM || this.options.configureDefault) {
                return data;
            }

            return LightingConfigHelper.processSumbitData(this, data);
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "DrawingConfig.prototype._onChangeInput",
        async function (wrapped, event) {
            if (game.user.isGM && !this.options.configureDefault) {
                updateForm(this);
            }

            return await wrapped(event);
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "DrawingConfig.prototype._renderInner",
        async function (wrapped, ...args) {
            const result = await wrapped(...args);

            if (!game.user.isGM || this.options.configureDefault) {
                return result;
            }

            const form = this.form;
            const document = this.document;
            const template = await getTemplate("modules/perfect-vision/templates/drawing-config.hbs");
            const nav = form.querySelector("nav.sheet-tabs.tabs");

            nav.insertAdjacentHTML("beforeend", `<a class="item" data-tab="perfect-vision.lighting"><i class="fas fa-lightbulb"></i> ${game.i18n.localize("SCENES.HeaderVision")}</a>`)
            nav.parentNode
                .querySelector("footer")
                .insertAdjacentHTML(
                    "beforebegin",
                    template(
                        {
                            data: LightingConfigHelper.getData(this),
                            defaults: LightingSystem.getDefaultData(),
                            gridUnits: (document.parent?.grid.units ?? game.system.gridUnits) || game.i18n.localize("GridUnits")
                        },
                        {
                            allowProtoMethodsByDefault: true,
                            allowProtoPropertiesByDefault: true
                        }
                    )
                );

            form.querySelector(`.tabs [data-tab="perfect-vision.lighting"]`)
                .addEventListener("click", event => {
                    const element = this.element[0].querySelector(`.document-id-link`);

                    game.tooltip.activate(element);
                    setTimeout(() => {
                        if (game.tooltip.element === element) {
                            game.tooltip.deactivate();
                        }
                    }, 1000);
                });
            form.querySelector(`button[name="flags.perfect-vision.globalLight"]`)
                .addEventListener("click", event => {
                    event.preventDefault();

                    new GlobalLightConfig(document).render(true);
                });
            form.querySelector(`button[name="flags.perfect-vision.visionLimitation"]`)
                .addEventListener("click", event => {
                    event.preventDefault();

                    new VisionLimitationConfig(document).render(true);
                });

            this.options.height = "auto";
            this.position.width = Math.max(this.position.width, SceneConfig.defaultOptions.width);
            this.position.height = "auto";

            return result;
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "DrawingConfig.prototype._render",
        async function (wrapped, ...args) {
            await wrapped(...args);

            updateForm(this);
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "DrawingConfig.prototype.close",
        async function (wrapped, options) {
            if (game.user.isGM && !this.options.configureDefault) {
                LightingConfigHelper.close(this, options);
            }

            return await wrapped(options);
        },
        libWrapper.WRAPPER
    );
});

function updateForm(sheet) {
    LightingConfigHelper.updateFormFields(sheet);

    const document = sheet.document;
    const scene = document.parent;
    const form = sheet.form;
    const data = LightingConfigHelper.getComputedData(scene, document.id);

    const select = form.querySelector(`select[name="flags.perfect-vision.prototype"]`);

    select.style.color = "unset";

    const black = window.getComputedStyle(select).getPropertyValue("color") || "black";

    select.style.color = data.prototype.enabled ? black : "red";

    while (select.firstChild) {
        select.removeChild(select.lastChild);
    }

    select.insertAdjacentHTML("beforeend", `<option value=""></id>`);

    const prototype = document.getFlag("perfect-vision", "prototype");

    for (const other of Array.from(scene.drawings.values()).sort((a, b) => a.id.localeCompare(b.id))) {
        if (other.id === document.id) {
            continue;
        }

        const data = LightingConfigHelper.getComputedData(scene, other.id);
        const color = data.enabled ? black : "red";
        const disabled = data.prototypes.includes(document.id) ? "disabled" : "";

        if (prototype !== other.id && (!data.enabled || disabled)) {
            continue;
        }

        select.insertAdjacentHTML("beforeend", `<option value="${other.id}" title="${other.text || ""}" style="color: ${color};" ${disabled}>${other.id}</id>`);
    }

    select.value = prototype || "";
}
