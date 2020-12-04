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

        this._settings.monoVisionColor = game.settings.get("perfect-vision", "monoVisionColor");
        this._settings.monoTokenIcons = game.settings.get("perfect-vision", "monoTokenIcons");
        this._settings.monoSpecialEffects = game.settings.get("perfect-vision", "monoSpecialEffects");
    }

    static _update(tokens = null) {
        this._updateSettings();

        this._refreshLighting = true;
        this._refreshSight = true;
        this._refresh = true;

        this._updateMonoFilter(tokens);

        for (let token of tokens ?? canvas.tokens.placeables)
            token.updateSource({ defer: true });
    }

    static _init() {
        this._registerHooks();
        this._registerSettings();
        this._updateSettings();
    }

    static _registerSettings() {
        game.settings.register("perfect-vision", "globalLight", {
            name: "Global Illumination Light",
            hint: "This setting affects only scenes with Global Illumination. If set to Dim (Bright) Light, the entire scene is illuminated with dim (bright) light and, if set to None, the scene is illuminated according to the scene's Darkness Level only. Each scene can also be configured individually. You can find this setting next to Global Illumination in the scene configuration.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
                "none": "None",
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
            hint: "Choose one of the presets, or select Custom and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the Vision tab.",
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
            hint: "If enabled, FXMaster's and Token Magic FX's special effects are affected by monochrome vision. Otherwise, they are not.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update()
        });
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
    }

    static _sightRefresh() {
        this._refreshSight = false;
    }

    static _updateToken(parent, doc, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        const token = canvas.tokens.get(doc._id);
        this._update([token]);
    }

    static _updateScene(entity, data, options, userId) {
        if (!hasProperty(data, "flags.perfect-vision") || data._id !== canvas.scene._id) {
            if (game.modules.get("fxmaster")?.active && game.settings.get("fxmaster", "enable"))
                this._updateMonoFilter();

            return;
        }

        this._update();
    }

    static _renderConfigTemplate = Handlebars.compile(`\
        {{#*inline "settingPartial"}}
        <div class="form-group">
            <label>{{this.name}}</label>
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

    static _renderSettingsConfig(sheet, html, data) {
        let prefix = "perfect-vision";

        if (sheet instanceof TokenConfig) {
            const token = sheet.object;
            prefix = `flags.${prefix}`;

            const config = this._renderConfigTemplate({
                settings: game.settings.sheet.getData().data.modules.find(m => m.title === "Perfect Vision").settings.filter(
                    s => s.module === "perfect-vision" && [
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
        } else {
            console.assert(sheet instanceof SettingsConfig);
        }

        const colorInput = document.createElement("input");
        colorInput.setAttribute("type", "color");
        colorInput.setAttribute("value", html.find(`input[name="${prefix}.monoVisionColor"]`).val());
        colorInput.setAttribute("data-edit", `${prefix}.monoVisionColor`);

        html.find(`input[name="${prefix}.monoVisionColor"]`).after(colorInput)
        $(colorInput).on("change", sheet._onChangeInput.bind(sheet));

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
            inputMonochromeVisionColor.attr("class", "color");
            inputMonochromeVisionColor.next().attr("value", inputMonochromeVisionColor.val());
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

        const globalLightFields = globalLightLabel.next();
        globalLight.css("margin", globalLight.css("margin"));
        globalLight.remove();
        globalLightFields.append(`\
                <select name="flags.perfect-vision.globalLight">
                    <optgroup label="Global Illumination Light">
                        <option value="default">Default</option>
                        <option value="bright">Bright Light</option>
                        <option value="dim">Dim Light</option>
                        <option value="none">None</option>
                    </optgroup>
                </select>`);
        globalLightFields.append(globalLight);

        html.find(`select[name="flags.perfect-vision.globalLight"]`)
            .val(sheet.object.getFlag("perfect-vision", "globalLight") ?? "default")
            .on("change", sheet._onChangeInput.bind(sheet));
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
            const prototype = typeof (cls) === "string" ? getProperty(window, cls) : cls.prototype;
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

        for (let hook of this._hooks[target] ?? []) {
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

    static _visualizeTexture(texture, name = "") {
        const dataUrl = canvas.app.renderer.extract.canvas(texture).toDataURL("image/png");
        const w = window.open();
        w.document.open();
        w.document.write(`<html><head><title>${name}</title><head><body style="margin:0;background-image:linear-gradient(45deg, #ccc 25%, transparent 25%),linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%);background-size: 2em 2em;background-position:0 0, 1em 0, 1em -1em, 0 -1em;"><iframe src="${dataUrl}" width="100%" height="100%" frameborder="0" scrolling="no"></iframe></body></html>`);
        w.document.close();
    }

    static _visualizeMask() {
        const ilm = canvas.lighting.illumination;
        const ilm_ = this._extend(ilm);
        this._visualizeTexture(ilm_.mask.texture, "mask");
    }

    static _onTick() {
        if (this._refreshLighting)
            canvas.lighting.refresh();

        if (this._refreshSight)
            canvas.sight.refresh();

        if (this._refresh) {
            this._refresh = false;

            const vision = canvas.sight.tokenVision && canvas.sight.sources.size > 0;

            const ilm = canvas.lighting.illumination;
            const ilm_ = this._extend(ilm);

            ilm_.visionInDarkness.visible = vision;
            ilm_.lightsDimToBright.visible = false;

            this._monoFilter.enabled = vision && !canvas.lighting.globalLight;
            ilm_.background.filter.enabled = game.user.isGM && this._settings.improvedGMVision && !vision;

            if (vision || game.user.isGM && this._settings.improvedGMVision) {
                const mask = ilm_.mask;

                mask.layers[0].clear();
                mask.layers[0].beginFill(0x00FF00);

                let monoVisionColor;

                for (let source of canvas.sight.sources) {
                    if (!source.active) continue;

                    const source_ = this._extend(source);

                    if (source_.fovMono) {
                        mask.layers[0].drawPolygon(source_.fovMono);

                        if (monoVisionColor)
                            monoVisionColor = [1, 1, 1];
                        else
                            monoVisionColor = source_.monoVisionColor;
                    }
                }

                if (!monoVisionColor)
                    monoVisionColor = [1, 1, 1];

                mask.layers[0].endFill();
                mask.layers[0].beginFill(0xFFFF00);

                for (let source of canvas.sight.sources) {
                    if (!source.active) continue;

                    const source_ = this._extend(source);

                    if (source_.fovColor)
                        mask.layers[0].drawPolygon(source_.fovColor);
                }

                mask.layers[0].endFill();
                mask.layers[0].beginFill(0xFF0000);

                for (let source of canvas.lighting.sources) {
                    if (!source.active) continue;

                    if (source !== ilm_.globalLight2)
                        mask.layers[0].drawPolygon(source.fov);
                }

                mask.layers[0].endFill();

                mask.layers[1].clear();
                mask.layers[1].beginFill(0x0000FF);

                for (let source of canvas.sight.sources) {
                    if (!source.active) continue;

                    const source_ = this._extend(source);

                    if (source_.fovDimToBright) {
                        mask.layers[1].drawPolygon(source_.fovDimToBright);
                        ilm_.lightsDimToBright.visible = true;
                    }
                }

                mask.layers[1].endFill();

                mask.layers[2].clear();
                mask.layers[2].beginFill(0x0000FF);

                for (let source of canvas.lighting.sources) {
                    if (!source.active) continue;

                    if (source.darkness)
                        mask.layers[2].drawPolygon(source.fov);
                }

                mask.layers[2].endFill();

                const width = canvas.app.renderer.screen.width;
                const height = canvas.app.renderer.screen.height;

                if (!mask.texture) {
                    mask.texture = PIXI.RenderTexture.create({
                        width: width,
                        height: height,
                        scaleMode: PIXI.SCALE_MODES.LINEAR,
                        resolution: game.settings.get("core", "devicePixelRatio") ?
                            Math.max(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 1)
                    });

                    const size = [width, height, 1 / width, 1 / height];
                    ilm_.background.filter.uniforms.uMask = mask.texture;
                    ilm_.background.filter.uniforms.uMaskSize = size;
                    this._monoFilter.uniforms.uMask = mask.texture;
                    this._monoFilter.uniforms.uMaskSize = size;
                    ilm_.visionInDarkness.filter.uniforms.uMask = mask.texture;
                    ilm_.visionInDarkness.filter.uniforms.uMaskSize = size;
                    ilm_.lightsDimToBright.filter.uniforms.uMask = mask.texture;
                    ilm_.lightsDimToBright.filter.uniforms.uMaskSize = size;
                } else if (mask.texture.width !== width || mask.texture.height !== height) {
                    mask.texture.resize(width, height);

                    const size = [width, height, 1 / width, 1 / height];
                    ilm_.background.filter.uniforms.uMaskSize = size;
                    this._monoFilter.uniforms.uMaskSize = size;
                    ilm_.visionInDarkness.filter.uniforms.uMaskSize = size;
                    ilm_.lightsDimToBright.filter.uniforms.uMaskSize = size;
                }

                this._monoFilter.uniforms.uTint = monoVisionColor;

                if (mask.filter instanceof PerfectVision._GlowFilter)
                    mask.filter.uniforms.uStrength = Math.max(canvas.stage.scale.x, canvas.stage.scale.y) * 2;

                mask.pivot = canvas.stage.pivot;
                mask.position = canvas.stage.position;
                mask.rotation = canvas.stage.rotation;
                mask.scale = canvas.stage.scale;
                mask.skew = canvas.stage.skew;

                canvas.app.renderer.render(mask, mask.texture, true);
            }
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
        }
    };

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
                    gl_FragColor = vec4(rgb2srgb(mix(mix(vec3(y), y2mono(y, tint), mask.g), rgb, mask.r)), a);
                }`,
                ...args
            );
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

    static _updateMonoFilter(placeables = null) {
        if (!placeables) {
            for (let layerName of ["background", "fxmaster"]) {
                const layer = canvas[layerName];

                if (!layer) continue;

                let monoFilterIndex = layer.filters ? layer.filters.indexOf(this._monoFilter) : -1;

                if (monoFilterIndex >= 0)
                    layer.filters.splice(monoFilterIndex, 1);

                if (layerName === "fxmaster") {
                    monoFilterIndex = layer.weather?.filters ? layer.weather.filters.indexOf(this._monoFilter) : -1;

                    if (monoFilterIndex >= 0)
                        layer.weather.filters.splice(monoFilterIndex, 1);
                }

                if (layer.filters?.length > 0) {
                    if (layerName !== "fxmaster" || this._settings.monoSpecialEffects)
                        layer.filters.push(this._monoFilter);
                    else if (layer.weather)
                        layer.weather.filters.push(this._monoFilter);
                } else {
                    if (layerName !== "fxmaster" || this._settings.monoSpecialEffects)
                        layer.filters = [this._monoFilter];
                    else if (layer.weather)
                        layer.weather.filters = [this._monoFilter];
                }
            }

            this._updateMonoFilter(canvas.tokens.placeables);
            this._updateMonoFilter(canvas.tiles.placeables);
            this._updateMonoFilter(canvas.templates.placeables);

            if (canvas.roofs)
                this._updateMonoFilter(canvas.roofs.children);
        } else {
            for (let placeable of placeables) {
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

                    if (!(placeable instanceof Token) || this._settings.monoTokenIcons) {
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
    }

    static _registerHooks() {
        this._postHook(PointSource, "_createContainer", function (_c, shaderCls) {
            if (shaderCls === StandardIlluminationShader || shaderCls.prototype instanceof StandardIlluminationShader) {
                let c = new PIXI.Container();
                c.light = c.addChild(_c.light);
                c.fov = c.addChild(_c.fov);
                c.mask = c.addChild(_c.mask);
                c.filters = _c.filters;
                c.filterArea = _c.filterArea;

                const c_ = new PIXI.Container();
                c_.light = c_.addChild(new PIXI.Mesh(PointSource.GEOMETRY, shaderCls.create(), c.light.state));
                c_.light.transform = c.light.transform;
                c_.light.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
                c_.fov = c_.addChild(new PIXI.Graphics());
                c_.mask = c_.fov;
                c_.filters = c.filters;
                c_.filterArea = c.filterArea;

                const this_ = PerfectVision._extend(this, {});
                this_.ratio = 1;

                const linkUniforms = (shader, shader2, map) => {
                    const uniforms = new Proxy(shader.uniforms, {
                        set(target, prop, value) {
                            shader2.uniforms[prop] = prop === "ratio" ? (this_.ratio ?? value) : value;
                            return Reflect.set(...arguments);
                        }
                    });

                    return new Proxy(shader, {
                        get(target, prop, receiver) {
                            if (prop === "uniforms")
                                return uniforms;
                            return Reflect.get(...arguments);
                        }
                    });
                };

                c.light.shader = linkUniforms(c.light.shader, c_.light.shader);

                Object.defineProperty(c, "shader", {
                    get: () => c.light.shader,
                    set: shader => {
                        if (shader instanceof AbstractBaseShader)
                            c_.light.shader = new shader.constructor(shader.program, duplicate(shader.uniforms));
                        else
                            c_.light.shader = new PIXI.Shader(shader.program, duplicate(shader.uniforms));

                        c.light.shader = linkUniforms(shader, c_.light.shader);
                        c_.light.shader.uniforms.ratio = this_.ratio ?? 1;
                    }
                });

                Object.defineProperty(c, "uniforms", { get: () => c.light.shader.uniforms });

                c = new Proxy(c, {
                    set(target, prop, value) {
                        if (prop === "filters" || prop === "filterArea")
                            c_[prop] = value;
                        return Reflect.set(...arguments);
                    }
                });

                PerfectVision._extend(c, c_);
                return c;
            }

            return _c;
        });

        this._wrapHook(PointSource, "initialize", function (wrapped, opts) {
            const this_ = PerfectVision._extend(this);

            if (!this_.isVision)
                return wrapped(opts);

            const token = this_.token;

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

            this_.monoVisionColor = hexToRGB(colorStringToHex(
                token.getFlag("perfect-vision", "monoVisionColor") || PerfectVision._settings.monoVisionColor
            ));

            let dim = token.getLightRadius(token.data.dimSight);
            let bright = token.getLightRadius(token.data.brightSight);

            opts.dim = Math.max(
                dimVisionInDarkness === "dim" || dimVisionInDarkness === "dim_mono" ? dim : 0,
                brightVisionInDarkness === "dim" || brightVisionInDarkness === "dim_mono" ? bright : 0
            );
            opts.bright = Math.max(
                dimVisionInDarkness === "bright" || dimVisionInDarkness === "bright_mono" ? dim : 0,
                brightVisionInDarkness === "bright" || brightVisionInDarkness === "bright_mono" ? bright : 0
            );

            const c = this.illumination;
            const c_ = PerfectVision._extend(c);
            c.renderable = false;
            c_.visible = Math.max(opts.dim, opts.bright) > 0;

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

            const d = canvas.dimensions;
            const minR = token.w * 0.5 + d.size * 0.1;
            opts.dim = opts.dim === 0 && opts.bright === 0 ? minR : opts.dim;

            const retVal = wrapped(opts);

            this_.ratio = undefined;
            this_.fov = this.fov;

            const distance = Math.max(
                this.radius,
                Math.hypot(
                    Math.max(this.x, d.width - this.x),
                    Math.max(this.x, d.height - this.y)
                )
            );

            const fovCache = { [this.radius]: this.fov };
            const computeFov = (radius) => {
                if (radius <= 0)
                    return null;

                if (fovCache[radius])
                    return fovCache[radius];

                const limit = Math.clamped(radius / distance, 0, 1);
                const fovPoints = [];
                const points = this.los.points;

                for (let i = 0; i < points.length; i += 2) {
                    const p = { x: points[i], y: points[i + 1] };
                    const r = new Ray(this, p);
                    const t0 = Math.clamped(r.distance / distance, 0, 1);
                    const q = t0 <= limit ? p : r.project(limit / t0);
                    fovPoints.push(q)
                }

                return new PIXI.Polygon(...fovPoints);
            };

            if (visionRadius > 0)
                this_.fovMono = (this.fov = computeFov(visionRadius));
            else
                this_.fovMono = null;

            if (visionRadiusColor > 0)
                this_.fovColor = computeFov(visionRadiusColor);
            else
                this_.fovColor = null;

            {
                const radius = Math.max(
                    dimVisionInDimLight === "bright" ? dim : 0,
                    brightVisionInDimLight === "bright" ? bright : 0
                );

                if (radius > 0)
                    this_.fovDimToBright = computeFov(radius);
                else
                    this_.fovDimToBright = null;
            }

            return retVal;
        });

        this._postHook(PointSource, "drawLight", function (c) {
            const this_ = PerfectVision._extend(this);
            const c_ = PerfectVision._extend(c);

            c_.fov.clear();
            if (this.radius > 0)
                c_.fov.beginFill(0xFFFFFF, 1.0).drawPolygon(this_.fov ?? this.fov).endFill();

            PerfectVision._refresh = true;
            return c;
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
                c_.background.filter = new PerfectVision._MaskFilter("1.0 - r");
                c_.background.filterArea = canvas.app.renderer.screen;
                c_.background.filters = [c_.background.filter];
            }

            {
                c_.visionInDarkness = c.addChild(new PIXI.Container());
                c_.visionInDarkness.sortableChildren = true;
                c_.visionInDarkness.filter = new PerfectVision._MaskFilter("1.0 - r * (1.0 - g)");
                c_.visionInDarkness.filter.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
                c_.visionInDarkness.filterArea = canvas.app.renderer.screen;
                c_.visionInDarkness.filters = [c_.visionInDarkness.filter];
            }

            {
                c_.lightsDimToBright = c.addChild(new PIXI.Container());
                c_.lightsDimToBright.sortableChildren = true;
                c_.lightsDimToBright.filter = new PerfectVision._MaskFilter("b");
                c_.lightsDimToBright.filter.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
                c_.lightsDimToBright.filterArea = canvas.app.renderer.screen;
                c_.lightsDimToBright.filters = [c_.lightsDimToBright.filter];
            }

            {
                c_.mask = new PIXI.Container();
                c_.mask.layers = [
                    c_.mask.addChild(new PIXI.Graphics()),
                    c_.mask.addChild(new PIXI.Graphics()),
                    c_.mask.addChild(new PIXI.Graphics())
                ];
                c_.mask.layers[1].blendMode = PIXI.BLEND_MODES.ADD;
                c_.mask.layers[2].blendMode = PIXI.BLEND_MODES.SUBTRACT;
                c_.mask.filter = this._blurDistance ?
                    new PerfectVision._GlowFilter(2.0, 2.5, 2 / 3, this._blurDistance) :
                    new PIXI.filters.AlphaFilter(1.0);
                c_.mask.filters = [c_.mask.filter];
                c_.mask.filterArea = canvas.app.renderer.screen;
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

                c_.globalLight1 = new PointSource();
                c_.globalLight1.initialize(opts);
                c_.globalLight1.type = SOURCE_TYPES.LOCAL;
                Object.defineProperty(c_.globalLight1, "dim", {
                    get: () => {
                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = PerfectVision._settings.globalLight;

                        switch (globalLight) {
                            case "dim":
                                return r;
                            case "bright":
                                return 0;
                            default:
                                return 0;
                        }
                    }
                });
                Object.defineProperty(c_.globalLight1, "bright", {
                    get: () => {
                        let globalLight = canvas.scene.getFlag("perfect-vision", "globalLight") ?? "default";

                        if (globalLight === "default")
                            globalLight = PerfectVision._settings.globalLight;

                        switch (globalLight) {
                            case "dim":
                                return 0;
                            case "bright":
                                return r;
                            default:
                                return 0;
                        }
                    }
                });
                Object.defineProperty(c_.globalLight1, "ratio", {
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
                Object.defineProperty(c_.globalLight1, "darknessThreshold", {
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
                c_.globalLight2.illumination.renderable = false;
            }

            return c;
        });

        this._wrapHook(LightingLayer, "refresh", function (wrapped, ...args) {
            const ilm = this.illumination;
            const ilm_ = PerfectVision._extend(ilm);

            this.sources.set("PerfectVision.Light.1", ilm_.globalLight1);
            this.sources.set("PerfectVision.Light.2", ilm_.globalLight2);
            ilm_.globalLight1._resetIlluminationUniforms = true;
            ilm_.globalLight2._resetIlluminationUniforms = true;

            const retVal = wrapped(...args);

            if (game.user.isGM && PerfectVision._settings.improvedGMVision) {
                if (canvas.sight.sources.size === 0) {
                    const s = 1 / Math.max(...this.channels.background.rgb);
                    ilm_.background.tint = rgbToHex(this.channels.background.rgb.map(c => c * s));
                    ilm_.background.visible = true;
                } else {
                    ilm_.background.visible = false;
                }
            } else {
                ilm_.background.visible = false;
            }

            ilm_.lightsDimToBright.removeChildren();

            for (let source of this.sources) {
                if (!source.active) continue;

                if (!source.darkness && source !== ilm_.globalLight2) {
                    const sc = source.illumination;
                    const sc_ = PerfectVision._extend(sc);
                    sc_.zIndex = sc.zIndex;
                    ilm_.lightsDimToBright.addChild(sc_);
                }
            }

            ilm_.visionInDarkness.removeChildren();

            for (let source of canvas.sight.sources) {
                if (!source.active) continue;

                const sc = source.illumination;
                const sc_ = PerfectVision._extend(sc);
                sc_.zIndex = sc.zIndex;
                ilm_.visionInDarkness.addChild(sc_);
            }

            PerfectVision._refresh = true;

            return retVal;
        });

        this._preHook(LightingLayer, "tearDown", function () {
            const ilm = this.illumination;
            const ilm_ = PerfectVision._extend(ilm);

            if (ilm_.mask.texture) {
                ilm_.mask.texture.destroy(true);

                PerfectVision._monoFilter.uniforms.uMask = null;
            }

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

            PerfectVision._updateMonoFilter([this]);

            return retVal;
        });

        this._postHook(Tile, "draw", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateMonoFilter([this]);

            return retVal;
        });

        this._postHook(MeasuredTemplate, "draw", async function () {
            const retVal = await arguments[0];

            PerfectVision._updateMonoFilter([this]);

            return retVal;
        });

        if (game.modules.get("tokenmagic")?.active) {
            this._postHook(PlaceableObject, "_TMFXsetRawFilters", function (retVal, filters) {
                PerfectVision._updateMonoFilter([this]);
                return retVal;
            });
            Hooks.once("ready", () => {
                this._postHook("TokenMagic", "_clearImgFiltersByPlaceable", function (retVal, placeable) {
                    PerfectVision._updateMonoFilter([placeable]);
                    return retVal;
                })
            });
        }

        if (game.modules.get("roofs")?.active) {
            this._postHook("RoofsLayer", "createRoof", function (retVal, tile) {
                PerfectVision._updateMonoFilter([tile.roof.container]);
                return retVal;
            });
        }

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