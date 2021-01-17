import { extend } from "./extend.js";
import * as Filters from "./filters.js";
import { migrateAll, migrateToken, migrateActor, migrateScene, migrateWorldSettings, migrateClientSettings, versions as migrationVersions } from "./migrate.js";
import { patch } from "./patch.js";

class PerfectVision {
    static _settings;

    static _visionRulesPresets = {
        "fvtt": {
            dimVisionInDarkness: "dim",
            dimVisionInDimLight: "dim",
            brightVisionInDarkness: "bright",
            brightVisionInDimLight: "bright"
        },
        "dnd35e": {
            dimVisionInDarkness: "darkness",
            dimVisionInDimLight: "dim",
            brightVisionInDarkness: "bright_mono",
            brightVisionInDimLight: "dim"
        },
        "dnd5e": {
            dimVisionInDarkness: "dim_mono",
            dimVisionInDimLight: "bright",
            brightVisionInDarkness: "bright",
            brightVisionInDimLight: "bright"
        },
        "pf1e": {
            dimVisionInDarkness: "darkness",
            dimVisionInDimLight: "dim",
            brightVisionInDarkness: "bright_mono",
            brightVisionInDimLight: "dim"
        },
        "pf2e": {
            dimVisionInDarkness: "darkness",
            dimVisionInDimLight: "bright",
            brightVisionInDarkness: "bright_mono",
            brightVisionInDimLight: "bright"
        },
    };

    static _updateSettings() {
        this._settings = this._settings ?? {};
        this._settings.globalLight = game.settings.get("perfect-vision", "globalLight");
        this._settings.improvedGMVision = game.settings.get("perfect-vision", "improvedGMVision");
        this._settings.visionRules = game.settings.get("perfect-vision", "visionRules");

        if (this._settings.visionRules === "custom") {
            this._settings.dimVisionInDarkness = game.settings.get("perfect-vision", "dimVisionInDarkness");
            this._settings.dimVisionInDimLight = game.settings.get("perfect-vision", "dimVisionInDimLight");
            this._settings.brightVisionInDarkness = game.settings.get("perfect-vision", "brightVisionInDarkness");
            this._settings.brightVisionInDimLight = game.settings.get("perfect-vision", "brightVisionInDimLight");
        } else {
            Object.assign(this._settings, this._visionRulesPresets[this._settings.visionRules]);
        }

        this._settings.monoVisionColor = game.settings.get("perfect-vision", "monoVisionColor") || "#ffffff";
        this._settings.monoTokenIcons = game.settings.get("perfect-vision", "monoTokenIcons");
        this._settings.monoSpecialEffects = game.settings.get("perfect-vision", "monoSpecialEffects");
        this._settings.fogOfWarWeather = game.settings.get("perfect-vision", "fogOfWarWeather");
        this._settings.actualFogOfWar = game.settings.get("perfect-vision", "actualFogOfWar");
    }

    static _isReady = false;

    static _update({ settings = false, refresh = false, filters = false, placeables = null, tokens = null, layers = null, fog = false, migrate = null } = {}) {
        if (!this._isReady)
            return;

        if (settings)
            this._updateSettings();

        if (refresh) {
            this._refreshLighting = true;
            this._refreshSight = true;
        }

        if (migrate === "world") {
            migrateWorldSettings().then((...args) => this._onMigration(...args));
        } else if (migrate === "client") {
            migrateClientSettings().then((...args) => this._onMigration(...args));
        }

        if (!canvas?.ready)
            return;

        if (filters)
            this._updateFilters({ layers: layers, placeables: placeables ?? tokens });

        if (tokens)
            for (const token of tokens)
                token.updateSource({ defer: true });

        if (fog)
            this._updateFog();
    }

    static _init() {
        this._registerHooks();
        this._registerSettings();
    }

    static _registerSettings() {
        game.settings.register("perfect-vision", "globalLight", {
            name: "Global Illumination Light",
            hint: "This setting affects only scenes with Global Illumination. If set to Dim (Bright) Light, the entire scene is illuminated with dim (bright) light and, if set to Scene Darkness, the scene is illuminated according to the scene's Darkness Level only. Each scene can also be configured individually. You can find this setting next to Global Illumination in the scene configuration.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
                "none": "Scene Darkness",
            },
            default: "dim",
            onChange: () => this._update({ settings: true, refresh: true })
        });

        game.settings.register("perfect-vision", "improvedGMVision", {
            name: "Improved GM Vision",
            hint: "Improves the visibility in darkness for the GM massively while lit areas of the scene are still rendered normally.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ settings: true, refresh: game.user.isGM })
        });

