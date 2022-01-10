import { patch } from "../utils/patch.js";
import { presets } from "./settings.js";

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
        html.find(`input[name="vision"]`).parent().parent().append(`\
            <div class="form-group">
                <label>Sight Limit <span class="units">(Grid Units)</span></label>
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number">
            </div>`);
        html.find(`input[name="flags.perfect-vision.sightLimit"]`)
            .attr("value", document.getFlag("perfect-vision", "sightLimit"));
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
        html.find(`input[name="${prefix}.sightLimit"]`).attr("placeholder", "Unlimited");

        if (game.system.id === "pf2e" && game.settings.get("pf2e", "automation.rulesBasedVision") && ["character", "familiar"].includes(sheet.token.actor?.type ?? "")) {
            html.find(`select[name="${prefix}.visionRules"]`).val("pf2e").prop("disabled", true);
            html.find(`input[name="flags.perfect-vision.sightLimit"]`).prop("disabled", true);
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

Hooks.on("renderSceneConfig", (sheet, html, data) => {
    const document = sheet.object;

    html.find(`input[name="globalLight"]`).parent().after(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(Grid Units)</span></label>
            <div class="form-fields">
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number">
            </div>
            <p class="notes">Limit the sight of all controlled Tokens. This limit is in effect even if Unrestricted Vision Range is enabled. The limit can be set for each token individually in the token configuration under the Vision tab.</p>
        </div>`);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));
    html.find(`input[name="darkness"]`).parent().parent().after(`\
        <div class="form-group">
            <label>Saturation Level</label>
            <div class="form-fields">
                <label class="checkbox">
                    <input type="checkbox" id="perfect-vision.hasSaturation">
                </label>
                <input type="range" name="flags.perfect-vision.saturation" value="0" min="0" max="1" step="0.05">
                <span class="range-value">0</span>
            </div>
            <p class="notes">Desaturate unilluminated areas and monochrome vision. If disabled, the saturation is linked to the Darkness Level.</p>
        </div>`);

    const forceSaturation = document.getFlag("perfect-vision", "forceSaturation");
    const saturation = forceSaturation !== undefined && !forceSaturation ? 0 : (document.getFlag("perfect-vision", "saturation") ?? 0);

    html.find(`input[id="perfect-vision.hasSaturation"]`)
        .attr("checked", forceSaturation !== undefined ? forceSaturation : Number.isFinite(document.getFlag("perfect-vision", "saturation")));
    html.find(`input[name="flags.perfect-vision.saturation"]`)
        .attr("value", saturation);
    html.find(`input[name="flags.perfect-vision.saturation"]`).next()
        .html(saturation);

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
        html.find(`input[name="flags.perfect-vision.${name}"]`)
            .attr("value", document.getFlag("perfect-vision", name));
        html.find(`input[name="flags.perfect-vision.${name}"]`).next()
            .attr("value", document.getFlag("perfect-vision", name) || defaultColor);
    };

    addColorSetting("daylightColor", "Daylight Color");
    addColorSetting("darknessColor", "Darkness Color");

    sheet.setPosition();
});

Hooks.on("renderAmbientLightConfig", (sheet, html, data) => {
    if (!game.user.isGM) {
        return;
    }

    const document = sheet.object;

    if (!document?.parent) {
        return;
    }

    html.find(`input[name="vision"]`).parent().after(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(Grid Units)</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.overrideSightLimit"></label>
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number">
            </div>
            <p class="hint">If enabled, in the area of the light source tokens can see at least as far as the limit if the luminosity is greater or equal to zero, and can see at most as far as the limit if the luminosity is less than zero. Higher priority light sources that overlap with this light source can change the sight limit.</p>
        </div>`);

    html.find(`input[id="perfect-vision.overrideSightLimit"]`)
        .attr("checked", document.getFlag("perfect-vision", "sightLimit") !== undefined);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));

    sheet.setPosition();
});

