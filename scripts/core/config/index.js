import "./ambient-light.js";
import "./measured-template.js";
import "./drawing.js";
import "./scene.js";
import "./tile.js";
import "./token.js";
import { presets } from "../settings.js";

const renderConfigTemplate = Handlebars.compile(`\
    {{#*inline "settingPartial"}}
    <div class="form-group">
        <label>{{this.name}}</label>
        {{#if this.isCheckbox}}
        <input type="checkbox" name="flags.{{this.namespace}}.{{this.key}}" data-dtype="Boolean" {{checked this.value}}/>

        {{else if this.isSelect}}
        <select name="flags.{{this.namespace}}.{{this.key}}">
            {{#select this.value}}
            {{#each this.choices as |name k|}}
            <option value="{{k}}">{{localize name}}</option>
            {{/each}}
            {{/select}}
        </select>

        {{else if this.isRange}}
        <input type="range" name="flags.{{this.namespace}}.{{this.key}}" data-dtype="Number" value="{{ this.value }}"
                min="{{ this.range.min }}" max="{{ this.range.max }}" step="{{ this.range.step }}"/>
        <span class="range-value">{{this.value}}</span>

        {{else}}
        <input type="text" name="flags.{{this.namespace}}.{{this.key}}" value="{{this.value}}" data-dtype="{{this.type}}"/>
        {{/if}}
    </div>
    {{/inline}}

    {{#each settings}}
    {{> settingPartial}}
    {{/each}}`
);

