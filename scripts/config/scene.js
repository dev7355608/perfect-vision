import { GlobalLightConfig } from "./global-light-config.js";
import { updateLighting } from "../core/lighting-scene.js";
import { VisionLimitationConfig } from "./vision-limitation-config.js";

Hooks.on("renderSceneConfig", sheet => {
    const form = sheet.form;
    const document = sheet.object;

    form.querySelector(`input[name="fogExploredColor"]`)
        .closest(".form-group")
        .insertAdjacentHTML("afterend", `\
            <div class="form-group">
                <label>${game.i18n.localize("PERFECTVISION.RevealFog")}</label>
                <input type="checkbox" name="flags.perfect-vision.fogRevealed"
                    ${foundry.utils.getProperty(document, "flags.perfect-vision.fogRevealed") ? "checked" : ""}>
                <p class="notes">${game.i18n.localize("PERFECTVISION.RevealFogHint")}</p>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize("PERFECTVISION.VisionLimitation")}</label>
                <div class="form-fields">
                <button type="button" name="flags.perfect-vision.visionLimitation" class="perfect-vision--button">
                    <i class="fas fa-eye"></i>
                    ${game.i18n.localize("PERFECTVISION.ConfigureVisionLimitation")}
                </button>
                </div>
                <p class="notes">${game.i18n.localize("PERFECTVISION.VisionLimitationHint")}</p>
            </div>`);
    form.querySelector(`button[name="flags.perfect-vision.visionLimitation"]`)
        .addEventListener("click", event => {
            event.preventDefault();

            new VisionLimitationConfig(document).render(true);
        });

    const globalLight = form.querySelector(`input[name="globalLight"]`);

    globalLight.hidden = true;
    globalLight.disabled = true;

    if (!globalLight.parentNode.classList.contains("form-fields")) {
        const div = window.document.createElement("div");

        globalLight.parentNode.insertBefore(div, globalLight);
        div.classList.add("form-fields");
        div.appendChild(globalLight);
    }

    globalLight.closest(`.form-group`)
        .querySelector(`p.notes`)
        .innerHTML = game.i18n.localize("PERFECTVISION.GlobalIllumHint");

    globalLight.insertAdjacentHTML("beforebegin", `\
        <button type="button" name="flags.perfect-vision.globalLight" class="perfect-vision--button">
            <i class="fas fa-lightbulb"></i>
            ${game.i18n.localize("PERFECTVISION.ConfigureGlobalIllum")}
        </button>`);
    form.querySelector(`button[name="flags.perfect-vision.globalLight"]`)
        .addEventListener("click", event => {
            event.preventDefault();

            new GlobalLightConfig(document).render(true);
        });

    const globalLightThreshold = form.querySelector(`input[name="globalLightThreshold"]`);

    globalLightThreshold.hidden = true;
    globalLightThreshold.disabled = true;
    globalLightThreshold.closest(`.form-group`).style.display = "none";

    const hasGlobalThreshold = form.querySelector(`input[name="hasGlobalThreshold"]`);

    hasGlobalThreshold.hidden = true;
    hasGlobalThreshold.disabled = true;

    const colorPicker = (name, label) => {
        const color = foundry.utils.getProperty(document, `flags.perfect-vision.${name}`);
        const defaultColor = foundry.utils.Color.from(CONFIG.Canvas[name]).css;

        return `<div class="form-group">
                    <label>${label}</label>
                    <div class="form-fields">
                        <input class="color" type="text" name="flags.perfect-vision.${name}" value="${color || ""}" placeholder="${defaultColor}">
                        <input type="color" data-edit="flags.perfect-vision.${name}" value="${color || defaultColor}">
                    </div>
                    ${name === "darknessColor" ? `<p class="notes">
                        ${game.i18n.localize("PERFECTVISION.IllumColorsHint")}
                    </p>` : ""}
                </div>`
    };

    form.querySelector(`input[name="darkness"]`)
        .closest(".form-group")
        .insertAdjacentHTML("afterend", `\
            ${colorPicker("daylightColor", game.i18n.localize("PERFECTVISION.DaylightColor"))}
            ${colorPicker("darknessColor", game.i18n.localize("PERFECTVISION.DarknessColor"))}`);

    if (document.isView) {
        form.querySelectorAll(`*[name^="flags.perfect-vision."],*[data-edit^="flags.perfect-vision."]`)
            .forEach(element =>
                element.addEventListener("change", event => {
                    event.preventDefault();

                    if (event.target.type === "color" && event.target.dataset.edit?.startsWith("flags.perfect-vision.")) {
                        sheet.form.elements[event.target.dataset.edit].value = event.target.value;
                    }

                    foundry.utils.mergeObject(
                        document,
                        {
                            flags: {
                                "perfect-vision": {
                                    fogRevealed: form["flags.perfect-vision.fogRevealed"].checked,
                                    daylightColor: form["flags.perfect-vision.daylightColor"].value || null,
                                    darknessColor: form["flags.perfect-vision.darknessColor"].value || null
                                }
                            }
                        }
                    );
                    updateLighting();
                })
            );
    }

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

Hooks.on("closeSceneConfig", sheet => {
    if (sheet.document.isView) {
        sheet.document.reset();
        updateLighting();
    }
});