Hooks.on("renderMeasuredTemplateConfig", (sheet, html, data) => {
    if (!game.user.isGM) {
        return;
    }

    const document = sheet.object;

    if (!document?.parent) {
        return;
    }

    html.find(`button[name="submit"]`).before(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(Grid Units)</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.overrideSightLimit"></label>
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number">
            </div>
        </div>`);

    html.find(`input[id="perfect-vision.overrideSightLimit"]`)
        .attr("checked", document.getFlag("perfect-vision", "sightLimit") !== undefined);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));

    sheet.options.height = "auto";
    sheet.setPosition();
});

Hooks.on("renderDrawingConfig", (sheet, html, data) => {
    if (!game.user.isGM) {
        return;
    }

    const document = sheet.object;

    if (!document?.parent) {
        return;
    }

    const drawing = document.object;

    if (!drawing) {
        return;
    }

    function resetDefaults(event) {
        event.preventDefault();

        if (!this._pv_resetDefaults) {
            this._pv_resetDefaults = true;

            this.object.update({ "flags.-=perfect-vision": null }).then(() => this.render());
        }
    }

    function pickOrigin(event) {
        event.preventDefault();

        canvas.stage.addChild(pickerOverlay);

        pickerOverlay.once("pick", position => {
            const { width, height } = drawing.data;
            const origin = drawing._pv_getLocalPosition(position);
            const x = origin.x / width;
            const y = origin.y / height;

            if (Number.isFinite(x) && Number.isFinite(y)) {
                const p = new PIXI.Point();

                for (let n = 1; ; n *= 10) {
                    origin.x = Math.round(x * n) / n;
                    origin.y = Math.round(y * n) / n;

                    p.x = origin.x * width;
                    p.y = origin.y * height;

                    drawing._pv_getGlobalPosition(p, p);

                    if (Math.max(Math.abs(position.x - p.x) * canvas.stage.scale.x, Math.abs(position.y - p.y) * canvas.stage.scale.y) < 0.1) {
                        break;
                    }
                }

                this.form.elements["flags.perfect-vision.origin.x"].value = origin.x;
                this.form.elements["flags.perfect-vision.origin.y"].value = origin.y;
            } else {
                this.form.elements["flags.perfect-vision.origin.x"].value = null;
                this.form.elements["flags.perfect-vision.origin.y"].value = null;
            }

            $(this.form.elements["flags.perfect-vision.origin.x"]).trigger("change");
        });
    }

    const flex = "1.5";

    const nav = html.find("nav.sheet-tabs.tabs");

    nav.append(`<a class="item" data-tab="perfect-vision.lighting" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 10px; padding-right: 10px; margin-left: -10px; margin-right: -10px;"><i class="fas fa-lightbulb"></i> Lighting</a>`);
    nav.parent().find("footer").before(`\
        <div class="tab" data-tab="perfect-vision.lighting">
            <p class="notes">Adjust lighting and vision of the area below the Drawing. Drawings with a higher Z-Index override lighting settings of overlapping Drawings with a lower Z-Index.</p>
            <div class="form-group">
                <label style="flex:${flex};">Active</label>
                <div class="form-fields">
                    <label id="perfect-vision.id" style="flex: 1; font-family: monospace;">${drawing.id}</label>
                    <button type="button" style="flex: 1;" id="perfect-vision.resetDefaults"><i class="fas fa-undo"></i> Reset Defaults</button>
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox" style="visibility: hidden;">Override&nbsp;</label>
                    <input type="checkbox" name="flags.perfect-vision.active">
                </div>
                <p class="notes">If enabled, lighting and vision of the area below is controlled by the following settings.</p>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Parent</label>
                <div class="form-fields">
                    <select name="flags.perfect-vision.parent" style="font-family: monospace;" data-dtype="String">
                        <option value=""></option>
                    </select>
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox" style="visibility: hidden;">Override <input type="checkbox"></label>
                </div>
                <p class="notes">If left blank, the scene is the parent. The settings below default to the parent's setting if <i>Override</i> is unchecked.</p>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Origin</label>
                <div class="form-fields">
                    <label class="grid-label">x</label>
                    <input type="number" name="flags.perfect-vision.origin.x" placeholder="0.5" step="any">
                    <label class="grid-label">y</label>
                    <input type="number" name="flags.perfect-vision.origin.y" placeholder="0.5" step="any">
                    &nbsp;
                    <button class="capture-position" type="button" title="Pick Origin" id="perfect-vision.pickOrigin">
                        <i class="fas fa-crosshairs"></i>
                    </button>
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox" style="visibility: hidden;">Override <input type="checkbox"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Constrained By Walls</label>
                <div class="form-fields">
                    <input type="checkbox" name="flags.perfect-vision.walls" />
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideWalls"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Provides Vision</label>
                <div class="form-fields">
                    <input type="checkbox" name="flags.perfect-vision.vision" />
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideVision"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Unrestricted Vision Range</label>
                <div class="form-fields">
                    <input type="checkbox" name="flags.perfect-vision.globalLight" />
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideGlobalLight"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Sight Limit <span class="units">(Grid Units)</span></label>
                <div class="form-fields">
                    <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number">
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideSightLimit"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Darkness Level</label>
                <div class="form-fields">
                    <input type="range" name="flags.perfect-vision.darkness" min="0" max="1" step="0.05">
                    <span class="range-value">0</span>
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideDarkness"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Saturation Level</label>
                <div class="form-fields">
                    <label class="checkbox">
                        <input type="checkbox" id="perfect-vision.hasSaturation">
                    </label>
                    <input type="range" name="flags.perfect-vision.saturation" min="0" max="1" step="0.05">
                    <span class="range-value">0</span>
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideSaturation"></label>
                </div>
            </div>
            <div class="form-group">
                <label style="flex:${flex};">Vision Limitation Threshold</label>
                <div class="form-fields">
                    <label class="checkbox">
                        <input type="checkbox" id="perfect-vision.hasGlobalThreshold">
                    </label>
                    <input type="range" name="flags.perfect-vision.globalLightThreshold" min="0" max="1" step="0.05">
                    <span class="range-value">0</span>
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.overrideGlobalThreshold"></label>
                </div>
            </div>
        </div>`);

    const select = html.find(`select[name="flags.perfect-vision.parent"]`);
    const black = select.css("color") || "black";

    for (const area of canvas.scene.drawings.map(document => document.object).filter(a => a !== drawing).sort((a, b) => a.id.localeCompare(b.id))) {
        let current = area.id;
        let disabled = false;

        while (current) {
            if (current === drawing.id) {
                disabled = true;
                break;
            }

            current = canvas.drawings.get(current)?.document.getFlag("perfect-vision", "parent");
        }

        if (disabled) {
            select.append(`<option value="${area.id}" disabled>${area.id}</id>`);
        } else {
            select.append(`<option value="${area.id}" style="color: ${!area._pv_active ? "red" : black};">${area.id}</id>`);
        }
    }

    html.find(`label[id="perfect-vision.id"]`).css("color", drawing._pv_active ? "unset" : "red");
    html.find(`button[id="perfect-vision.resetDefaults"]`)
        .on("click", resetDefaults.bind(sheet));
    html.find(`input[name="flags.perfect-vision.active"]`)
        .attr("checked", document.getFlag("perfect-vision", "active"));
    html.find(`select[name="flags.perfect-vision.parent"]`)
        .val(document.getFlag("perfect-vision", "parent") ?? "");
    html.find(`select[name="flags.perfect-vision.parent"]`)
        .css("color", canvas.drawings.get(document.getFlag("perfect-vision", "parent") ?? "")?._pv_active !== false ? "unset" : "red");
    html.find(`input[name="flags.perfect-vision.origin.x"]`)
        .attr("value", document.getFlag("perfect-vision", "origin.x"));
    html.find(`input[name="flags.perfect-vision.origin.y"]`)
        .attr("value", document.getFlag("perfect-vision", "origin.y"));
    html.find(`button[id="perfect-vision.pickOrigin"]`)
        .on("click", pickOrigin.bind(sheet));
    html.find(`select[name="flags.perfect-vision.type"]`)
        .val(document.getFlag("perfect-vision", "type") ?? "");
    html.find(`input[id="perfect-vision.overrideWalls"]`)
        .attr("checked", document.getFlag("perfect-vision", "walls") !== undefined);
    html.find(`input[name="flags.perfect-vision.walls"]`)
        .attr("checked", document.getFlag("perfect-vision", "walls"));
    html.find(`input[id="perfect-vision.overrideVision"]`)
        .attr("checked", document.getFlag("perfect-vision", "vision") !== undefined);
    html.find(`input[name="flags.perfect-vision.vision"]`)
        .attr("checked", document.getFlag("perfect-vision", "vision"));
    html.find(`input[id="perfect-vision.overrideGlobalLight"]`)
        .attr("checked", document.getFlag("perfect-vision", "globalLight") !== undefined);
    html.find(`input[name="flags.perfect-vision.globalLight"]`)
        .attr("checked", document.getFlag("perfect-vision", "globalLight"));
    html.find(`input[id="perfect-vision.overrideSightLimit"]`)
        .attr("checked", document.getFlag("perfect-vision", "sightLimit") !== undefined);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));
    html.find(`input[id="perfect-vision.overrideDarkness"]`)
        .attr("checked", document.getFlag("perfect-vision", "darkness") !== undefined);
    html.find(`input[name="flags.perfect-vision.darkness"]`).next()
        .html(document.getFlag("perfect-vision", "darkness") ?? 0)
    html.find(`input[name="flags.perfect-vision.darkness"]`)
        .attr("value", document.getFlag("perfect-vision", "darkness") ?? 0);
    html.find(`input[id="perfect-vision.overrideSaturation"]`)
        .attr("checked", document.getFlag("perfect-vision", "saturation") !== undefined);
    html.find(`input[id="perfect-vision.hasSaturation"]`)
        .attr("checked", Number.isFinite(document.getFlag("perfect-vision", "saturation")));
    html.find(`input[name="flags.perfect-vision.saturation"]`).next()
        .html(document.getFlag("perfect-vision", "saturation") ?? 0)
    html.find(`input[name="flags.perfect-vision.saturation"]`)
        .attr("value", document.getFlag("perfect-vision", "saturation") ?? 0);
    html.find(`input[id="perfect-vision.overrideGlobalThreshold"]`)
        .attr("checked", document.getFlag("perfect-vision", "globalLightThreshold") !== undefined);
    html.find(`input[id="perfect-vision.hasGlobalThreshold"]`)
        .attr("checked", Number.isFinite(document.getFlag("perfect-vision", "globalLightThreshold")));
    html.find(`input[name="flags.perfect-vision.globalLightThreshold"]`).next()
        .html(document.getFlag("perfect-vision", "globalLightThreshold") ?? 0)
    html.find(`input[name="flags.perfect-vision.globalLightThreshold"]`)
        .attr("value", document.getFlag("perfect-vision", "globalLightThreshold") ?? 0);

    const addColorSetting = (name, label) => {
        const defaultColor = "#" + ("000000" + CONFIG.Canvas[name].toString(16)).slice(-6);

        html.find(`input[name="flags.perfect-vision.darkness"]`).parent().parent().before(`\
            <div class="form-group">
                <label style="flex:${flex};">${label}</label>
                <div class="form-fields">
                    <input type="text" name="flags.perfect-vision.${name}" placeholder="Default (${defaultColor})" data-dtype="String">
                    <input type="color" data-edit="flags.perfect-vision.${name}">
                    &nbsp;&nbsp;&nbsp;
                    <label class="checkbox">Override <input type="checkbox" id="perfect-vision.override${name.capitalize()}"></label>
                </div>
            </div>`);
        html.find(`input[id="perfect-vision.override${name.capitalize()}"]`)
            .attr("checked", document.getFlag("perfect-vision", name) !== undefined);
        html.find(`input[name="flags.perfect-vision.${name}"]`)
            .attr("value", document.getFlag("perfect-vision", name) ?? "");
        html.find(`input[name="flags.perfect-vision.${name}"]`).next()
            .attr("value", document.getFlag("perfect-vision", name) || defaultColor)
    };

    addColorSetting("daylightColor", "Daylight Color");
    addColorSetting("darknessColor", "Darkness Color");

    if (sheet._pv_resetDefaults) {
        sheet._pv_resetDefaults = false;
        sheet._tabs[0].activate("perfect-vision.lighting");
    }

    sheet.options.height = "auto";
    sheet.position.width = Math.max(sheet.position.width, 600);
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

Hooks.on("renderDrawingHUD", (hud, html, data) => {
    const toggle = document.createElement("div");

    toggle.classList.add("control-icon");

    if (data?.flags?.["perfect-vision"]?.active) {
        toggle.classList.add("active");
    }

    toggle.setAttribute("title", "Toggle Lighting");
    toggle.dataset.action = "perfect-vision.toggle";
    toggle.innerHTML = `<i class="far fa-lightbulb"></i>`;

    html.find(".col.left").append(toggle);
    html.find(`.control-icon[data-action="perfect-vision.toggle"]`).click(async event => {
        await hud.object.document.setFlag("perfect-vision", "active", !data?.flags?.["perfect-vision"]?.active);
        hud.render(true);
    })
});

let pickerOverlay;

Hooks.on("canvasInit", () => {
    if (pickerOverlay) {
        pickerOverlay.destroy(true);
    }

    pickerOverlay = new PIXI.Container();
    pickerOverlay.hitArea = canvas.dimensions.rect;
    pickerOverlay.cursor = "crosshair";
    pickerOverlay.interactive = true;
    pickerOverlay.zIndex = Infinity;
    pickerOverlay.on("remove", () => pickerOverlay.off("pick"));
    pickerOverlay.on("click", event => {
        pickerOverlay.emit("pick", event.data.getLocalPosition(pickerOverlay));
        pickerOverlay.parent.removeChild(pickerOverlay);
    })
});

Hooks.once("init", () => {
    patch("SceneConfig.prototype._onChangeInput", "WRAPPER", async function (wrapped, event, ...args) {
        if (!this.object.isView) {
            return await wrapped(event, ...args);
        }

        const target = event.target;
        let name = target.name || target.id;

        if (target.type === "color" && target.dataset.edit?.startsWith("flags.perfect-vision.")) {
            name = target.dataset.edit;
            target.form.elements[name].value = target.value;
        }

        canvas.lighting._pv_preview = {};
        canvas.lighting._pv_preview.daylightColor = this.form.elements["flags.perfect-vision.daylightColor"].value;
        canvas.lighting._pv_preview.darknessColor = this.form.elements["flags.perfect-vision.darknessColor"].value;
        canvas.lighting._pv_preview.darkness = Number(this.form.elements["darkness"].value);

        if (this.form.elements["perfect-vision.hasSaturation"].checked) {
            canvas.lighting._pv_preview.saturation = Number(this.form.elements["flags.perfect-vision.saturation"].value);
        } else {
            canvas.lighting._pv_preview.saturation = null;
        }

        // TODO: preview globalLight, globalLightThreshold, and sightLimit

        const result = await wrapped(event, ...args);

        if (name === "flags.perfect-vision.daylightColor" ||
            name === "flags.perfect-vision.darknessColor" ||
            name === "perfect-vision.hasSaturation" ||
            name === "flags.perfect-vision.saturation" && this.form.elements["perfect-vision.hasSaturation"].checked) {
            canvas.lighting.refresh({ darkness: canvas.lighting._pv_preview.darkness });
        }

        canvas.lighting._pv_preview = null;

        return result;
    });

    patch("SceneConfig.prototype._getSubmitData", "POST", function (data) {
        if (!this.form.elements["perfect-vision.hasSaturation"].checked) {
            data["flags.perfect-vision.saturation"] = null;
        }

        if (this.object?.data.flags?.["perfect-vision"] && "forceSaturation" in this.object.data.flags["perfect-vision"]) {
            data["flags.perfect-vision.-=forceSaturation"] = null;
        }

        return data;
    });

    patch("SceneConfig.prototype.close", "POST", async function (result) {
        await result;

        canvas.perception.schedule({
            lighting: { initialize: true, refresh: true },
            sight: { initialize: true, refresh: true }
        });
    });

    patch("DrawingConfig.prototype._onChangeInput", "WRAPPER", async function (wrapped, event, ...args) {
        if (!game.user.isGM) {
            return await wrapped(event, ...args);
        }

        const document = this.object;

        if (!document?.parent?.isView) {
            return await wrapped(event, ...args);
        }

        const drawing = document.object;

        if (!drawing) {
            return await wrapped(event, ...args);
        }

        const target = event.target;
        let name = target.name || target.id;

        if (target.type === "color" && target.dataset.edit?.startsWith("flags.perfect-vision.")) {
            name = target.dataset.edit;
            target.form.elements[name].value = target.value;
        }

        drawing._pv_preview = {};
        drawing._pv_preview.active = this.form.elements["flags.perfect-vision.active"].checked;

        if (drawing._pv_preview.active) {
            drawing._pv_preview.parent = this.form.elements["flags.perfect-vision.parent"].value;

            const x = this.form.elements["flags.perfect-vision.origin.x"].value ?? "";
            const y = this.form.elements["flags.perfect-vision.origin.y"].value ?? "";

            drawing._pv_preview.origin = {
                x: x !== "" ? Number(x) : 0.5,
                y: y !== "" ? Number(y) : 0.5,
            };

            if (this.form.elements["perfect-vision.overrideWalls"].checked) {
                drawing._pv_preview.walls = this.form.elements["flags.perfect-vision.walls"].checked;
            } else {
                drawing._pv_preview.walls = undefined;
            }

            if (this.form.elements["perfect-vision.overrideVision"].checked) {
                drawing._pv_preview.vision = this.form.elements["flags.perfect-vision.vision"].checked;
            } else {
                drawing._pv_preview.vision = undefined;
            }

            if (this.form.elements["perfect-vision.overrideGlobalLight"].checked) {
                drawing._pv_preview.globalLight = this.form.elements["flags.perfect-vision.globalLight"].checked;
            } else {
                drawing._pv_preview.globalLight = undefined;
            }

            if (this.form.elements["perfect-vision.overrideSightLimit"].checked) {
                drawing._pv_preview.sightLimit = this.form.elements["flags.perfect-vision.sightLimit"].value;
            } else {
                drawing._pv_preview.sightLimit = undefined;
            }

            if (this.form.elements["perfect-vision.overrideDaylightColor"].checked) {
                drawing._pv_preview.daylightColor = this.form.elements["flags.perfect-vision.daylightColor"].value;
            } else {
                drawing._pv_preview.daylightColor = undefined;
            }

            if (this.form.elements["perfect-vision.overrideDarknessColor"].checked) {
                drawing._pv_preview.darknessColor = this.form.elements["flags.perfect-vision.darknessColor"].value;
            } else {
                drawing._pv_preview.darknessColor = undefined;
            }

            if (this.form.elements["perfect-vision.overrideDarkness"].checked) {
                drawing._pv_preview.darkness = Number(this.form.elements["flags.perfect-vision.darkness"].value);
            }

            if (this.form.elements["perfect-vision.overrideSaturation"].checked) {
                if (this.form.elements["perfect-vision.hasSaturation"].checked) {
                    drawing._pv_preview.saturation = Number(this.form.elements["flags.perfect-vision.saturation"].value);
                } else {
                    drawing._pv_preview.saturation = null;
                }
            } else {
                drawing._pv_preview.saturation = undefined;
            }

            if (this.form.elements["perfect-vision.overrideGlobalThreshold"].checked) {
                if (this.form.elements["perfect-vision.hasGlobalThreshold"].checked) {
                    drawing._pv_preview.globalLightThreshold = Number(this.form.elements["flags.perfect-vision.globalLightThreshold"].value);
                } else {
                    drawing._pv_preview.globalLightThreshold = null;
                }
            } else {
                drawing._pv_preview.globalLightThreshold = undefined;
            }
        }

        const result = await wrapped(event, ...args);

        if (!name || name === "flags.perfect-vision.active" ||
            this.form.elements["flags.perfect-vision.active"].checked && (
                name === "flags.perfect-vision.parent" ||
                name === "flags.perfect-vision.origin.x" ||
                name === "flags.perfect-vision.origin.y" ||
                name === "perfect-vision.overrideVision" ||
                name === "perfect-vision.overrideWalls" ||
                name === "flags.perfect-vision.walls" && this.form.elements["perfect-vision.overrideWalls"].checked ||
                name === "flags.perfect-vision.vision" && this.form.elements["perfect-vision.overrideVision"].checked ||
                name === "perfect-vision.overrideGlobalLight" ||
                name === "flags.perfect-vision.globalLight" && this.form.elements["perfect-vision.overrideGlobalLight"].checked ||
                name === "perfect-vision.overrideSightLimit" ||
                name === "flags.perfect-vision.sightLimit" && this.form.elements["perfect-vision.overrideSightLimit"].checked ||
                name === "perfect-vision.overrideDaylightColor" ||
                name === "flags.perfect-vision.daylightColor" && this.form.elements["perfect-vision.overrideDaylightColor"].checked ||
                name === "perfect-vision.overrideDarknessColor" ||
                name === "flags.perfect-vision.darknessColor" && this.form.elements["perfect-vision.overrideDarknessColor"].checked ||
                name === "perfect-vision.overrideDarkness" ||
                name === "flags.perfect-vision.darkness" && this.form.elements["perfect-vision.overrideDarkness"].checked ||
                name === "perfect-vision.overrideSaturation" ||
                name === "perfect-vision.hasSaturation" && this.form.elements["perfect-vision.overrideSaturation"].checked ||
                name === "flags.perfect-vision.saturation" && this.form.elements["perfect-vision.overrideSaturation"].checked && this.form.elements["perfect-vision.hasSaturation"].checked ||
                name === "perfect-vision.overrideGlobalThreshold" ||
                name === "perfect-vision.hasGlobalThreshold" && this.form.elements["perfect-vision.overrideGlobalThreshold"].checked ||
                name === "flags.perfect-vision.globalLightThreshold" && this.form.elements["perfect-vision.hasGlobalThreshold"].checked && this.form.elements["perfect-vision.overrideGlobalThreshold"].checked)) {
            canvas.lighting.refresh();
        }

        $(this.form).find(`label[id="perfect-vision.id"]`).css("color", drawing._pv_active ? "unset" : "red");
        $(this.form).find(`select[name="flags.perfect-vision.parent"]`)
            .css("color", drawing._pv_parent?._pv_active !== false ? "unset" : "red");

        drawing._pv_preview = null;

        return result;
    });

    patch("DrawingConfig.prototype._getSubmitData", "POST", function (data) {
        if (!game.user.isGM) {
            return data;
        }

        const document = this.object;

        if (!document?.parent) {
            return data;
        }

        const drawing = document.object;

        if (!drawing) {
            return data;
        }

        const parent = data["flags.perfect-vision.parent"];

        if (!parent) {
            data["flags.perfect-vision.parent"] = "";
        } else {
            let current = parent;

            while (current) {
                if (current === this.object.id) {
                    data["flags.perfect-vision.parent"] = "";
                    break;
                }

                current = canvas.drawings.get(current)?.document.getFlag("perfect-vision", "parent");
            }
        }

        if (data["flags.perfect-vision.origin.x"] == null) {
            data["flags.perfect-vision.origin.x"] = 0.5;
        }

        if (data["flags.perfect-vision.origin.y"] == null) {
            data["flags.perfect-vision.origin.y"] = 0.5;
        }

        if (!this.form.elements["perfect-vision.overrideWalls"].checked) {
            delete data["flags.perfect-vision.walls"];

            if (document.data.flags?.["perfect-vision"] && "walls" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=walls"] = null;
            }
        }

        if (!this.form.elements["perfect-vision.overrideVision"].checked) {
            delete data["flags.perfect-vision.vision"];

            if (document.data.flags?.["perfect-vision"] && "vision" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=vision"] = null;
            }
        }

        if (!this.form.elements["perfect-vision.overrideGlobalLight"].checked) {
            delete data["flags.perfect-vision.globalLight"];


            if (document.data.flags?.["perfect-vision"] && "globalLight" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=globalLight"] = null;
            }
        }

        if (!this.form.elements["perfect-vision.overrideSightLimit"].checked) {
            delete data["flags.perfect-vision.sightLimit"];

            if (document.data.flags?.["perfect-vision"] && "sightLimit" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=sightLimit"] = null;
            }
        }

        if (!this.form.elements["perfect-vision.overrideDaylightColor"].checked) {
            delete data["flags.perfect-vision.daylightColor"];

            if (document.data.flags?.["perfect-vision"] && "daylightColor" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=daylightColor"] = null;
            }
        } else if (!data["flags.perfect-vision.daylightColor"]) {
            data["flags.perfect-vision.daylightColor"] = "";
        }

        if (!this.form.elements["perfect-vision.overrideDarknessColor"].checked) {
            delete data["flags.perfect-vision.darknessColor"];

            if (document.data.flags?.["perfect-vision"] && "darknessColor" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=darknessColor"] = null;
            }
        } else if (!data["flags.perfect-vision.darknessColor"]) {
            data["flags.perfect-vision.darknessColor"] = "";
        }

        if (!this.form.elements["perfect-vision.overrideDarkness"].checked) {
            delete data["flags.perfect-vision.darkness"];

            if (document.data.flags?.["perfect-vision"] && "darkness" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=darkness"] = null;
            }
        }

        if (!this.form.elements["perfect-vision.overrideSaturation"].checked) {
            delete data["flags.perfect-vision.saturation"];

            if (document.data.flags?.["perfect-vision"] && "saturation" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=saturation"] = null;
            }
        } else if (!this.form.elements["perfect-vision.hasSaturation"].checked) {
            data["flags.perfect-vision.saturation"] = null;
        }

        if (!this.form.elements["perfect-vision.overrideGlobalThreshold"].checked) {
            delete data["flags.perfect-vision.globalLightThreshold"];

            if (document.data.flags?.["perfect-vision"] && "globalLightThreshold" in document.data.flags?.["perfect-vision"]) {
                data["flags.perfect-vision.-=globalLightThreshold"] = null;
            }
        } else if (!this.form.elements["perfect-vision.hasGlobalThreshold"].checked) {
            data["flags.perfect-vision.globalLightThreshold"] = null;
        }

        return data;
    });

    patch("DrawingConfig.prototype.close", "POST", async function (result) {
        await result;

        if (!game.user.isGM) {
            return;
        }

        if (pickerOverlay.parent) {
            pickerOverlay.parent.removeChild(pickerOverlay);
        }

        canvas.perception.schedule({
            lighting: { initialize: true, refresh: true },
            sight: { initialize: true, refresh: true }
        });
    });

    patch("AmbientLightConfig.prototype._getSubmitData", "POST", function (data) {
        if (!this.form.elements["perfect-vision.overrideSightLimit"].checked) {
            delete data["flags.perfect-vision.sightLimit"];

            data["flags.perfect-vision.-=sightLimit"] = null;
        }

        return data;
    });

    patch("MeasuredTemplateConfig.prototype._getSubmitData", "POST", function (data) {
        if (!game.user.isGM) {
            return data;
        }

        if (!this.form.elements["perfect-vision.overrideSightLimit"].checked) {
            delete data["flags.perfect-vision.sightLimit"];

            data["flags.perfect-vision.-=sightLimit"] = null;
        }

        return data;
    });
});