function renderConfig(sheet, html, data) {
    let document;
    let prefix = "perfect-vision";

    const settings = Array.from(game.settings.settings.values()).filter(
        s => s.namespace === "perfect-vision");

    if (sheet instanceof TokenConfig) {
        document = sheet.token;
        prefix = `flags.${prefix}`;

        const config = renderConfigTemplate({
            settings: settings.filter(s => [
                "visionRules",
                "dimVisionInDarkness",
                "dimVisionInDimLight",
                "brightVisionInDarkness",
                "brightVisionInDimLight",
                "monoVisionColor"
            ].includes(s.key)).map(setting => {
                const s = foundry.utils.duplicate(setting);
                s.name = game.i18n.localize(s.name);
                s.hint = game.i18n.localize(s.hint);
                s.value = game.settings.get(s.namespace, s.key);
                s.type = setting.type instanceof Function ? setting.type.name : "String";
                s.isCheckbox = setting.type === Boolean;
                s.isSelect = s.choices !== undefined;
                s.isRange = (setting.type === Number) && s.range;

                if (s.key === "visionRules") {
                    s.choices = foundry.utils.mergeObject({ "default": "Default" }, s.choices);
                    s.default = "default";
                    s.value = document.getFlag(s.namespace, s.key) ?? "default";
                } else {
                    s.value = document.getFlag(s.namespace, s.key);
                }

                return s;
            })
        }, {
            allowProtoMethodsByDefault: true,
            allowProtoPropertiesByDefault: true
        });

        html.find(`input[name="vision"]`).parent().after(config);
    } else {
        console.assert(sheet instanceof SettingsConfig);
    }

    const colorInput = window.document.createElement("input");
    colorInput.setAttribute("type", "color");
    colorInput.setAttribute("value", html.find(`input[name="${prefix}.monoVisionColor"]`).val());
    colorInput.setAttribute("data-edit", `${prefix}.monoVisionColor`);

    html.find(`input[name="${prefix}.monoVisionColor"]`).after(colorInput);

    const defaultVisionRules = settings.find(s => s.key === "visionRules").choices[game.settings.get("perfect-vision", "visionRules")];

    html.find(`select[name="${prefix}.visionRules"] > option[value="default"]`).html(`Default (${defaultVisionRules})`);

    const inputMonochromeVisionColor = html.find(`input[name="${prefix}.monoVisionColor"]`);
    inputMonochromeVisionColor.attr("class", "color");

    if (sheet instanceof TokenConfig) {
        inputMonochromeVisionColor.attr("placeholder", `Default (${game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff"})`);
    } else {
        inputMonochromeVisionColor.attr("placeholder", `#ffffff`);
    }

    if (sheet instanceof TokenConfig) {
        if (game.system.id === "pf2e" && game.settings.get("pf2e", "automation.rulesBasedVision") && ["character", "familiar"].includes(document.actor?.type ?? "")) {
            html.find(`select[name="${prefix}.visionRules"]`).val("pf2e").prop("disabled", true);
        }
    } else {
        if (game.system.id === "pf2e" && game.settings.get("pf2e", "automation.rulesBasedVision")) {
            const managedBy = $("<strong>")
                .addClass("managed-by-rbv")
                .html(" ".concat(game.i18n.localize("PF2E.SETTINGS.Automation.RulesBasedVision.ManagedBy")));

            managedBy.find("a").on("click", () => {
                const menu = game.settings.menus.get("pf2e.automation");
                if (!menu) throw Error("Automation Settings application not found");
                const app = new menu.type();
                app.render(true);
            }).css("color", "var(--primary)").css("text-decoration", "underline");

            html.find(`select[name="${prefix}.visionRules"]`).val("pf2e").prop("disabled", true);
            html.find(`select[name="${prefix}.visionRules"]`).closest(".form-group").find("p.notes").append(managedBy);
        }
    }

    const update = () => {
        let visionRules = html.find(`select[name="${prefix}.visionRules"]`).val();

        if (!visionRules) {
            return;
        }

        html.find(`select[name="${prefix}.dimVisionInDarkness"]`).prop("disabled", visionRules !== "custom");
        html.find(`select[name="${prefix}.dimVisionInDimLight"]`).prop("disabled", visionRules !== "custom");
        html.find(`select[name="${prefix}.brightVisionInDarkness"]`).prop("disabled", visionRules !== "custom");
        html.find(`select[name="${prefix}.brightVisionInDimLight"]`).prop("disabled", visionRules !== "custom");

        if (sheet instanceof TokenConfig) {
            if (visionRules !== "custom") {
                html.find(`select[name="${prefix}.dimVisionInDarkness"]`).parents(".form-group").hide();
                html.find(`select[name="${prefix}.dimVisionInDimLight"]`).parents(".form-group").hide();
                html.find(`select[name="${prefix}.brightVisionInDarkness"]`).parents(".form-group").hide();
                html.find(`select[name="${prefix}.brightVisionInDimLight"]`).parents(".form-group").hide();
            } else {
                html.find(`select[name="${prefix}.dimVisionInDarkness"]`).parents(".form-group").show();
                html.find(`select[name="${prefix}.dimVisionInDimLight"]`).parents(".form-group").show();
                html.find(`select[name="${prefix}.brightVisionInDarkness"]`).parents(".form-group").show();
                html.find(`select[name="${prefix}.brightVisionInDimLight"]`).parents(".form-group").show();
            }
        }

        if (visionRules === "default") {
            visionRules = game.settings.get("perfect-vision", "visionRules");

            if (visionRules === "custom") {
                html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val(game.settings.get("perfect-vision", "dimVisionInDarkness"));
                html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val(game.settings.get("perfect-vision", "dimVisionInDimLight"));
                html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val(game.settings.get("perfect-vision", "brightVisionInDarkness"));
                html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val(game.settings.get("perfect-vision", "brightVisionInDimLight"));
            }
        }

        if (visionRules !== "custom") {
            html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val(presets[visionRules].dimVisionInDarkness);
            html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val(presets[visionRules].dimVisionInDimLight);
            html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val(presets[visionRules].brightVisionInDarkness);
            html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val(presets[visionRules].brightVisionInDimLight);
        }

        const inputMonochromeVisionColor = html.find(`input[name="${prefix}.monoVisionColor"]`);
        inputMonochromeVisionColor.next().val(inputMonochromeVisionColor.val() || game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff");

        sheet.setPosition();
    };

    update();

    html.find(`select[name="${prefix}.visionRules"]`).change(update);
    html.find(`button[name="reset"]`).click(update);
}

Hooks.on("renderSettingsConfig", renderConfig);

Hooks.on("renderTokenConfig", renderConfig);
