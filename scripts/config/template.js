import { VisionLimitationConfig } from "./vision-limitation-config.js";

Hooks.on("renderMeasuredTemplateConfig", sheet => {
    if (!game.user.isGM) {
        return;
    }

    const form = sheet.form;
    const document = sheet.object;

    form.querySelector(`.form-group:last-of-type`)
        .insertAdjacentHTML("afterend", `\
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

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
