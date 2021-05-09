import { presets } from "./presets.js";

const renderConfigTemplate = Handlebars.compile(`\
    {{#*inline "settingPartial"}}
    <div class="form-group">
        <label>{{this.name}}:</label>
        {{#if this.isCheckbox}}
        <input type="checkbox" name="flags.{{this.module}}.{{this.key}}" data-dtype="Boolean" {{checked this.value}}/>

        {{else if this.isSelect}}
        <select name="flags.{{this.module}}.{{this.key}}">
            {{#select this.value}}
            {{#each this.choices as |name k|}}
            <option value="{{k}}">{{localize name}}</option>
            {{/each}}
            {{/select}}
        </select>

        {{else if this.isRange}}
        <input type="range" name="flags.{{this.module}}.{{this.key}}" data-dtype="Number" value="{{ this.value }}"
                min="{{ this.range.min }}" max="{{ this.range.max }}" step="{{ this.range.step }}"/>
        <span class="range-value">{{this.value}}</span>

        {{else}}
        <input type="text" name="flags.{{this.module}}.{{this.key}}" value="{{this.value}}" data-dtype="{{this.type}}"/>
        {{/if}}
    </div>
    {{/inline}}

    {{#each settings}}
    {{> settingPartial}}
    {{/each}}`
);

