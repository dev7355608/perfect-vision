class PerfectVision {
    static _settings;
    static _extensions = new WeakMap();

    static _extend(object, extension = null) {
        if (!this._extensions.has(object) && extension instanceof Object)
            this._extensions.set(object, extension);
        return this._extensions.get(object);
    }

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

    static _update(tokens = null) {
        this._updateSettings();

        this._refreshLighting = true;
        this._refreshSight = true;
        this._refresh = true;

        if (!canvas?.ready)
            return;

        this._updateFilters(tokens);

        for (const token of tokens ?? canvas.tokens.placeables)
            token.updateSource({ defer: true });

        if (!tokens)
            this._updateFog();
    }

    static _init() {
        this._registerHooks();
        this._registerSettings();
        this._updateSettings();
    }

    static _registerSettings() {
        game.settings.register("perfect-vision", "globalLight", {
            name: "Global Illumination Light",
            hint: "This setting affects only scenes with Global Illumination. If set to Dim (Bright) Light, the entire scene is illuminated with dim (bright) light and, if set to Scene Darkness, the scene is illuminated according to the scene's Darkness Level only. Even if set to Scene Darkness, everything in line-of-sight is visible and in color. Each scene can also be configured individually. You can find this setting next to Global Illumination in the scene configuration.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
                "none": "Scene Darkness",
            },
            default: "dim",
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "improvedGMVision", {
            name: "Improved GM Vision",
            hint: "Improves the visibility in darkness for the GM massively while lit areas of the scene are still rendered normally.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "visionRules", {
            name: "Vision Rules",
            hint: "Choose one of the presets, or select Custom and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the Vision tab. Dim (Bright) Vision in Darkness controls what dim (bright) vision looks like in darkness, i.e., in areas that are not illuminated by light sources. Dim (Bright) Vision in Dim Light controls how dim (bright) vision interacts with dim light, i.e., if dim light becomes bright light or not. Scene Darkness is the level of darkness in areas without light sources. It's the darkness controlled by Darkness Level in the scene configuration. Total Darkness means no vision. Select an option with monochrome to create vision without color in darkness. It's grayscale vision as long as the Monochrome Vision Color is white.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "custom": "Custom",
                "fvtt": "Foundry VTT",
                "dnd35e": "Dungeons & Dragons 3.5e",
                "dnd5e": "Dungeons & Dragons 5e",
                "pf2e": "Pathfinder 2e",
            },
            default: game.system.id === "dnd5e" ? "dnd5e" : (game.system.id === "pf2e" ? "pf2e" : (game.system.id === "D35E" ? "dnd35e" : "fvtt")),
            onChange: () => this._update()
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
            onChange: () => this._update()
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
            onChange: () => this._update()
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
            onChange: () => this._update()
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
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "monoVisionColor", {
            name: "Monochrome Vision Color",
            hint: "Set this color to anything other than white to make monochrome vision stand out visibly in darkness. For example, choose a green tone to make it look like night vision goggles. This setting affects only scenes without Global Illumination. You can also choose a color for each token individually in the token configuration under the Vision tab.",
            scope: "world",
            config: true,
            type: String,
            default: "#ffffff",
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "monoTokenIcons", {
            name: "Monochrome Token Icons",
            hint: "If enabled, token icons are affected by monochrome vision. Otherwise, they are not.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "monoSpecialEffects", {
            name: "Monochrome Special Effects",
            hint: "If enabled, FXMaster's and Token Magic FX's special effects are affected by monochrome vision. Otherwise, they are not. Special effects attached to tokens are only affected by this setting if Monochrome Token Icons is enabled as well.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "fogOfWarWeather", {
            name: "Fog of War Weather",
            hint: "If enabled, weather effects are visible in the fog of war. Otherwise, weather is only visible in line-of-sight.",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this._update()
        });

        game.settings.register("perfect-vision", "actualFogOfWar", {
            name: "Actual Fog of War",
            hint: "If enabled, the fog of war is overlaid with a fog effect.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update()
        });
    }

    static _setup() {
        if (game.modules.get("fxmaster")?.active) {
            this._postHook(Canvas.layers.fxmaster, "addChild", function () {
                PerfectVision._updateFilters();
                return arguments[0];
            });
            Hooks.on("switchFilter", () => PerfectVision._updateFilters());
            Hooks.on("switchWeather", () => PerfectVision._updateFilters());
            Hooks.on("updateWeather", () => PerfectVision._updateFilters());
        }
    }

    static _canvasReady() {
        (game.settings.sheet.getData().data.modules.find(m => m.title === "Perfect Vision")?.settings ?? []).forEach(s => {
            if (s.module === "perfect-vision" && s.isSelect && s.choices && !s.choices[game.settings.get("perfect-vision", s.key)])
                game.settings.set("perfect-vision", s.key, s.default);
        });

        canvas.app.ticker.remove(this._onTick, this);
        canvas.app.ticker.add(this._onTick, this, PIXI.UPDATE_PRIORITY.LOW + 1);

        this._update();
    }

    static _canvasPan() {
        this._refresh = true;
    }

    static _lightingRefresh() {
        this._refreshLighting = false;

        const ilm = canvas.lighting.illumination;
        const ilm_ = this._extend(ilm);

        if (game.user.isGM && this._settings.improvedGMVision && canvas.sight.sources.size === 0) {
            const s = 1 / Math.max(...canvas.lighting.channels.background.rgb);
            ilm_.background.tint = rgbToHex(canvas.lighting.channels.background.rgb.map(c => c * s));
            ilm_.background.visible = true;
        } else {
            ilm_.background.visible = false;
        }

        const mask = this._mask;

        mask.background.clear();

        if (canvas.lighting.globalLight)
            mask.background.beginFill(0xFF0000, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();

        for (const layer of mask.layers)
            layer.removeChildren();

        for (const source of canvas.lighting.sources) {
            if (!source.active) continue;

            const sc = source.illumination;
            const sc_ = this._extend(sc);

            if (sc_.fovLight)
                mask.layers[2].addChild(sc_.fovLight);
        }

        for (const source of canvas.sight.sources) {
            if (!source.active) continue;

            const sc = source.illumination;
            const sc_ = this._extend(sc);

            if (sc_.fovMono)
                mask.layers[0].addChild(sc_.fovMono);

            if (sc_.fovColor)
                mask.layers[1].addChild(sc_.fovColor);

            if (sc_.fovDimToBright)
                mask.layers[3].addChild(sc_.fovDimToBright);
        }

        const sight = canvas.sight;
        const sight_ = PerfectVision._extend(sight, {});

        if (sight_.fog?.weatherEffect)
            sight_.fog.weatherEffect._updateParticleEmitters();

        this._refresh = true;
    }

    static _sightRefresh() {
        this._refreshSight = false;

        let monoVisionColor;

        let mask = this._mask;

        mask.msk.clear();

        if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
            mask.msk.beginFill(0xFFFFFF, 1.0);

            for (const source of canvas.sight.sources) {
                if (!source.active) continue;

                mask.msk.drawPolygon(source.los);

                const source_ = this._extend(source);

                if (source_.fovMono) {
                    if (monoVisionColor) {
                        monoVisionColor = undefined;
                        break;
                    }

                    monoVisionColor = source_.monoVisionColor;
                }
            }

            for (const source of canvas.lighting.sources) {
                if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL)
                    continue;

                mask.msk.drawPolygon(source.fov);
            }

            mask.msk.endFill();

            mask.mask = mask.msk;
        } else {
            mask.mask = null;
        }

        this._monoFilter.enabled = canvas.sight.tokenVision && canvas.sight.sources.size > 0;
        this._monoFilter.uniforms.uTint = monoVisionColor ?? [1, 1, 1];

        this._effectsFilter.enabled = this._monoFilter.enabled;

        const ilm = canvas.lighting.illumination;
        const ilm_ = this._extend(ilm);

        if (game.user.isGM && this._settings.improvedGMVision && canvas.sight.sources.size === 0) {
            ilm_.background.visible = true;
        } else {
            ilm_.background.visible = false;
        }

        this._updateFilters();

        this._refresh = true;
    }

    static _updateToken(parent, doc, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        const token = canvas.tokens.get(doc._id);
        this._update([token]);
    }

    static _updateScene(entity, data, options, userId) {
        if (data._id !== canvas.scene._id)
            return;

        if (!hasProperty(data, "flags.perfect-vision")) {
            this._updateFilters();
            return;
        }

        this._update();
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
        let prefix = "perfect-vision";

        const settings = game.settings.sheet.getData().data.modules.find(m => m.title === "Perfect Vision").settings.filter(
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
                ].includes(s.key)).map(s => {
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
    }

    static _renderTokenConfig = this._renderSettingsConfig;

    static _renderSceneConfig(sheet, html, data) {
        const globalLight = html.find(`input[name="globalLight"]`);
        const globalLightLabel = globalLight.prev();
        globalLightLabel.after(`<div class="form-fields"></div>`);

        const defaultGlobalLight = game.settings.sheet.getData().data.modules.find(m => m.title === "Perfect Vision").settings.find(
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

        if (!sheet._minimized)
            sheet.setPosition(sheet.position);
    }

    static _hooks = {};

    static _hook(cls, methodName, type, func) {
        const target = typeof (cls) === "string" ? `${cls}.${methodName}` : `${cls.name}.prototype.${methodName}`;

        console.log("Perfect Vision | Hooking (%s) %s", type, target);

        this._hooks[target] = this._hooks[target] ?? [];
        this._hooks[target].push({ type, func });

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.unregister("perfect-vision", target, false);
            libWrapper.register("perfect-vision", target, this._buildLibWrapperHook(target), "WRAPPER");
        } else {
            const prototype = typeof (cls) === "string" ? getProperty(globalThis, cls) : cls.prototype;
            const method = prototype[methodName];

            if (type === "pre") {
                prototype[methodName] = function () {
                    return method.apply(this, func.apply(this, arguments));
                };
            } else if (type === "post") {
                prototype[methodName] = function () {
                    return func.call(this, method.apply(this, arguments), ...arguments);
                };
            } else if (type === "wrap") {
                prototype[methodName] = function () {
                    return func.call(this, (...args) => method.apply(this, args), ...arguments);
                };
            }
        }
    }

    static _buildLibWrapperHook(target) {
        let curr;

        for (const hook of this._hooks[target] ?? []) {
            if (!curr) {
                const func = hook.func;

                if (hook.type === "pre") {
                    curr = function (wrapped, ...args) {
                        return wrapped(...func.apply(this, args));
                    };
                } else if (hook.type === "post") {
                    curr = function (wrapped, ...args) {
                        return func.call(this, wrapped(...args), ...args);
                    };
                } else if (hook.type === "wrap") {
                    curr = function (wrapped, ...args) {
                        return func.call(this, wrapped, ...args);
                    };
                }
            } else {
                const prev = curr;
                const func = hook.func;

                if (hook.type === "pre") {
                    curr = function (wrapped, ...args) {
                        return prev.call(this, wrapped, ...func.apply(this, args));
                    };
                } else if (hook.type === "post") {
                    curr = function (wrapped, ...args) {
                        return func.call(this, prev.call(this, wrapped, ...args), ...args);
                    };
                } else if (hook.type === "wrap") {
                    curr = function (wrapped, ...args) {
                        return func.call(this, (...args) => prev.call(this, wrapped, ...args), ...args);
                    };
                }
            }
        }

        return curr;
    }

    static _preHook(cls, methodName, func) {
        return this._hook(cls, methodName, "pre", func);
    }

    static _postHook(cls, methodName, func) {
        return this._hook(cls, methodName, "post", func);
    }

    static _wrapHook(cls, methodName, func) {
        return this._hook(cls, methodName, "wrap", func);
    }

    static _mask_ = null;

    static get _mask() {
        if (!this._mask_) {
            const blurDistance = game.settings.get("core", "softShadows") ? Math.max(CONFIG.Canvas.blurStrength / 2, 1) : 0;
            this._mask_ = new PIXI.Container();
            this._mask_.filter = blurDistance ?
                new PerfectVision._GlowFilter(CONFIG.Canvas.blurStrength / 4, 2.0, 4 / 5, blurDistance) :
                new PIXI.filters.AlphaFilter(1.0);
            this._mask_.filters = [this._mask_.filter];
            this._mask_.filterArea = canvas.app.renderer.screen;
            this._mask_.background = this._mask_.addChild(new PIXI.Graphics());
            this._mask_.layers = [
                new PIXI.Container(),
                new PIXI.Container(),
                new PIXI.Container(),
                new PIXI.Container()
            ];
            this._mask_.addChild(
                this._mask_.layers[0],
                this._mask_.layers[1],
                this._mask_.layers[2],
                this._mask_.layers[3]
            );
            this._mask_.msk = this._mask_.addChild(new PIXI.Graphics());
            this._mask_.mask = this._mask_.msk;
        }
        return this._mask_;
    }

    static _visualizeTexture(texture, name = "") {
        const dataUrl = canvas.app.renderer.extract.canvas(texture).toDataURL("image/png");
        const w = window.open();
        w.document.open();
        w.document.write(`<html><head><title>${name}</title><head><body style="margin:0;background-image:linear-gradient(45deg, #ccc 25%, transparent 25%),linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%);background-size: 2em 2em;background-position:0 0, 1em 0, 1em -1em, 0 -1em;"><iframe src="${dataUrl}" width="100%" height="100%" frameborder="0" scrolling="no"></iframe></body></html>`);
        w.document.close();
    }

    static _visualizeMask() {
        this._visualizeTexture(this._mask.texture, "mask");
    }

    static _getTexture(object) {
        const renderer = canvas.app.renderer;
        const screen = renderer.screen;
        const resolution = renderer.resolution;
        const width = screen.width;
        const height = screen.height;

        if (!object.texture || object.texture === PIXI.Texture.EMPTY) {
            object.texture = PIXI.RenderTexture.create({
                width: width,
                height: height,
                scaleMode: PIXI.SCALE_MODES.LINEAR,
                resolution: resolution
            });
        } else {
            if (object.texture.resolution !== resolution) {
                object.texture.setResolution(resolution);
            }

            if (object.texture.width !== width || object.texture.height !== height) {
                object.texture.resize(width, height);
            }
        }

        return object.texture;
    }

    static _stageTransform(object) {
        const stage = canvas.stage;
        object.position.copyFrom(stage.position);
        object.pivot.copyFrom(stage.pivot);
        object.scale.copyFrom(stage.scale);
        object.skew.copyFrom(stage.skew);
        object.rotation = stage.rotation;
        return object;
    }

    static _onTick() {
        if (this._refreshLighting)
            canvas.lighting.refresh();

        if (this._refreshSight)
            canvas.sight.refresh();

        if (this._refresh) {
            this._refresh = false;

            const mask = this._mask;

            canvas.app.renderer.render(this._stageTransform(mask), this._getTexture(mask), true, undefined, false);
        }
    }

    static _MaskFilter = class extends PIXI.Filter {
        constructor(channel = "mask", ...args) {
            super(
                `\
                precision mediump float;

                attribute vec2 aVertexPosition;

                uniform mat3 projectionMatrix;
                uniform vec4 inputSize;
                uniform vec4 outputFrame;
                uniform vec4 uMaskSize;

                varying vec2 vTextureCoord;
                varying vec2 vMaskCoord;

                void main(void)
                {
                    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
                    gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
                    vMaskCoord = position * uMaskSize.zw;
                }`, `\
                precision mediump float;

                varying vec2 vTextureCoord;
                varying vec2 vMaskCoord;

                uniform sampler2D uSampler;
                uniform sampler2D uMask;

                void main(void)
                {
                    vec4 color = texture2D(uSampler, vTextureCoord);
                    vec4 mask = texture2D(uMask, vMaskCoord);
                    float r = mask.r;
                    float g = mask.g;
                    float b = mask.b;
                    float a = mask.a;
                    gl_FragColor = color * (${channel});
                }`,
                ...args
            );

            this.resolution = canvas.app.renderer.resolution;

            this.uniforms.uMaskSize = [0, 0, 0, 0];
        }

        apply(filterManager, input, output, clearMode) {
            const texture = PerfectVision._mask.texture;
            this.uniforms.uMask = texture;

            const maskSize = this.uniforms.uMaskSize;
            maskSize[0] = texture.width;
            maskSize[1] = texture.height;
            maskSize[2] = 1 / texture.width;
            maskSize[3] = 1 / texture.height;

            filterManager.applyFilter(this, input, output, clearMode);
        }
    };

    static _backgroundFilter_ = null;

    static get _backgroundFilter() {
        if (!this._backgroundFilter_)
            this._backgroundFilter_ = new this._MaskFilter("1.0 - r");
        return this._backgroundFilter_;
    }

    static _visionFilter_ = null;

    static get _visionFilter() {
        if (!this._visionFilter_) {
            this._visionFilter_ = new this._MaskFilter("g");
            this._visionFilter_.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
        }
        return this._visionFilter_;
    }

    static _lightFilter_ = null;

    static get _lightFilter() {
        if (!this._lightFilter_) {
            this._lightFilter_ = new this._MaskFilter("b");
            this._lightFilter_.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
        }
        return this._lightFilter_;
    }

    static _effectsFilter_ = null;

    static get _effectsFilter() {
        if (!this._effectsFilter_)
            this._effectsFilter_ = new this._MaskFilter("a");
        return this._effectsFilter_;
    }

    static _fogFilter_ = null;

    static get _fogFilter() {
        if (!this._fogFilter_)
            this._fogFilter_ = new this._MaskFilter("1.0 - a");
        return this._fogFilter_;
    }

    // Based on PixiJS Filters' GlowFilter
    static _GlowFilter = class extends PIXI.Filter {
        constructor(strength = 1.0, intensity = 1.0, quality = 1.0, distance = 2) {
            distance = Math.round(distance);

            super(`\
                precision mediump float;

                attribute vec2 aVertexPosition;

                uniform mat3 projectionMatrix;
                uniform vec4 inputSize;
                uniform vec4 outputFrame;

                varying vec2 vTextureCoord;

                void main(void)
                {
                    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
                    gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
                }`, `\
                precision mediump float;

                uniform sampler2D uSampler;
                uniform vec4 inputSize;
                uniform vec4 inputClamp;
                uniform float uStrength;
                uniform float uIntensity;

                varying vec2 vTextureCoord;

                const float PI = 3.14159265358979323846264;
                const float DIST = __DIST__;
                const float ANGLE_STEP_SIZE = min(__ANGLE_STEP_SIZE__, PI * 2.0);
                const float ANGLE_STEP_NUM = ceil(PI * 2.0 / ANGLE_STEP_SIZE);
                const float MAX_TOTAL_ALPHA = ANGLE_STEP_NUM * DIST * (DIST + 1.0) / 2.0;

                void main(void) {
                    vec2 px = inputSize.zw * uStrength;
                    vec4 totalAlpha = vec4(0.0);
                    vec2 direction;
                    vec2 displaced;
                    vec4 color;

                    for (float angle = 0.0; angle < PI * 2.0; angle += ANGLE_STEP_SIZE) {
                        direction = vec2(cos(angle), sin(angle)) * px;

                        for (float curDistance = 0.0; curDistance < DIST; curDistance++) {
                            displaced = clamp(vTextureCoord + direction *
                                    (curDistance + 1.0), inputClamp.xy, inputClamp.zw);

                            color = texture2D(uSampler, displaced);
                            totalAlpha += (DIST - curDistance) * color;
                        }
                    }

                    color = texture2D(uSampler, vTextureCoord);

                    vec4 alphaRatio = totalAlpha / MAX_TOTAL_ALPHA;
                    vec4 glowAlpha = (1.0 - pow(1.0 - alphaRatio, vec4(uIntensity))) * (1.0 - color);
                    vec4 glowColor = min(1.0 - color, glowAlpha);

                    gl_FragColor = color + glowColor;
                }`.replace(/__ANGLE_STEP_SIZE__/gi, "" + (Math.PI / Math.round(quality * (distance + 1))).toFixed(7))
                .replace(/__DIST__/gi, distance.toFixed(0) + ".0"));

            this.resolution = canvas.app.renderer.resolution;

            this.uniforms.uStrength = strength;
            this.uniforms.uIntensity = intensity;
        }
    };

    static _MonoFilter = class extends PIXI.Filter {
        constructor(...args) {
            super(
                `\
                precision mediump float;

                attribute vec2 aVertexPosition;

                uniform mat3 projectionMatrix;
                uniform vec4 inputSize;
                uniform vec4 outputFrame;
                uniform vec4 uMaskSize;

                varying vec2 vTextureCoord;
                varying vec2 vMaskCoord;

                void main(void)
                {
                    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
                    gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
                    vMaskCoord = position * uMaskSize.zw;
                }`, `\
                precision mediump float;

                uniform sampler2D uSampler;
                uniform sampler2D uMask;
                uniform vec3 uTint;

                varying vec2 vTextureCoord;
                varying vec2 vMaskCoord;

                vec3 rgb2srgb(vec3 c)
                {
                    vec3 a = 12.92 * c;
                    vec3 b = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
                    vec3 s = step(vec3(0.0031308), c);
                    return mix(a, b, s);
                }

                vec3 srgb2rgb(vec3 c)
                {
                    vec3 a = c / 12.92;
                    vec3 b = pow((c + 0.055) / 1.055, vec3(2.4));
                    vec3 s = step(vec3(0.04045), c);
                    return mix(a, b, s);
                }

                float rgb2y(vec3 c)
                {
                    vec3 w = vec3(0.2126, 0.7152, 0.0722);
                    return dot(c, w);
                }

                vec3 y2mono(float y, vec3 tint)
                {
                    float tintY = rgb2y(tint);
                    return mix(
                        mix(tint, vec3(1.0), (y - tintY) / (1.0 - mix(tintY, 0.0, step(1.0, tintY)))),
                        tint * (y / mix(tintY, 1.0, step(tintY, 0.0))),
                        step(y, tintY)
                    );
                }

                void main(void)
                {
                    vec4 mask = texture2D(uMask, vMaskCoord);
                    vec4 srgba = texture2D(uSampler, vTextureCoord);
                    vec3 srgb = srgba.rgb;
                    vec3 rgb = srgb2rgb(srgb);
                    float a = srgba.a;
                    float y = rgb2y(rgb);
                    vec3 tint = srgb2rgb(uTint);
                    gl_FragColor = vec4(rgb2srgb(mix(vec3(y), mix(y2mono(y, tint), rgb, mask.r), mask.a)), a);
                }`,
                ...args
            );

            this.resolution = canvas.app.renderer.resolution;

            this.uniforms.uMaskSize = [0, 0, 0, 0];
        }

        apply(filterManager, input, output, clearMode) {
            const texture = PerfectVision._mask.texture;
            this.uniforms.uMask = texture;

            const maskSize = this.uniforms.uMaskSize;
            maskSize[0] = texture.width;
            maskSize[1] = texture.height;
            maskSize[2] = 1 / texture.width;
            maskSize[3] = 1 / texture.height;

            filterManager.applyFilter(this, input, output, clearMode);
        }
    };

    static _monoFilter_ = null;
    // Remove as soon as pixi.js fixes the auto fit bug.
    static _monoFilter_noAutoFit_ = null;

    static get _monoFilter() {
        if (!this._monoFilter_)
            this._monoFilter_ = new this._MonoFilter();
        return this._monoFilter_;
    }

    static get _monoFilter_noAutoFit() {
        if (!this._monoFilter_noAutoFit_)
            this._monoFilter_noAutoFit_ = new Proxy(this._monoFilter, {
                get(target, prop, receiver) {
                    if (prop === "autoFit")
                        return false;
                    return Reflect.get(...arguments);
                }
            });
        return this._monoFilter_noAutoFit_;
    }

    static _updateFilters(placeables = null) {
        this._monoFilter.zOrder = this._monoFilter.rank = 0;

        if (!placeables) {
            for (const layerName of ["background", "effects", "fxmaster"]) {
                const layer = canvas[layerName];

                if (!layer) continue;

                {
                    let monoFilterIndex = layer.filters ? layer.filters.indexOf(this._monoFilter) : -1;

                    if (monoFilterIndex >= 0)
                        layer.filters.splice(monoFilterIndex, 1);

                    let effectsFilterIndex = layer.filters ? layer.filters.indexOf(this._effectsFilter) : -1;

                    if (effectsFilterIndex >= 0)
                        layer.filters.splice(effectsFilterIndex, 1);
                }

                let object = layer;

                if (layerName === "background") {
                    let monoFilterIndex = layer.img?.filters ? layer.img.filters.indexOf(this._monoFilter) : -1;

                    if (monoFilterIndex >= 0)
                        layer.img.filters.splice(monoFilterIndex, 1);

                    object = layer.img ?? layer;
                } else if (layerName === "effects" || layerName === "fxmaster") {
                    let monoFilterIndex = layer.weather?.filters ? layer.weather.filters.indexOf(this._monoFilter) : -1;

                    if (monoFilterIndex >= 0)
                        layer.weather.filters.splice(monoFilterIndex, 1);

                    for (const child of layer.children) {
                        let effectsFilterIndex = child.filters ? child.filters.indexOf(this._effectsFilter) : -1;

                        if (effectsFilterIndex >= 0)
                            child.filters.splice(effectsFilterIndex, 1);
                    }

                    if (this._settings.monoSpecialEffects)
                        object = layer;
                    else
                        object = layer.weather;
                }

                if (!object)
                    continue;

                if (object.filters?.length > 0) {
                    object.filters.push(this._monoFilter);
                } else {
                    object.filters = [this._monoFilter];
                }

                if (layerName === "effects" || layerName === "fxmaster") {
                    let objects;

                    if (this._settings.fogOfWarWeather)
                        objects = layer.children.filter(child => child !== layer.weather && child !== layer.mask);
                    else
                        objects = [layer];

                    for (const object of objects) {
                        if (object.filters?.length > 0) {
                            object.filters.push(this._effectsFilter);
                        } else {
                            object.filters = [this._effectsFilter];
                        }
                    }
                }
            }

            this._updateFilters(canvas.tokens.placeables);
            this._updateFilters(canvas.tiles.placeables);
            this._updateFilters(canvas.templates.placeables);

            if (canvas.roofs)
                this._updateFilters(canvas.roofs.children);
        } else {
            for (const placeable of placeables) {
                let sprite;

                if (placeable instanceof Token) {
                    sprite = placeable.icon;
                } else if (placeable instanceof Tile) {
                    sprite = placeable.tile.img;
                } else if (placeable instanceof MeasuredTemplate) {
                    sprite = placeable.template;
                } else if (placeable instanceof PIXI.DisplayObject) {
                    sprite = placeable;
                }

                if (sprite) {
                    if (sprite.filters) {
                        sprite.filters = sprite.filters.filter(filter => !(filter instanceof this._MonoFilter));

                        if (sprite.filters.length === 0)
                            sprite.filters = null;
                    }

                    if (placeable instanceof Token && !this._settings.monoTokenIcons)
                        continue;

                    if (placeable instanceof Tile && (placeable.data.flags?.startMarker || placeable.data.flags?.turnMarker))
                        continue;

                    if (sprite.filters?.length > 0) {
                        if (this._settings.monoSpecialEffects)
                            sprite.filters.push(this._monoFilter_noAutoFit);
                        else
                            sprite.filters.unshift(this._monoFilter_noAutoFit);
                    } else {
                        sprite.filters = [this._monoFilter];
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

    // Based on FXMasters' FogWeatherEffect
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
            });
        }

        static get CONFIG() {
            const darknessLevel = canvas.lighting.darknessLevel;
            const factor = 1 + 3 * (1 - darknessLevel);
            return mergeObject(
                SpecialEffect.DEFAULT_CONFIG,
                {
                    alpha: {
                        list: [
                            { value: 0 * factor, time: 0 },
                            { value: 0.02 * factor, time: 0.1 },
                            { value: 0.05 * factor, time: 0.5 },
                            { value: 0.02 * factor, time: 0.9 },
                            { value: 0 * factor, time: 1 }
                        ],
                        isStepped: false
                    },
                    scale: {
                        start: 3.0,
                        end: 3.0,
                        minimumScaleMultiplier: 1.0
                    },
                    speed: {
                        start: 15,
                        end: 10,
                        minimumSpeedMultiplier: 0.2
                    },
                    color: {
                        start: "ffffff",
                        end: "ffffff"
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

    static _updateFog() {
        const sight = canvas.sight;
        const sight_ = PerfectVision._extend(sight, {});

        if (!sight_.fog) {
            sight_.fog = sight.addChildAt(new PIXI.Container(), sight.getChildIndex(sight.fog));
            sight_.filter = sight._blurDistance > 0 ?
                new PIXI.filters.BlurFilter(sight._blurDistance) :
                new PIXI.filters.AlphaFilter(1.0);
            sight_.filter.autoFit = sight.filter.autoFit;
            sight_.fog.filter = PerfectVision._fogFilter;
            sight_.fog.filter.autoFit = sight_.filter.autoFit;

            if (sight_.filter instanceof PIXI.filters.AlphaFilter)
                sight_.fog.filters = [sight_.fog.filter];
            else
                sight_.fog.filters = [sight_.fog.filter, sight_.filter];

            sight_.fog.filterArea = sight.fog.filterArea;
        }

        if (sight_.fog.weatherEffect)
            sight_.fog.weatherEffect.stop();

        if (!sight_.fog.weather)
            sight_.fog.weather = sight_.fog.addChild(new PIXI.Container());

        sight_.fog.visible = this._settings.actualFogOfWar;

        if (!sight_.fog.visible)
            return;

        sight_.fog.weatherEffect = new this._FogEffect(sight_.fog.weather);
        sight_.fog.weatherEffect.play();
    }

    static _registerHooks() {
        this._postHook(PointSource, "_createContainer", function (c, shaderCls) {
            if (shaderCls === StandardIlluminationShader || shaderCls.prototype instanceof StandardIlluminationShader) {
                PerfectVision._extend(this, {});

                const c_ = PerfectVision._extend(c, {});

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

        this._wrapHook(PointSource, "initialize", function (wrapped, opts) {
            const this_ = PerfectVision._extend(this);

            if (!this_.isVision)
                return wrapped(opts);

            const token = this_.token;
            const scene = token.scene ?? token._original?.scene;
            const minR = Math.min(token.w, token.h) * 0.5;

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

            if (visionRadius > 0 && !token._original)
                this_.fovMono = PerfectVision._computeFov(this, visionRadius, fovCache);
            else
                delete this._fovMono;

            if (visionRadiusColor > 0 && !token._original)
                this_.fovColor = PerfectVision._computeFov(this, visionRadiusColor, fovCache);
            else
                delete this_.fovColor;

            if (visionRadiusDimToBright > 0 && !token._original)
                this_.fovDimToBright = PerfectVision._computeFov(this, visionRadiusDimToBright, fovCache);
            else
                delete this_.fovDimToBright;

            if (monoVisionColor && !token._original)
                this_.monoVisionColor = monoVisionColor;
            else
                delete this_.monoVisionColor

            if (!Number.isNaN(sightLimit))
                this.los = PerfectVision._computeFov(this, sightLimit, fovCache);

            return retVal;
        });

        this._postHook(PointSource, "drawLight", function (c) {
            const this_ = PerfectVision._extend(this);
            const c_ = PerfectVision._extend(c);

            const sight = canvas.sight.tokenVision && canvas.sight.sources.size > 0;

            if (this_.isVision) {
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

                if (this_.fovMono) {
                    if (!c_.fovMono)
                        c_.fovMono = new PIXI.Graphics();

                    c_.fovMono.clear().beginFill(canvas.lighting.globalLight ? 0xFFFF00 : 0x00FF00, 1.0).drawPolygon(this_.fovMono).endFill();
                } else if (c_.fovMono) {
                    c_.fovMono.destroy();
                    delete c_.fovMono;
                }

                if (this_.fovColor) {
                    if (!c_.fovColor)
                        c_.fovColor = new PIXI.Graphics();

                    c_.fovColor.clear().beginFill(0xFFFF00, 1.0).drawPolygon(this_.fovColor).endFill();
                } else if (c_.fovColor) {
                    c_.fovColor.destroy();
                    delete c_.fovColor;
                }

                if (this_.fovDimToBright) {
                    if (!c_.fovDimToBright) {
                        c_.fovDimToBright = new PIXI.Graphics();
                        c_.fovDimToBright.blendMode = PIXI.BLEND_MODES.ADD;
                    }

                    c_.fovDimToBright.clear().beginFill(0x0000FF, 1.0).drawPolygon(this_.fovDimToBright).endFill();
                } else if (c_.fovDimToBright) {
                    c_.fovDimToBright.destroy();
                    delete c_.fovDimToBright;
                }

                c.light.visible = sight && this_.radius > 0;

                if (!c.light.filters)
                    c.light.filters = [PerfectVision._visionFilter];

                c_.light.visible = false;
                c_.light.filters = null;
            } else {
                if (!canvas.lighting.globalLight) {
                    if (!c_.fovLight)
                        c_.fovLight = new PIXI.Graphics();

                    c_.fovLight.clear();

                    if (this.radius > 0)
                        c_.fovLight.beginFill(0xFF0000, 1.0).drawPolygon(this.fov).endFill();
                } else if (c_.fovLight) {
                    c_.fovLight.destroy();
                    delete c_.fovLight;
                }

                c.light.visible = true;
                c.light.filters = null;
                c_.light.visible = sight && this.ratio < 1 && !this.darkness;

                if (!c_.light.filters)
                    c_.light.filters = [PerfectVision._lightFilter];
            }

            PerfectVision._refresh = true;
            return c;
        });

        this._postHook(Canvas, "_updateBlur", function () {
            const sight = canvas.sight;
            const sight_ = PerfectVision._extend(sight, {});

            const blur = sight.filter.blur;

            if (sight_.filter)
                sight_.filter.blur = blur;

            const mask = PerfectVision._mask;

            if (mask.filter instanceof PerfectVision._GlowFilter)
                mask.filter.uniforms.uStrength = blur / 4;

            return arguments[0];
        });

        this._postHook(BackgroundLayer, "draw", async function () {
            const retVal = await arguments[0];

            const this_ = PerfectVision._extend(this, {});

            this_.msk = this.addChild(new PIXI.Graphics());
            this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
            this.mask = this_.msk;

            PerfectVision._updateFilters();

            return retVal;
        });

        this._postHook(SightLayer, "draw", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateFog();

            return retVal;
        });

        this._preHook(SightLayer, "tearDown", function () {
            const this_ = PerfectVision._extend(this);

            if (this_.fog) {
                if (this_.fog.weatherEffect)
                    this_.fog.weatherEffect.stop();

                this_.fog.weather = this_.fog.weatherEffect = null;

                this_.fog.destroy(true);
                delete this_.fog;
            }

            return arguments;
        });

        this._postHook(LightingLayer, "draw", async function () {
            const retVal = await arguments[0];

            const ilm = this.illumination;
            const ilm_ = PerfectVision._extend(ilm);

            const bgRect = canvas.dimensions.sceneRect.clone().pad((this._blurDistance ?? 0) * 2);
            ilm_.background.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();

            return retVal;
        });

        this._postHook(LightingLayer, "_drawIlluminationContainer", function (c) {
            const c_ = PerfectVision._extend(c, {});

            {
                c_.background = c.addChildAt(new PIXI.Graphics(), c.getChildIndex(c.background) + 1);
                c_.background.filter = PerfectVision._backgroundFilter;
                c_.background.filterArea = canvas.app.renderer.screen;
                c_.background.filters = [c_.background.filter];
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
            }

            return c;
        });

        this._preHook(LightingLayer, "refresh", function () {
            const ilm = this.illumination;
            const ilm_ = PerfectVision._extend(ilm);

            this.sources.set("PerfectVision.Light", ilm_.globalLight);
            ilm_.globalLight._resetIlluminationUniforms = true;

            return arguments;
        });

        this._preHook(Token, "updateSource", function () {
            const vision_ = PerfectVision._extend(this.vision);
            vision_.isVision = true;
            vision_.token = this;
            return arguments;
        });

        this._postHook(Token, "draw", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateFilters([this]);

            return retVal;
        });

        this._postHook(Tile, "draw", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateFilters([this]);

            return retVal;
        });

        this._postHook(MeasuredTemplate, "draw", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateFilters([this]);

            return retVal;
        });

        if (game.modules.get("tokenmagic")?.active) {
            this._postHook(PlaceableObject, "_TMFXsetRawFilters", function (retVal, filters) {
                PerfectVision._updateFilters([this]);
                return retVal;
            });
            Hooks.once("ready", () => {
                this._postHook("TokenMagic", "_clearImgFiltersByPlaceable", function (retVal, placeable) {
                    PerfectVision._updateFilters([placeable]);
                    return retVal;
                })
            });
        }

        if (game.modules.get("roofs")?.active) {
            this._postHook("RoofsLayer", "createRoof", function (retVal, tile) {
                PerfectVision._updateFilters([tile.roof.container]);
                return retVal;
            });
        }

        Hooks.once("setup", (...args) => PerfectVision._setup(...args));

        Hooks.on("canvasReady", (...args) => PerfectVision._canvasReady(...args));

        Hooks.on("canvasPan", (...args) => PerfectVision._canvasPan(...args));

        Hooks.on("lightingRefresh", (...args) => PerfectVision._lightingRefresh(...args));

        Hooks.on("sightRefresh", (...args) => PerfectVision._sightRefresh(...args));

        Hooks.on("updateToken", (...args) => PerfectVision._updateToken(...args));

        Hooks.on("updateScene", (...args) => PerfectVision._updateScene(...args));

        Hooks.on("renderSettingsConfig", (...args) => PerfectVision._renderSettingsConfig(...args));

        Hooks.on("renderTokenConfig", (...args) => PerfectVision._renderTokenConfig(...args));

        Hooks.on("renderSceneConfig", (...args) => PerfectVision._renderSceneConfig(...args));

        Hooks.once("ready", () => {
            if (!game.modules.get("lib-wrapper")?.active && game.user.isGM)
                ui.notifications.warn("The 'Perfect Vision' module recommends to install and activate the 'libWrapper' module.");
        });
    }
}

Hooks.once("init", (...args) => PerfectVision._init(...args));