        game.settings.register("perfect-vision", "visionRules", {
            name: "Vision Rules",
            hint: "Choose one of the presets, or select Custom and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the Vision tab. Dim (Bright) Vision in Darkness controls what dim (bright) vision looks like in darkness, i.e., in areas that are not illuminated by light sources. Dim (Bright) Vision in Dim Light controls how dim (bright) vision interacts with dim light, i.e., if dim light becomes bright light or not. Scene Darkness is the level of darkness in areas without light sources. It's the darkness controlled by Darkness Level in the scene configuration. Total Darkness means no vision at all. Select an option with monochrome to create vision without color in darkness. It's grayscale vision as long as the Monochrome Vision Color is white. If the scene's Darkness Level is 0, it looks the same as it would with non-monochrome vision. But as the Darkness Level increases the saturation decreases accordingly.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "custom": "Custom",
                "fvtt": "Foundry VTT",
                "dnd35e": "Dungeons & Dragons 3.5e",
                "dnd5e": "Dungeons & Dragons 5e",
                "pf1e": "Pathfinder 1e",
                "pf2e": "Pathfinder 2e",
            },
            default: game.system.id === "dnd5e" ? "dnd5e" : (game.system.id === "pf1" ? "pf1e" : (game.system.id === "pf2e" ? "pf2e" : (game.system.id === "D35E" ? "dnd35e" : "fvtt"))),
            onChange: () => this._update({ settings: true, refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "dimVisionInDarkness", {
            name: "Dim Vision in Darkness",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "bright_mono": "Bright Light (monochrome)",
                "dim": "Dim Light",
                "dim_mono": "Dim Light (monochrome)",
                "scene": "Scene Darkness",
                "scene_mono": "Scene Darkness (monochrome)",
                "darkness": "Total Darkness",
            },
            default: "dim",
            onChange: () => this._update({ settings: true, refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "dimVisionInDimLight", {
            name: "Dim Vision in Dim Light",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
            },
            default: "dim",
            onChange: () => this._update({ settings: true, refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "brightVisionInDarkness", {
            name: "Bright Vision in Darkness",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "bright_mono": "Bright Light (monochrome)",
                "dim": "Dim Light",
                "dim_mono": "Dim Light (monochrome)",
                "scene": "Scene Darkness",
                "scene_mono": "Scene Darkness (monochrome)",
                "darkness": "Total Darkness",
            },
            default: "bright",
            onChange: () => this._update({ settings: true, refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "brightVisionInDimLight", {
            name: "Bright Vision in Dim Light",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
            },
            default: "bright",
            onChange: () => this._update({ settings: true, refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "monoVisionColor", {
            name: "Monochrome Vision Color",
            hint: "Set this color to anything other than white to make monochrome vision stand out visibly in darkness. For example, choose a green tone to make it look like night vision goggles. This setting affects only scenes without Global Illumination. You can also choose a color for each token individually in the token configuration under the Vision tab.",
            scope: "world",
            config: true,
            type: String,
            default: "#ffffff",
            onChange: () => this._update({ settings: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "monoTokenIcons", {
            name: "Monochrome Token Icons",
            hint: "If enabled, token icons are affected by monochrome vision. Otherwise, they are not.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ settings: true, filters: true })
        });

        game.settings.register("perfect-vision", "monoSpecialEffects", {
            name: "Monochrome Special Effects",
            hint: "If enabled, FXMaster's and Token Magic FX's special effects are affected by monochrome vision. Otherwise, they are not. Special effects attached to tokens are only affected by this setting if Monochrome Token Icons is enabled as well.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ settings: true, filters: true })
        });

        game.settings.register("perfect-vision", "fogOfWarWeather", {
            name: "Fog of War Weather",
            hint: "If enabled, weather effects are visible in the fog of war. Otherwise, weather is only visible in line-of-sight.",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this._update({ settings: true, filters: true, fog: true })
        });

        game.settings.register("perfect-vision", "actualFogOfWar", {
            name: "Actual Fog of War",
            hint: "If enabled, the fog of war is overlaid with a fog effect.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ settings: true, fog: true })
        });

        game.settings.register("perfect-vision", "_version", {
            name: "World Settings Version",
            hint: "World Settings Version",
            scope: "world",
            config: false,
            type: Number,
            default: 0,
            onChange: () => this._update({ migrate: "world" })
        });

        game.settings.register("perfect-vision", "_clientVersion", {
            name: "Client Settings Version",
            hint: "Client Settings Version",
            scope: "client",
            config: false,
            type: Number,
            default: 0,
            onChange: () => this._update({ migrate: "client" })
        });
    }

    static _setup() {
        if (game.modules.get("fxmaster")?.active) {
            patch("Canvas.layers.fxmaster.prototype.addChild", "POST", function () {
                PerfectVision._update({ filters: true, layers: ["fxmaster"] });
                return arguments[0];
            });
            Hooks.on("switchFilter", () => PerfectVision._update({ filters: true, layers: ["fxmaster"] }));
            Hooks.on("switchWeather", () => PerfectVision._update({ filters: true, layers: ["fxmaster"] }));
            Hooks.on("updateWeather", () => PerfectVision._update({ filters: true, layers: ["fxmaster"] }));
        }
    }

    static _updated = true;

    static _onMigration(migrated) {
        if (!migrated)
            return;

        if (this._updated) {
            this._updated = false;
            canvas.app.ticker.addOnce(this._canvasReady, this);
        }
    }

    static async _ready() {
        await migrateAll().then((...args) => this._onMigration(...args));

        this._isReady = true;

        this._canvasReady();

        canvas.app.ticker.add(this._onTick, this, PIXI.UPDATE_PRIORITY.LOW + 2);
    }

    static _canvasReady() {
        this._updated = true;

        if (!this._isReady)
            return;

        this._update({ settings: true, refresh: true, filters: true, tokens: canvas.tokens.placeables, fog: true });
    }

    static _lightingRefresh() {
        this._refreshLighting = false;

        const ilm = canvas.lighting.illumination;
        const ilm_ = extend(ilm);

        if (game.user.isGM && this._settings?.improvedGMVision && canvas.sight.sources.size === 0) {
            const s = 1 / Math.max(...canvas.lighting.channels.background.rgb);
            ilm_.background.tint = rgbToHex(canvas.lighting.channels.background.rgb.map(c => c * s));
            ilm_.background.visible = true;
        } else {
            ilm_.background.visible = false;
        }

        ilm_.visionBackground.tint = rgbToHex(this._grayscale(canvas.lighting.channels.background.rgb));

        const sight = canvas.sight;
        const sight_ = extend(sight);

        if (sight_.fog?.weatherEffect)
            sight_.fog.weatherEffect._updateParticleEmitters();
    }

    static _sightRefresh() {
        this._refreshSight = false;

        const ilm = canvas.lighting.illumination;
        const ilm_ = extend(ilm);

        if (game.user.isGM && this._settings?.improvedGMVision && canvas.sight.sources.size === 0) {
            ilm_.background.visible = true;
        } else {
            ilm_.background.visible = false;
        }

        this._update({ filters: true });
    }

    static async _updateToken(scene, data, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateToken(new Token(data, scene)).then((...args) => this._onMigration(...args));

        const token = canvas.tokens.get(data._id);

        if (token) {
            this._update({ refresh: true, filters: true, tokens: [token] });
        }
    }

    static async _updateActor(actor, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateActor(actor).then((...args) => this._onMigration(...args));
    }

    static async _updateScene(scene, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision")) {
            if (scene.id === canvas.scene?.id)
                this._update({ filters: true });

            return;
        }

        await migrateScene(scene).then((...args) => this._onMigration(...args));

        if (scene.id !== canvas.scene?.id)
            return;

        this._update({ refresh: true, filters: true, tokens: canvas.tokens.placeables, fog: true });
    }

    static _renderConfigTemplate = Handlebars.compile(`\
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

    static _renderConfigTemplate2 = Handlebars.compile(`\
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

    static _renderSettingsConfig(sheet, html, data) {
        console.assert(this._settings);

        let prefix = "perfect-vision";

        const settings = Array.from(game.settings.settings.values()).filter(
            s => s.module === "perfect-vision");

        if (sheet instanceof TokenConfig) {
            const token = sheet.object;
            prefix = `flags.${prefix}`;

            const config = this._renderConfigTemplate({
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
                        s.value = token.getFlag(s.module, s.key) ?? "default";
                    } else {
                        s.value = token.getFlag(s.module, s.key);
                    }

                    return s;
                })
            }, {
                allowProtoMethodsByDefault: true,
                allowProtoPropertiesByDefault: true
            });

            html.find(`input[name="vision"]`).parent().after(config);
            $(config).on("change", "input,select,textarea", sheet._onChangeInput.bind(sheet));

            const config2 = this._renderConfigTemplate2({
                settings: [{
                    module: "perfect-vision",
                    key: "sightLimit",
                    value: token.getFlag("perfect-vision", "sightLimit"),
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

        const colorInput = document.createElement("input");
        colorInput.setAttribute("type", "color");
        colorInput.setAttribute("value", html.find(`input[name="${prefix}.monoVisionColor"]`).val());
        colorInput.setAttribute("data-edit", `${prefix}.monoVisionColor`);

        html.find(`input[name="${prefix}.monoVisionColor"]`).after(colorInput)
        $(colorInput).on("change", sheet._onChangeInput.bind(sheet));

        const defaultVisionRules = settings.find(s => s.key === "visionRules").choices[this._settings.visionRules];

        html.find(`select[name="${prefix}.visionRules"] > option[value="default"]`).html(`Default (${defaultVisionRules})`);

        const inputMonochromeVisionColor = html.find(`input[name="${prefix}.monoVisionColor"]`);
        inputMonochromeVisionColor.attr("class", "color");

        if (sheet instanceof TokenConfig)
            inputMonochromeVisionColor.attr("placeholder", `Default (${this._settings.monoVisionColor})`);
        else
            inputMonochromeVisionColor.attr("placeholder", `#ffffff`);

        if (sheet instanceof TokenConfig) {
            if (sheet.object.scene) {
                const defaultSightLimit = sheet.object.scene.getFlag("perfect-vision", "sightLimit");
                html.find(`input[name="${prefix}.sightLimit"]`).attr("placeholder", `Scene Default (${defaultSightLimit ?? "Unlimited"})`);
            } else {
                html.find(`input[name="${prefix}.sightLimit"]`).attr("placeholder", "Unlimited");
            }
        }

        const update = () => {
            const visionRules = html.find(`select[name="${prefix}.visionRules"]`).val();

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
                html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val(this._settings.dimVisionInDarkness);
                html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val(this._settings.dimVisionInDimLight);
                html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val(this._settings.brightVisionInDarkness);
                html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val(this._settings.brightVisionInDimLight);
            } else if (visionRules !== "custom") {
                html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val(this._visionRulesPresets[visionRules].dimVisionInDarkness);
                html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val(this._visionRulesPresets[visionRules].dimVisionInDimLight);
                html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val(this._visionRulesPresets[visionRules].brightVisionInDarkness);
                html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val(this._visionRulesPresets[visionRules].brightVisionInDimLight);
            }

            const inputMonochromeVisionColor = html.find(`input[name="${prefix}.monoVisionColor"]`);
            inputMonochromeVisionColor.next().val(inputMonochromeVisionColor.val() || this._settings.monoVisionColor);

            if (!sheet._minimized)
                sheet.setPosition(sheet.position);
        };

        update();

        html.find(`select[name="${prefix}.visionRules"]`).change(update);
        html.find(`button[name="reset"]`).click(update);

        if (sheet instanceof TokenConfig) {
            const version = document.createElement("input");
            version.setAttribute("type", "hidden");
            version.setAttribute("name", `${prefix}._version`);
            version.setAttribute("value", migrationVersions.token);
            version.setAttribute("data-dtype", "Number");
            html.find(`select[name="${prefix}.visionRules"]`)[0].form.appendChild(version);
        } else {
            const version = document.createElement("input");
            version.setAttribute("type", "hidden");
            version.setAttribute("name", `${prefix}._version`);
            version.setAttribute("value", migrationVersions.world);
            version.setAttribute("data-dtype", "Number");
            html.find(`select[name="${prefix}.visionRules"]`)[0].form.appendChild(version);

            const clientVersion = document.createElement("input");
            clientVersion.setAttribute("type", "hidden");
            clientVersion.setAttribute("name", `${prefix}._clientVersion`);
            clientVersion.setAttribute("value", migrationVersions.client);
            clientVersion.setAttribute("data-dtype", "Number");
            html.find(`select[name="${prefix}.visionRules"]`)[0].form.appendChild(clientVersion);
        }
    }

    static _renderTokenConfig = this._renderSettingsConfig;

    static _renderSceneConfig(sheet, html, data) {
        console.assert(this._settings);

        const globalLight = html.find(`input[name="globalLight"]`);
        const globalLightLabel = globalLight.prev();
        globalLightLabel.after(`<div class="form-fields"></div>`);

        const defaultGlobalLight = Array.from(game.settings.settings.values()).find(
            s => s.module === "perfect-vision" && s.key === "globalLight").choices[this._settings.globalLight];

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
            .val(sheet.object.getFlag("perfect-vision", "globalLight") ?? "default")
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
            .attr("value", sheet.object.getFlag("perfect-vision", "sightLimit"))
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
                .attr("value", sheet.object.getFlag("perfect-vision", name) || defaultColor);
            html.find(`input[name="flags.perfect-vision.${name}"]`)
                .attr("value", sheet.object.getFlag("perfect-vision", name))
                .on("change", sheet._onChangeInput.bind(sheet));
        };

        addColorSetting("daylightColor", "Daylight Color");
        addColorSetting("darknessColor", "Darkness Color");

        const version = document.createElement("input");
        version.setAttribute("type", "hidden");
        version.setAttribute("name", "flags.perfect-vision._version");
        version.setAttribute("value", migrationVersions.scene);
        version.setAttribute("data-dtype", "Number");
        html.find(`input[name="tokenVision"]`)[0].form.appendChild(version);

        if (!sheet._minimized)
            sheet.setPosition(sheet.position);
    }

    static _getSceneControlButtons(controls) {
        const lightingControl = controls.find(c => c.name === "lighting");

        if (lightingControl) {
            let index = lightingControl.tools.findIndex(t => t.name === "clear");

            if (index < 0)
                return;

            lightingControl.tools.splice(index, 0, {
                name: "perfect-vision.improvedGMVision",
                title: "Improved GM Vision",
                icon: "fas fa-eye",
                toggle: true,
                active: !!game.settings.get("perfect-vision", "improvedGMVision"),
                visible: game.user.isGM,
                onClick: toggled => game.settings.set("perfect-vision", "improvedGMVision", toggled),
            });
        }
    }

    static _onTick() {
        if (!canvas?.ready)
            return;

        if (this._refreshLighting)
            canvas.lighting.refresh();

        if (this._refreshSight)
            canvas.sight.refresh();
    }

    static _updateFilters({ layers = null, placeables = null } = {}) {
        Filters.mono.zOrder = Filters.mono.rank = 0;

        if (layers == null && placeables == null) {
            layers = ["background", "effects", "fxmaster"];

            placeables = [
                ...canvas.tokens.placeables,
                ...canvas.tiles.placeables,
                ...canvas.templates.placeables,
            ];

            if (canvas.roofs)
                placeables = [...placeables, canvas.roofs.children];
        }

        if (layers) {
            for (const layerName of layers) {
                const layer = canvas[layerName];

                if (!layer) continue;

                {
                    const monoFilterIndex = layer.filters ? layer.filters.indexOf(Filters.mono) : -1;

                    if (monoFilterIndex >= 0)
                        layer.filters.splice(monoFilterIndex, 1);

                    let object = layer;

                    if (layerName === "background") {
                        const monoFilterIndex = layer.img?.filters ? layer.img.filters.indexOf(Filters.mono) : -1;

                        if (monoFilterIndex >= 0)
                            layer.img.filters.splice(monoFilterIndex, 1);

                        object = layer.img ?? layer;
                    } else if (layerName === "effects" || layerName === "fxmaster") {
                        const monoFilterIndex = layer.weather?.filters ? layer.weather.filters.indexOf(Filters.mono) : -1;

                        if (monoFilterIndex >= 0)
                            layer.weather.filters.splice(monoFilterIndex, 1);

                        if (this._settings.monoSpecialEffects)
                            object = layer;
                        else
                            object = layer.weather;
                    }

                    if (object) {
                        if (object.filters?.length > 0) {
                            object.filters.push(Filters.mono);
                        } else {
                            object.filters = [Filters.mono];
                        }
                    }
                }

                if (layerName === "effects" || layerName === "fxmaster") {
                    const sightFilterIndex = layer.filters ? layer.filters.indexOf(Filters.sight) : -1;

                    if (sightFilterIndex >= 0)
                        layer.filters.splice(sightFilterIndex, 1);

                    for (const child of layer.children) {
                        const sightFilterIndex = child.filters ? child.filters.indexOf(Filters.sight) : -1;

                        if (sightFilterIndex >= 0)
                            child.filters.splice(sightFilterIndex, 1);
                    }

                    let objects;

                    if (this._settings.fogOfWarWeather)
                        objects = layer.children.filter(child => child !== layer.weather && child !== layer.mask);
                    else
                        objects = [layer];

                    for (const object of objects) {
                        if (object.filters?.length > 0) {
                            object.filters.push(Filters.sight);
                        } else {
                            object.filters = [Filters.sight];
                        }
                    }
                }
            }
        }

        if (placeables) {
            for (const placeable of placeables) {
                let sprite;

                if (placeable instanceof Token) {
                    sprite = placeable.icon;
                } else if (placeable instanceof Tile) {
                    sprite = placeable.tile.img;
                } else if (placeable instanceof MeasuredTemplate) {
                    if (placeable.texture)
                        sprite = placeable.template;
                } else if (placeable instanceof PIXI.DisplayObject) {
                    sprite = placeable;
                }

                if (sprite) {
                    if (sprite.filters) {
                        const monoFilterIndex = sprite.filters ? Math.max(
                            sprite.filters.indexOf(Filters.mono),
                            sprite.filters.indexOf(Filters.mono_noAutoFit)) : -1;

                        if (monoFilterIndex >= 0)
                            sprite.filters.splice(monoFilterIndex, 1);
                    }

                    if (placeable instanceof Token && !this._settings.monoTokenIcons)
                        continue;

                    if (placeable instanceof Tile && (placeable.data.flags?.startMarker || placeable.data.flags?.turnMarker))
                        continue;

                    if (sprite.filters?.length > 0) {
                        if (this._settings.monoSpecialEffects)
                            sprite.filters.push(Filters.mono_noAutoFit);
                        else
                            sprite.filters.unshift(Filters.mono_noAutoFit);
                    } else {
                        sprite.filters = [Filters.mono];
                    }

                    if (placeable instanceof MeasuredTemplate) {
                        const sightFilterIndex = sprite.filters ? sprite.filters.indexOf(Filters.sight) : -1;

                        if (sightFilterIndex >= 0)
                            sprite.filters.splice(sightFilterIndex, 1);

                        sprite.filters.push(Filters.sight);
                    }
                }
            }
        }
    }

    static _cloneShader(shader, uniforms = {}) {
        return shader ? new (shader instanceof AbstractBaseShader ? shader.constructor : PIXI.Shader)(
            shader.program, { ...shader.uniforms, ...uniforms }) : null;
    }

    static _linkUniforms(shader1, shader2, except) {
        if (!shader1 && !shader2)
            return null;

        except = Array.isArray(except) ? new Set(except) : except;

        const uniforms = new Proxy(shader1.uniforms, {
            set(target, prop, value, receiver) {
                if (!except || !except.has(prop))
                    shader2.uniforms[prop] = value;
                return Reflect.set(target, prop, value, receiver);
            }
        });

        return new Proxy(shader1, {
            get(target, prop, receiver) {
                if (prop === "uniforms")
                    return uniforms;
                return Reflect.get(target, prop, receiver);
            }
        });
    }

    static _computeFov(source, radius, fovCache = null) {
        if (fovCache && fovCache[radius])
            return fovCache[radius];

        const fovPoints = [];

        if (radius > 0) {
            const d = canvas.dimensions;
            const distance = fovCache?.distance ?? Math.max(
                source.radius,
                Math.hypot(
                    Math.max(source.x, d.width - source.x),
                    Math.max(source.y, d.height - source.y)
                )
            );

            if (fovCache)
                fovCache.distance = distance;

            const limit = Math.clamped(radius / distance, 0, 1);
            const points = source.los.points;

            for (let i = 0; i < points.length; i += 2) {
                const p = { x: points[i], y: points[i + 1] };
                const r = new Ray(source, p);
                const t0 = Math.clamped(r.distance / distance, 0, 1);
                const q = t0 <= limit ? p : r.project(limit / t0);
                fovPoints.push(q)
            }
        }

        const fov = new PIXI.Polygon(...fovPoints);

        if (fovCache)
            fovCache[radius] = fov;

        return fov;
    };

    // Based on FXMaster's FogWeatherEffect
    static _FogEffect = class extends SpecialEffect {
        static get label() {
            return "Fog of War";
        }

        static get effectOptions() {
            const options = super.effectOptions;
            options.density.min = 0.01;
            options.density.value = 0.02;
            options.density.max = 0.10;
            options.density.step = 0.01;
            return options;
        }

        getParticleEmitters() {
            return [this._getFogEmitter(this.parent)];
        }

        _getFogEmitter(parent) {
            const config = this.constructor._getFogEmitterConfig(this.options);
            const art = this.constructor._getFogEmitterArt(this.options);
            const emitter = new PIXI.particles.Emitter(parent, art, config);
            return emitter;
        }

        static _getFogEmitterConfig(options) {
            const density = options.density.value;
            const d = canvas.dimensions;
            const maxParticles =
                Math.ceil((d.width / d.size) * (d.height / d.size) * density);
            const config = mergeObject(
                this.CONFIG,
                {
                    spawnRect: {
                        x: d.paddingX,
                        y: d.paddingY,
                        w: d.sceneWidth,
                        h: d.sceneHeight
                    },
                    maxParticles: maxParticles,
                    frequency: this.CONFIG.lifetime.min / maxParticles
                },
                { inplace: false }
            );
            return config;
        }

        static _getFogEmitterArt(options) {
            return [
                "./modules/perfect-vision/assets/cloud1.png",
                "./modules/perfect-vision/assets/cloud2.png",
                "./modules/perfect-vision/assets/cloud3.png",
                "./modules/perfect-vision/assets/cloud4.png"
            ];
        }

        _updateParticleEmitters() {
            const config = this.constructor._getFogEmitterConfig(this.options);

            this.emitters.forEach(e => {
                e.frequency = config.frequency;
                e.maxParticles = config.maxParticles;
                e.startAlpha = PIXI.particles.PropertyNode.createList(config.alpha);
                e.startColor = PIXI.particles.PropertyNode.createList(config.color);
            });
        }

        static get CONFIG() {
            const color = PerfectVision._grayscale(canvas?.lighting?.channels?.bright?.rgb ?? [1, 1, 1]);
            const colorHex = ("000000" + rgbToHex(color).toString(16)).slice(-6);
            const alpha = color[0] * 0.1;
            return mergeObject(
                SpecialEffect.DEFAULT_CONFIG,
                {
                    alpha: {
                        list: [
                            { value: 0.0, time: 0.0 },
                            { value: alpha / 2, time: 0.1 },
                            { value: alpha, time: 0.5 },
                            { value: alpha / 2, time: 0.9 },
                            { value: 0.0, time: 1.0 }
                        ],
                        isStepped: false
                    },
                    scale: {
                        start: 3.0,
                        end: 3.0,
                        minimumScaleMultiplier: 1.0
                    },
                    speed: {
                        start: 20,
                        end: 10,
                        minimumSpeedMultiplier: 0.5
                    },
                    color: {
                        start: colorHex,
                        end: colorHex
                    },
                    startRotation: {
                        min: 0,
                        max: 360
                    },
                    rotation: {
                        min: 0,
                        max: 360
                    },
                    rotationSpeed: {
                        min: 0.0,
                        max: 0.0
                    },
                    acceleration: {
                        x: 0,
                        y: 0
                    },
                    lifetime: {
                        min: 10,
                        max: 25,
                    },
                    blendMode: "normal",
                    emitterLifetime: -1
                },
                { inplace: false }
            );
        };
    }

    static _updateFog(draw = false) {
        const sight = canvas.sight;
        const sight_ = extend(sight);

        if (!sight_.fog || draw) {
            sight_.fog = sight.addChildAt(new PIXI.Container(), sight.getChildIndex(sight.fog));
            sight_.filter = sight._blurDistance > 0 ?
                new PIXI.filters.BlurFilter(sight._blurDistance) :
                new PIXI.filters.AlphaFilter(1.0);
            sight_.filter.autoFit = sight.filter.autoFit;
            sight_.fog.filter = Filters.fog;
            sight_.fog.filter.autoFit = sight_.filter.autoFit;

            if (sight_.filter instanceof PIXI.filters.AlphaFilter)
                sight_.fog.filters = [sight_.fog.filter];
            else
                sight_.fog.filters = [sight_.fog.filter, sight_.filter];

            sight_.fog.filterArea = sight.fog.filterArea;
        }

        sight_.fog.visible = sight.fogExploration && this._settings?.actualFogOfWar;

        if (!sight_.fog.visible) {
            if (sight_.fog.weatherEffect) {
                sight_.fog.weatherEffect.stop();
                delete sight_.fog.weatherEffect;
            }
            return;
        }

        if (sight_.fog.weatherEffect)
            return;

        if (!sight_.fog.weather)
            sight_.fog.weather = sight_.fog.addChild(new PIXI.Container());

        sight_.fog.weatherEffect = new this._FogEffect(sight_.fog.weather);
        sight_.fog.weatherEffect.play();
    }

    static _grayscale(c, d = null) {
        let [r, g, b] = c;

        if (0.04045 <= r) {
            r = Math.pow((r + 0.055) / 1.055, 2.4);
        } else {
            r /= 12.92;
        }
        if (0.04045 <= g) {
            g = Math.pow((g + 0.055) / 1.055, 2.4);
        } else {
            g /= 12.92;
        }

        if (0.04045 <= b) {
            b = Math.pow((b + 0.055) / 1.055, 2.4);
        } else {
            b /= 12.92;
        }

        let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        if (0.0031308 <= y) {
            y = 1.055 * Math.pow(y, 1.0 / 2.4) - 0.055;
        } else {
            y *= 12.92;
        }

        d = d ?? [];
        d[2] = d[1] = d[0] = y;
        return d;
    }

    static _registerHooks() {
        patch("PointSource.prototype._createContainer", "POST", function (c, shaderCls) {
            if (shaderCls === StandardIlluminationShader || shaderCls.prototype instanceof StandardIlluminationShader) {
                const c_ = extend(c);

                const lights = new PIXI.Container();
                const index = c.getChildIndex(c.light);

                c.removeChildAt(index);
                c.addChildAt(lights, index);

                c_.light = new PIXI.Mesh(c.light.geometry, PerfectVision._cloneShader(c.light.shader, { ratio: 1 }), c.light.state);
                c_.light.transform = c.light.transform;

                c.light.shader = PerfectVision._linkUniforms(c.light.shader, c_.light.shader, ["ratio"]);

                c.light = new Proxy(c.light, {
                    set(target, prop, value, receiver) {
                        if (prop === "shader")
                            value = PerfectVision._linkUniforms(
                                value,
                                c_.light.shader = PerfectVision._cloneShader(value, { ratio: c_.light.shader.uniforms.ratio }),
                                ["ratio"]
                            );
                        else if (prop === "_width" || prop === "_height")
                            c_.light[prop] = value;
                        return Reflect.set(target, prop, value, receiver);
                    }
                });

                lights.addChild(c.light, c_.light);
            }

            return c;
        });

        patch("PointSource.prototype.initialize", "WRAPPER", function (wrapped, opts) {
            const this_ = extend(this);

            if (!this_.isVision)
                return wrapped(opts);

            const token = this_.token;
            const scene = token.scene ?? token._original?.scene;
            const minR = Math.min(token.w, token.h) * 0.5;

            if (!PerfectVision._isReady) {
                opts.dim = 0;
                opts.bright = 0;
                return wrapped(opts);
            }

            let dimVisionInDarkness;
            let dimVisionInDimLight;
            let brightVisionInDarkness;
            let brightVisionInDimLight;

            const visionRules = token.getFlag("perfect-vision", "visionRules") || "default";

            if (visionRules === "default") {
                dimVisionInDarkness = PerfectVision._settings.dimVisionInDarkness;
                dimVisionInDimLight = PerfectVision._settings.dimVisionInDimLight;
                brightVisionInDarkness = PerfectVision._settings.brightVisionInDarkness;
                brightVisionInDimLight = PerfectVision._settings.brightVisionInDimLight;
            } else if (visionRules === "custom") {
                dimVisionInDarkness = token.getFlag("perfect-vision", "dimVisionInDarkness") || PerfectVision._settings.dimVisionInDarkness;
                dimVisionInDimLight = token.getFlag("perfect-vision", "dimVisionInDimLight") || PerfectVision._settings.dimVisionInDimLight;
                brightVisionInDarkness = token.getFlag("perfect-vision", "brightVisionInDarkness") || PerfectVision._settings.brightVisionInDarkness;
                brightVisionInDimLight = token.getFlag("perfect-vision", "brightVisionInDimLight") || PerfectVision._settings.brightVisionInDimLight;
            } else {
                dimVisionInDarkness = PerfectVision._visionRulesPresets[visionRules].dimVisionInDarkness;
                dimVisionInDimLight = PerfectVision._visionRulesPresets[visionRules].dimVisionInDimLight;
                brightVisionInDarkness = PerfectVision._visionRulesPresets[visionRules].brightVisionInDarkness;
                brightVisionInDimLight = PerfectVision._visionRulesPresets[visionRules].brightVisionInDimLight;
            }

            let dim = token.getLightRadius(token.data.dimSight);
            let bright = token.getLightRadius(token.data.brightSight);

            const sign = Math.min(dim, bright) < 0 ? -1 : +1;

            dim = Math.abs(dim);
            bright = Math.abs(bright);

            let sightLimit = parseFloat(token.getFlag("perfect-vision", "sightLimit"));

            if (Number.isNaN(sightLimit))
                sightLimit = parseFloat(scene?.getFlag("perfect-vision", "sightLimit"));

            if (!Number.isNaN(sightLimit)) {
                sightLimit = Math.max(token.getLightRadius(Math.abs(sightLimit)), minR);
                dim = Math.min(dim, sightLimit);
                bright = Math.min(bright, sightLimit);
            }

            opts.dim = sign * Math.max(
                dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
                brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0
            );
            opts.bright = sign * Math.max(
                dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
                brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
            );

            const visionRadius = Math.max(
                dimVisionInDarkness === "scene" || dimVisionInDarkness === "scene_mono" ? dim : 0,
                dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
                dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
                brightVisionInDarkness === "scene" || brightVisionInDarkness === "scene_mono" ? bright : 0,
                brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0,
                brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
            );
            const visionRadiusColor = Math.max(
                dimVisionInDarkness === "scene" ? dim : 0,
                dimVisionInDarkness === "dim" ? dim : 0,
                dimVisionInDarkness === "bright" ? dim : 0,
                brightVisionInDarkness === "scene" ? bright : 0,
                brightVisionInDarkness === "dim" ? bright : 0,
                brightVisionInDarkness === "bright" ? bright : 0
            );
            const visionRadiusDimToBright = Math.max(
                dimVisionInDimLight === "bright" ? dim : 0,
                brightVisionInDimLight === "bright" ? bright : 0
            );
            const monoVisionColor = hexToRGB(colorStringToHex(
                token.getFlag("perfect-vision", "monoVisionColor") || PerfectVision._settings.monoVisionColor
            ));

            this_.radius = Math.max(Math.abs(opts.dim), Math.abs(opts.bright));

            opts.dim = opts.dim === 0 && opts.bright === 0 ? minR : opts.dim;

            const retVal = wrapped(opts);

            this_.fov = this.fov;

            const fovCache = { [this.radius]: this.fov };

            this.fov = PerfectVision._computeFov(this, Math.max(visionRadius, minR), fovCache);

            if (!token._original)
                this_.fovMono = this.fov;
            else
                delete this_.fovMono;

            if (visionRadiusColor > 0 && !token._original)
                this_.fovColor = PerfectVision._computeFov(this, Math.max(visionRadiusColor, minR), fovCache);
            else
                delete this_.fovColor;

            if (this_.fovMono === this_.fovColor)
                delete this_.fovMono;

            if (visionRadiusDimToBright > 0 && !token._original)
                this_.fovDimToBright = PerfectVision._computeFov(this, Math.max(visionRadiusDimToBright, minR), fovCache);
            else
                delete this_.fovDimToBright;

            if (monoVisionColor && this_.fovMono)
                this_.monoVisionColor = monoVisionColor;
            else
                delete this_.monoVisionColor

            if (!Number.isNaN(sightLimit))
                this.los = PerfectVision._computeFov(this, sightLimit, fovCache);

            return retVal;
        });

        patch("PointSource.prototype._initializeBlending", "POST", function () {
            const this_ = extend(this);

            if (this_.isVision) {
                this.illumination.light.blendMode = PIXI.BLEND_MODES.NORMAL;
                this.illumination.zIndex *= -1;
            }

            return arguments[0];
        });

        patch("PointSource.prototype.drawLight", "WRAPPER", function (wrapped, opts) {
            const this_ = extend(this);

            const ilm = canvas.lighting.illumination;
            const ilm_ = extend(ilm);

            if (ilm_.updateChannels) {
                opts = opts ?? {};
                opts.updateChannels = true;
            }

            const updateChannels = this._resetIlluminationUniforms || opts?.updateChannels;

            const c = wrapped(opts);
            const c_ = extend(c);

            const sight = canvas.sight.tokenVision && canvas.sight.sources.size > 0;

            if (this_.isVision) {
                if (updateChannels) {
                    const iu = this.illumination.shader.uniforms;
                    PerfectVision._grayscale(iu.colorDim, iu.colorDim);
                    PerfectVision._grayscale(iu.colorBright, iu.colorBright);
                }

                if (this_.fov && this_.fov !== this.fov) {
                    if (!c_.fov) {
                        const index = c.getChildIndex(c.fov);
                        c.removeChildAt(index);
                        c_.fov = c.addChildAt(new PIXI.Graphics(), index);
                        c.mask = c_.fov;
                    }

                    c_.fov.clear();

                    if (this_.radius > 0)
                        c_.fov.beginFill(0xFFFFFF, 1.0).drawPolygon(this_.fov).endFill();
                } else if (c_.fov) {
                    const index = c.getChildIndex(c_.fov);
                    c_.fov.destroy();
                    delete c_.fov;
                    c.addChildAt(c.fov, index);
                    c.mask = c.fov;
                }

                c.light.visible = sight && this_.radius > 0;

                if (!c.light.filters)
                    c.light.filters = [];

                c.light.filters[0] = this.darkness ? Filters.visionMin : Filters.visionMax;

                c_.light.visible = false;
                c_.light.filters = null;
            } else {
                c.light.visible = true;
                c.light.filters = null;
                c_.light.visible = sight && this.ratio < 1 && !this.darkness && this !== ilm_.globalLight2;

                if (!c_.light.filters && this !== ilm_.globalLight2)
                    c_.light.filters = [Filters.light];
                else if (this === ilm_.globalLight2)
                    c_.light.filters = null;
            }

            return c;
        });

        patch("Canvas.prototype._updateBlur", "POST", function () {
            const sight = canvas.sight;
            const sight_ = extend(sight);

            const blur = sight.filter.blur;

            if (sight_.filter)
                sight_.filter.blur = blur;

            return arguments[0];
        });

        patch("BackgroundLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            const this_ = extend(this);

            this_.msk = this.addChild(new PIXI.Graphics());
            this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
            this.mask = this_.msk;

            PerfectVision._update({ filters: true, layers: ["background"] });

            return retVal;
        });

        patch("EffectsLayer.layerOptions", "POST", function () {
            return mergeObject(arguments[0], {
                zIndex: Canvas.layers.fxmaster?.layerOptions.zIndex ?? 180
            });
        });

        patch("EffectsLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            const this_ = extend(this);

            this_.msk = this.addChild(new PIXI.Graphics());
            this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
            this.mask = this_.msk;

            PerfectVision._update({ filters: true, layers: ["effects"] });

            return retVal;
        });

        patch("SightLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateFog(true);

            return retVal;
        });

        patch("SightLayer.prototype.tearDown", "PRE", function () {
            const this_ = extend(this);

            if (this_.fog) {
                if (this_.fog.weatherEffect)
                    this_.fog.weatherEffect.stop();

                this_.fog.weather = this_.fog.weatherEffect = null;

                this_.fog.destroy(true);
                delete this_.fog;
            }

            return arguments;
        });

        patch("LightingLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            const ilm = this.illumination;
            const ilm_ = extend(ilm);

            const bgRect = canvas.dimensions.sceneRect.clone().pad((this._blurDistance ?? 0) * 2);
            ilm_.background.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();

            return retVal;
        });

        patch("LightingLayer.prototype._configureChannels", "WRAPPER", function (wrapped, ...args) {
            const ilm = this.illumination;
            const ilm_ = extend(ilm);

            const daylightColor = CONFIG.Canvas.daylightColor;
            const darknessColor = CONFIG.Canvas.darknessColor;

            CONFIG.Canvas.daylightColor = ilm_.daylightColor;
            CONFIG.Canvas.darknessColor = ilm_.darknessColor;

            const channels = wrapped(...args);

            const dim = CONFIG.Canvas.lightLevels.dim;
            channels.dim.rgb = channels.bright.rgb.map((c, i) => (dim * c) + ((1 - dim) * channels.background.rgb[i]));
            channels.dim.hex = rgbToHex(channels.dim.rgb);

            CONFIG.Canvas.daylightColor = daylightColor;
            CONFIG.Canvas.darknessColor = darknessColor;

            return channels;
        });

        patch("LightingLayer.prototype._drawIlluminationContainer", "POST", function (c) {
            const c_ = extend(c);

            {
                c_.background = c.addChildAt(new PIXI.Graphics(), c.getChildIndex(c.background) + 1);
                c_.background.filter = Filters.background;
                c_.background.filterArea = canvas.app.renderer.screen;
                c_.background.filters = [c_.background.filter];
            }

            {
                c_.visionBackground = c.addChildAt(new PIXI.Graphics(), c.getChildIndex(c_.background) + 1);
                c_.visionBackground.filter = Filters.vision;
                c_.visionBackground.filterArea = canvas.app.renderer.screen;
                c_.visionBackground.filters = [c_.visionBackground.filter];
            }

            {
                const d = canvas.dimensions;
                const radius = 0.5 * Math.hypot(d.width, d.height) + (this._blurDistance ?? 0);
                const opts = {
                    x: 0.5 * d.width,
                    y: 0.5 * d.height,
                    z: -1,
                    dim: radius,
                    bright: 0,
                    type: SOURCE_TYPES.UNIVERSAL
                };

                c_.globalLight = new PointSource();
                c_.globalLight.initialize(opts);
                c_.globalLight.type = SOURCE_TYPES.LOCAL;
                Object.defineProperty(c_.globalLight, "dim", {
                    get: () => {
                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = PerfectVision._settings.globalLight;

                        switch (globalLight) {
                            case "dim":
                                return radius;
                            case "bright":
                                return 0;
                            default:
                                return 0;
                        }
                    }
                });
                Object.defineProperty(c_.globalLight, "bright", {
                    get: () => {
                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = PerfectVision._settings.globalLight;

                        switch (globalLight) {
                            case "dim":
                                return 0;
                            case "bright":
                                return radius;
                            default:
                                return 0;
                        }
                    }
                });
                Object.defineProperty(c_.globalLight, "ratio", {
                    get: () => {
                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = PerfectVision._settings.globalLight;

                        switch (globalLight) {
                            case "dim":
                                return 0;
                            case "bright":
                                return 1;
                            default:
                                return 0;
                        }
                    }
                });
                Object.defineProperty(c_.globalLight, "darknessThreshold", {
                    get: () => {
                        if (!this.globalLight)
                            return +Infinity;

                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = PerfectVision._settings.globalLight;

                        switch (globalLight) {
                            case "dim":
                                return -Infinity;
                            case "bright":
                                return -Infinity;
                            default:
                                return +Infinity;
                        }
                    }
                });

                c_.globalLight2 = new PointSource();
                c_.globalLight2.initialize(opts);
                c_.globalLight2.type = SOURCE_TYPES.LOCAL;
                c_.globalLight2.dim = 0;
                c_.globalLight2.bright = 0;
                c_.globalLight2.ratio = 0;
                Object.defineProperty(c_.globalLight2, "darknessThreshold", { get: () => this.globalLight ? -Infinity : +Infinity });
                c_.globalLight2.illumination.zIndex = -1;
                c_.globalLight2.illumination.renderable = false;
            }

            return c;
        });

        patch("LightingLayer.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
            const ilm = this.illumination;
            const ilm_ = extend(ilm);

            this.sources.set("PerfectVision.Light.1", ilm_.globalLight);
            this.sources.set("PerfectVision.Light.2", ilm_.globalLight2);
            ilm_.globalLight._resetIlluminationUniforms = true;

            let daylightColor = canvas.scene.getFlag("perfect-vision", "daylightColor");
            let darknessColor = canvas.scene.getFlag("perfect-vision", "darknessColor");

            if (daylightColor)
                daylightColor = colorStringToHex(daylightColor);
            else
                daylightColor = CONFIG.Canvas.daylightColor;

            if (darknessColor)
                darknessColor = colorStringToHex(darknessColor);
            else
                darknessColor = CONFIG.Canvas.darknessColor;

            if (daylightColor !== ilm_.daylightColor || darknessColor !== ilm_.darknessColor)
                ilm_.updateChannels = true;

            ilm_.daylightColor = daylightColor;
            ilm_.darknessColor = darknessColor;

            const retVal = wrapped(...args);

            delete ilm_.updateChannels;

            return retVal;
        });

        patch("Token.prototype.updateSource", "PRE", function () {
            const vision_ = extend(this.vision);
            vision_.isVision = true;
            vision_.token = this;
            return arguments;
        });

        patch("Token.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._update({ filters: true, placeables: [this] });

            return retVal;
        });

        patch("Tile.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._update({ filters: true, placeables: [this] });

            return retVal;
        });

        patch("MeasuredTemplate.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._update({ filters: true, placeables: [this] });

            return retVal;
        });

        if (game.modules.get("tokenmagic")?.active) {
            patch("PlaceableObject.prototype._TMFXsetRawFilters", "POST", function (retVal, filters) {
                PerfectVision._update({ filters: true, placeables: [this] });
                return retVal;
            });
            Hooks.once("ready", () => {
                patch("TokenMagic._clearImgFiltersByPlaceable", "POST", function (retVal, placeable) {
                    PerfectVision._update({ filters: true, placeables: [placeable] });
                    return retVal;
                })
            });
        }

        if (game.modules.get("roofs")?.active) {
            patch("RoofsLayer.createRoof", "POST", function (retVal, tile) {
                PerfectVision._update({ filters: true, placeables: [tile.roof.container] });
                return retVal;
            });
        }

        Hooks.once("setup", (...args) => PerfectVision._setup(...args));

        Hooks.once("ready", (...args) => PerfectVision._ready(...args));

        Hooks.on("canvasReady", (...args) => PerfectVision._canvasReady(...args));

        Hooks.on("lightingRefresh", (...args) => PerfectVision._lightingRefresh(...args));

        Hooks.on("sightRefresh", (...args) => PerfectVision._sightRefresh(...args));

        Hooks.on("updateToken", (...args) => PerfectVision._updateToken(...args));

        Hooks.on("updateActor", (...args) => PerfectVision._updateActor(...args));

        Hooks.on("updateScene", (...args) => PerfectVision._updateScene(...args));

        Hooks.on("renderSettingsConfig", (...args) => PerfectVision._renderSettingsConfig(...args));

        Hooks.on("renderTokenConfig", (...args) => PerfectVision._renderTokenConfig(...args));

        Hooks.on("renderSceneConfig", (...args) => PerfectVision._renderSceneConfig(...args));

        Hooks.on("getSceneControlButtons", (...args) => PerfectVision._getSceneControlButtons(...args));
    }
}

Hooks.once("init", (...args) => PerfectVision._init(...args));

import "./fix.js";

export { PerfectVision };
