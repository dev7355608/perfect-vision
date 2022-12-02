import { VisionLimitationConfig } from "./vision-limitation-config.js";

Hooks.once("setup", () => {
    function previewChanges(change, reset = false) {
        if (this instanceof TokenConfig) {
            delete change.actorId;
            delete change.actorLink;
        }

        if (!isNewerVersion("10.290", game.version)) {
            change = foundry.utils.mergeObject(this.original, change, { inplace: false });
        }

        if (this instanceof DefaultTokenConfig) {
            change = this.object.updateSource(change, { recursive: false });
        } else {
            const flagPrefix = "flags.perfect-vision" + (this instanceof TokenConfig ? ".light" : "");
            const visionLimitation = foundry.utils.getProperty(
                this.object.toObject(true),
                flagPrefix + ".visionLimitation"
            );

            change = foundry.utils.mergeObject(
                change,
                { [`${flagPrefix}.-=visionLimitation`]: null },
                { inplace: false, performDeletions: true }
            );
            change = this.object.updateSource(change, { recursive: false });

            if (visionLimitation !== undefined) {
                this.object.updateSource({ [`${flagPrefix}.visionLimitation`]: visionLimitation });
            }
        }

        if (reset && isNewerVersion(game.version, "10.290")) {
            return;
        }

        if (this instanceof TokenConfig) {
            if (this.isPrototype) {
                return;
            }

            this.object._onUpdate(change, isNewerVersion(game.version, "10.290") ? { animate: false, render: false, preview: true } : { animate: false, render: false }, game.user.id);
        } else {
            this.object._onUpdate(change, isNewerVersion(game.version, "10.290") ? { render: false, preview: true } : { render: false }, game.user.id);
        }
    }

    libWrapper.register(
        "perfect-vision",
        "AmbientLightConfig.prototype._previewChanges",
        previewChanges,
        libWrapper.OVERRIDE
    );

    libWrapper.register(
        "perfect-vision",
        "TokenConfig.prototype._previewChanges",
        previewChanges,
        libWrapper.OVERRIDE
    );
});

Hooks.on("renderAmbientLightConfig", injectLightFormFields);
Hooks.on("renderTokenConfig", injectLightFormFields);

function injectLightFormFields(sheet) {
    const form = sheet.form;
    const document = sheet.object;

    if (sheet instanceof DefaultTokenConfig) {
        return;
    }

    const isAmbientLight = document instanceof AmbientLightDocument;
    const resolution = foundry.utils.getProperty(document, `flags.perfect-vision.${isAmbientLight ? "" : "light."}resolution`);
    const luminosity = foundry.utils.getProperty(document, `${isAmbientLight ? "config" : "light"}.luminosity`);
    const priority = foundry.utils.getProperty(document, "flags.core.priority");

    form.querySelector(`select[name="${isAmbientLight ? "config" : "light"}.animation.type"]`)
        .closest(".form-group")
        .insertAdjacentHTML("afterend", `\
            <div class="form-group">
                <label>${game.i18n.localize("PERFECTVISION.AnimationResolution")}</label>
                <div class="form-fields">
                    <input type="range" name="flags.perfect-vision.${isAmbientLight ? "" : "light."}resolution" min="0.01" max="10" step="0.01" value="${resolution ?? 1}">
                    <span class="range-value">${resolution ?? 1}</span>
                </div>
            </div>`);

    form.querySelector(`${isAmbientLight ? "" : `.tab[data-tab="light"] > `}.tab[data-tab="advanced"]`)
        .insertAdjacentHTML("beforeend", `\
            <div class="form-group slim">
                <label>${game.i18n.localize("PERFECTVISION.Priority")}</label>
                <div class="form-fields">
                    <input type="number" name="flags.core.priority" step="1" placeholder="${luminosity >= 0 ? 0 : 10}" value="${priority ?? ""}">
                </div>
                <p class="hint">${game.i18n.localize("PERFECTVISION.PriorityHint")}</p>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize("PERFECTVISION.VisionLimitation")}</label>
                <div class="form-fields">
                <button type="button" name="flags.perfect-vision.${isAmbientLight ? "" : "light."}visionLimitation" class="perfect-vision--button">
                    <i class="fas fa-eye"></i>
                    ${game.i18n.localize("PERFECTVISION.ConfigureVisionLimitation")}
                </button>
                </div>
                <p class="notes">${game.i18n.localize("PERFECTVISION.VisionLimitationHintLight")}</p>
            </div > `);

    form.querySelector(`input[name="${isAmbientLight ? "config" : "light"}.luminosity"]`)
        .addEventListener("change", event => form.querySelector(`input[name="flags.core.priority"]`).placeholder = event.target.value >= 0 ? 0 : 10);

    if (isAmbientLight) {
        form.querySelector('button[type="reset"]')
            .addEventListener("click", () => foundry.utils.mergeObject(document, {
                "flags.core.-=priority": null
            }, { performDeletions: true }), { capture: true });
    }

    form.querySelector(`button[name="flags.perfect-vision.${isAmbientLight ? "" : "light."}visionLimitation"]`)
        .addEventListener("click", event => {
            event.preventDefault();

            new VisionLimitationConfig(document).render(true);
        });

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
}