const renderConfigTemplate2 = Handlebars.compile(`\
    {{#*inline "settingPartial"}}
    <div class="form-group">
        <label>{{this.name}}{{#if this.units}} <span class="units">({{ this.units }})</span>{{/if}}:</label>
        <input type="number" step="0.1" name="flags.{{this.module}}.{{this.key}}" value="{{this.value}}"/>
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
        s => s.module === "perfect-vision");

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
                const s = duplicate(setting);
                s.name = game.i18n.localize(s.name);
                s.hint = game.i18n.localize(s.hint);
                s.value = game.settings.get(s.module, s.key);
                s.type = setting.type instanceof Function ? setting.type.name : "String";
                s.isCheckbox = setting.type === Boolean;
                s.isSelect = s.choices !== undefined;
                s.isRange = (setting.type === Number) && s.range;

                if (s.key === "visionRules") {
                    s.choices = mergeObject({ "default": "Default" }, s.choices);
                    s.default = "default";
                    s.value = document.getFlag(s.module, s.key) ?? "default";
                } else {
                    s.value = document.getFlag(s.module, s.key);
                }

                return s;
            })
        }, {
            allowProtoMethodsByDefault: true,
            allowProtoPropertiesByDefault: true
        });

        html.find(`input[name="vision"]`).parent().after(config);
        $(config).on("change", "input,select,textarea", sheet._onChangeInput.bind(sheet));

        const config2 = renderConfigTemplate2({
            settings: [{
                module: "perfect-vision",
                key: "sightLimit",
                value: document.getFlag("perfect-vision", "sightLimit"),
                name: "Sight Limit",
                units: "Distance"
            }]
        }, {
            allowProtoMethodsByDefault: true,
            allowProtoPropertiesByDefault: true
        });

        html.find(`input[name="sightAngle"]`).parent().before(config2);
        $(config2).on("change", "input,select,textarea", sheet._onChangeInput.bind(sheet));
    } else {
        console.assert(sheet instanceof SettingsConfig);
    }

    const colorInput = window.document.createElement("input");
    colorInput.setAttribute("type", "color");
    colorInput.setAttribute("value", html.find(`input[name="${prefix}.monoVisionColor"]`).val());
    colorInput.setAttribute("data-edit", `${prefix}.monoVisionColor`);

    html.find(`input[name="${prefix}.monoVisionColor"]`).after(colorInput)
    $(colorInput).on("change", sheet._onChangeInput.bind(sheet));

    const defaultVisionRules = settings.find(s => s.key === "visionRules").choices[game.settings.get("perfect-vision", "visionRules")];

    html.find(`select[name="${prefix}.visionRules"] > option[value="default"]`).html(`Default (${defaultVisionRules})`);

    const inputMonochromeVisionColor = html.find(`input[name="${prefix}.monoVisionColor"]`);
    inputMonochromeVisionColor.attr("class", "color");

    if (sheet instanceof TokenConfig)
        inputMonochromeVisionColor.attr("placeholder", `Default (${game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff"})`);
    else
        inputMonochromeVisionColor.attr("placeholder", `#ffffff`);

    if (sheet instanceof TokenConfig) {
        let scene;

        if (isNewerVersion(game.data.version, "0.8")) {
            scene = document.parent;
        } else {
            scene = document.scene;
        }

        if (scene) {
            const defaultSightLimit = scene.getFlag("perfect-vision", "sightLimit");
            html.find(`input[name="${prefix}.sightLimit"]`).attr("placeholder", `Scene Default (${defaultSightLimit ?? "Unlimited"})`);
        } else {
            html.find(`input[name="${prefix}.sightLimit"]`).attr("placeholder", "Unlimited");
        }
    }

    const update = () => {
        let visionRules = html.find(`select[name="${prefix}.visionRules"]`).val();

        if (!visionRules)
            return;

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

        if (!sheet._minimized)
            sheet.setPosition(sheet.position);
    };

    update();

    html.find(`select[name="${prefix}.visionRules"]`).change(update);
    html.find(`button[name="reset"]`).click(update);
}

Hooks.on("renderSettingsConfig", renderConfig);

Hooks.on("renderTokenConfig", renderConfig);

Hooks.on("renderSceneConfig", (sheet, html, data) => {
    const document = sheet.object;

    const globalLight = html.find(`input[name="globalLight"]`);
    const globalLightLabel = globalLight.prev();
    globalLightLabel.after(`<div class="form-fields"></div>`);

    const defaultGlobalLight = Array.from(game.settings.settings.values()).find(
        s => s.module === "perfect-vision" && s.key === "globalLight").choices[game.settings.get("perfect-vision", "globalLight")];

    const globalLightFields = globalLightLabel.next();
    globalLight.css("margin", globalLight.css("margin"));
    globalLight.remove();
    globalLightFields.append(`\
            <select name="flags.perfect-vision.globalLight">
                <option value="default">Default (${defaultGlobalLight})</option>
                <option value="bright">Bright Light</option>
                <option value="dim">Dim Light</option>
                <option value="none">Scene Darkness</option>
            </select>`);
    globalLightFields.append(globalLight);

    globalLightFields.next().append(" If set to Dim (Bright) Light, the entire scene is illuminated with dim (bright) light and, if set to Scene Darkness, the scene is illuminated according to the scene's Darkness Level only.");

    html.find(`select[name="flags.perfect-vision.globalLight"]`)
        .val(document.getFlag("perfect-vision", "globalLight") ?? "default")
        .on("change", sheet._onChangeInput.bind(sheet));

    html.find(`input[name="tokenVision"]`).parent().after(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(Distance)</span></label>
            <div class="form-fields">
                <input type="number" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number">
            </div>
            <p class="notes">Limit the sight of all tokens within this scene. The limit can be set for each token individually in the token configuration under the Vision tab.</p>
        </div>`);

    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"))
        .on("change", sheet._onChangeInput.bind(sheet));

    const addColorSetting = (name, label) => {
        const defaultColor = "#" + ("000000" + CONFIG.Canvas[name].toString(16)).slice(-6);

        html.find(`input[name="darkness"]`).parent().parent().before(`\
            <div class="form-group">
                <label>${label}</label>
                <div class="form-fields">
                    <input type="text" name="flags.perfect-vision.${name}" placeholder="Default (${defaultColor})" data-dtype="String">
                    <input type="color" data-edit="flags.perfect-vision.${name}">
                </div>
            </div>`);

        html.find(`input[name="flags.perfect-vision.${name}"]`).next()
            .attr("value", document.getFlag("perfect-vision", name) || defaultColor);
        html.find(`input[name="flags.perfect-vision.${name}"]`)
            .attr("value", document.getFlag("perfect-vision", name))
            .on("change", sheet._onChangeInput.bind(sheet));
    };

    addColorSetting("daylightColor", "Daylight Color");
    addColorSetting("darknessColor", "Darkness Color");

    if (!sheet._minimized)
        sheet.setPosition(sheet.position);
});
