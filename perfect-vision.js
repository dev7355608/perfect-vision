class PerfectVision {
    static _settings;
    static _extensions = new WeakMap();

    static _extend(object, extension = null) {
        if (!this._extensions.has(object) && extension instanceof Object)
            this._extensions.set(object, extension);
        return this._extensions.get(object);
    }

    static _update(tokens = null) {
        this._settings = this._settings ?? {};
        this._settings.globalLight = game.settings.get("perfect-vision", "globalLight");
        this._settings.improvedGMVision = game.settings.get("perfect-vision", "improvedGMVision");
        this._settings.visionRules = game.settings.get("perfect-vision", "visionRules");

        switch (this._settings.visionRules) {
            case "custom":
                this._settings.dimVisionInDarkness = game.settings.get("perfect-vision", "dimVisionInDarkness");
                this._settings.dimVisionInDimLight = game.settings.get("perfect-vision", "dimVisionInDimLight");
                // this._settings.dimVisionInBrightLight = game.settings.get("perfect-vision", "dimVisionInBrightLight");
                this._settings.brightVisionInDarkness = game.settings.get("perfect-vision", "brightVisionInDarkness");
                this._settings.brightVisionInDimLight = game.settings.get("perfect-vision", "brightVisionInDimLight");
                // this._settings.brightVisionInBrightLight = game.settings.get("perfect-vision", "brightVisionInBrightLight");
                break;
            case "fvtt":
                this._settings.dimVisionInDarkness = "dim";
                this._settings.dimVisionInDimLight = "dim";
                // this._settings.dimVisionInBrightLight = "bright";
                this._settings.brightVisionInDarkness = "bright";
                this._settings.brightVisionInDimLight = "bright";
                // this._settings.brightVisionInBrightLight = "bright";
                break;
            case "dnd5e":
                this._settings.dimVisionInDarkness = "dim_mono";
                this._settings.dimVisionInDimLight = "bright";
                // this._settings.dimVisionInBrightLight = "bright";
                this._settings.brightVisionInDarkness = "bright";
                this._settings.brightVisionInDimLight = "bright";
                // this._settings.brightVisionInBrightLight = "bright";
                break;
            case "pf2e":
                this._settings.dimVisionInDarkness = "darkness";
                this._settings.dimVisionInDimLight = "bright";
                // this._settings.dimVisionInBrightLight = "bright";
                this._settings.brightVisionInDarkness = "bright_mono";
                this._settings.brightVisionInDimLight = "bright";
                // this._settings.brightVisionInBrightLight = "bright";
                break;
            default:
                console.warn(`Perfect Vision | Invalid vision rules: ${this._settings.visionRules}`);
        }

        this._settings.monoVisionColor = game.settings.get("perfect-vision", "monoVisionColor");
        this._settings.monoTokenIcons = game.settings.get("perfect-vision", "monoTokenIcons");

        this._refreshLighting = true;
        this._refreshSight = true;
        this._refresh = true;

        tokens = tokens ?? canvas.tokens.placeables;

        for (let token of tokens)
            token.updateSource({ defer: true });
    }

    static _init() {
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
                "dnd5e": "Dungeons & Dragons 5e",
                "pf2e": "Pathfinder 2e",
            },
            default: game.system.id === "dnd5e" ? "dnd5e" : (game.system.id === "pf2e" ? "pf2e" : "fvtt"),
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

        // game.settings.register("perfect-vision", "dimVisionInBrightLight", {
        //     name: "Dim Vision in Bright Light",
        //     scope: "world",
        //     config: true,
        //     type: String,
        //     choices: {
        //         "bright": "Bright Light",
        //     },
        //     default: "bright",
        //     onChange: () => this._update()
        // });

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

        // game.settings.register("perfect-vision", "brightVisionInBrightLight", {
        //     name: "Bright Vision in Bright Light",
        //     scope: "world",
        //     config: true,
        //     type: String,
        //     choices: {
        //         "bright": "Bright Light",
        //     },
        //     default: "bright",
        //     onChange: () => this._update()
        // });

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

        this._update([]);
    }

    static _canvasReady() {
        this._refresh = true;
        canvas.app.ticker.remove(this._onTick, this);
        canvas.app.ticker.add(this._onTick, this, PIXI.UPDATE_PRIORITY.LOW + 1);
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
        if (!hasProperty(data, "flags.perfect-vision") || data._id !== canvas.scene._id)
            return;

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

            html.find(`input[name="vision"]`).parent().after(
                this._renderConfigTemplate({
                    settings: game.settings.sheet.getData().data.modules.find(m => m.title === "Perfect Vision").settings.filter(
                        s => [
                            "visionRules",
                            "dimVisionInDarkness",
                            "dimVisionInDimLight",
                            // "dimVisionInBrightLight",
                            "brightVisionInDarkness",
                            "brightVisionInDimLight",
                            // "brightVisionInBrightLight",
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
                })
            );
        } else {
            console.assert(sheet instanceof SettingsConfig);
        }

        const colorInput = document.createElement("input");
        colorInput.setAttribute("type", "color");
        colorInput.setAttribute("value", html.find(`input[name="${prefix}.monoVisionColor"]`).val());
        colorInput.setAttribute("data-edit", `${prefix}.monoVisionColor`);
        html.find(`input[name="${prefix}.monoVisionColor"]`).after(colorInput);

        sheet.activateListeners(html);

        const update = () => {
            const visionRules = html.find(`select[name="${prefix}.visionRules"]`).val();
            html.find(`select[name="${prefix}.dimVisionInDarkness"]`).prop("disabled", visionRules !== "custom");
            html.find(`select[name="${prefix}.dimVisionInDimLight"]`).prop("disabled", visionRules !== "custom");
            // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).prop("disabled", visionRules !== "custom");
            html.find(`select[name="${prefix}.brightVisionInDarkness"]`).prop("disabled", visionRules !== "custom");
            html.find(`select[name="${prefix}.brightVisionInDimLight"]`).prop("disabled", visionRules !== "custom");
            // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).prop("disabled", visionRules !== "custom");

            if (sheet instanceof TokenConfig) {
                if (visionRules !== "custom") {
                    html.find(`select[name="${prefix}.dimVisionInDarkness"]`).parents(".form-group").hide();
                    html.find(`select[name="${prefix}.dimVisionInDimLight"]`).parents(".form-group").hide();
                    // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).parents(".form-group").hide();
                    html.find(`select[name="${prefix}.brightVisionInDarkness"]`).parents(".form-group").hide();
                    html.find(`select[name="${prefix}.brightVisionInDimLight"]`).parents(".form-group").hide();
                    // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).parents(".form-group").hide();
                } else {
                    html.find(`select[name="${prefix}.dimVisionInDarkness"]`).parents(".form-group").show();
                    html.find(`select[name="${prefix}.dimVisionInDimLight"]`).parents(".form-group").show();
                    // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).parents(".form-group").show();
                    html.find(`select[name="${prefix}.brightVisionInDarkness"]`).parents(".form-group").show();
                    html.find(`select[name="${prefix}.brightVisionInDimLight"]`).parents(".form-group").show();
                    // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).parents(".form-group").show();
                }
            }

            switch (visionRules) {
                case "fvtt":
                    html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val("dim");
                    html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val("dim");
                    // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).val("bright");
                    html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val("bright");
                    html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val("bright");
                    // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).val("bright");
                    break;
                case "dnd5e":
                    html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val("dim_mono");
                    html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val("bright");
                    // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).val("bright");
                    html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val("bright");
                    html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val("bright");
                    // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).val("bright");
                    break;
                case "pf2e":
                    html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val("darkness");
                    html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val("bright");
                    // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).val("bright");
                    html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val("bright_mono");
                    html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val("bright");
                    // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).val("bright");
                    break;
                case "default":
                    html.find(`select[name="${prefix}.dimVisionInDarkness"]`).val(this._settings.dimVisionInDarkness);
                    html.find(`select[name="${prefix}.dimVisionInDimLight"]`).val(this._settings.dimVisionInDimLight);
                    // html.find(`select[name="${prefix}.dimVisionInBrightLight"]`).val(this._settings.dimVisionInBrightLight);
                    html.find(`select[name="${prefix}.brightVisionInDarkness"]`).val(this._settings.brightVisionInDarkness);
                    html.find(`select[name="${prefix}.brightVisionInDimLight"]`).val(this._settings.brightVisionInDimLight);
                    // html.find(`select[name="${prefix}.brightVisionInBrightLight"]`).val(this._settings.brightVisionInBrightLight);
                    break;
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

        sheet.activateListeners(html);

        html.find(`select[name="flags.perfect-vision.globalLight"]`).val(sheet.object.getFlag("perfect-vision", "globalLight") ?? "default");
    }

    static _preHook(cls, methodName, hook) {
        console.log("Perfect Vision | Hooking (pre) %s.%s", cls.name, methodName);
        const method = cls.prototype[methodName];
        cls.prototype[methodName] = function () {
            return method.apply(this, hook.apply(this, arguments));
        };
        return method;
    }

    static _postHook(cls, methodName, hook) {
        console.log("Perfect Vision | Hooking (post) %s.%s", cls.name, methodName);
        const method = cls.prototype[methodName];
        cls.prototype[methodName] = function () {
            const retVal = method.apply(this, arguments);
            return hook.call(this, retVal, ...arguments);
        };
        return method;
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

    static _visualizeMaskBlurred() {
        const ilm = canvas.lighting.illumination;
        const ilm_ = this._extend(ilm);
        this._visualizeTexture(ilm_.mask.textureBlurred, "maskBlurred");
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

            ilm_.monoFilter.enabled = vision && !canvas.lighting.globalLight;
            ilm_.background.filter.enabled = game.user.isGM && this._settings.improvedGMVision && !vision;

            if (vision || game.user.isGM && this._settings.improvedGMVision) {
                const mask = ilm_.mask;
                const maskBlurred = ilm_.maskBlurred;

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
                        resolution: 1
                    });
                    mask.textureBlurred = PIXI.RenderTexture.create({
                        width: width,
                        height: height,
                        scaleMode: PIXI.SCALE_MODES.LINEAR,
                        resolution: 1
                    });
                    maskBlurred.texture = mask.texture;
                    maskBlurred.width = width;
                    maskBlurred.height = height;

                    const size = [width, height, 1 / width, 1 / height];
                    ilm_.background.filter.uniforms.uMask = mask.texture;
                    ilm_.background.filter.uniforms.uMaskSize = size;
                    ilm_.monoFilter.uniforms.uMask = mask.textureBlurred;
                    ilm_.monoFilter.uniforms.uMaskSize = size;
                    ilm_.visionInDarkness.filter.uniforms.uMask = mask.texture;
                    ilm_.visionInDarkness.filter.uniforms.uMaskSize = size;
                    ilm_.lightsDimToBright.filter.uniforms.uMask = mask.texture;
                    ilm_.lightsDimToBright.filter.uniforms.uMaskSize = size;
                } else if (mask.texture.width !== height || mask.texture.width !== height) {
                    mask.texture.resize(width, height);
                    mask.textureBlurred.resize(width, height);
                    maskBlurred.width = width;
                    maskBlurred.height = height;

                    const size = [width, height, 1 / width, 1 / height];
                    ilm_.background.filter.uniforms.uMaskSize = size;
                    ilm_.monoFilter.uniforms.uMaskSize = size;
                    ilm_.visionInDarkness.filter.uniforms.uMaskSize = size;
                    ilm_.lightsDimToBright.filter.uniforms.uMaskSize = size;
                }

                ilm_.monoFilter.uniforms.uTint = monoVisionColor;

                if (maskBlurred.filter instanceof PIXI.filters.BlurFilter)
                    maskBlurred.filter.blur = Math.max(canvas.stage.scale.x, canvas.stage.scale.y) * (canvas.lighting._blurDistance ?? 0);

                canvas.app.renderer.render(mask, mask.texture, true, canvas.stage.worldTransform);
                canvas.app.renderer.render(maskBlurred, mask.textureBlurred, true);
            }
        }
    }

    static _MaskFilter = class extends PIXI.Filter {
        constructor(channel = "mask", ...args) {
            super(
                `\
                precision mediump float;

                attribute vec2 aVertexPosition;
                attribute vec2 aTextureCoord;

                uniform mat3 projectionMatrix;
                uniform vec4 inputPixel;
                uniform vec4 uMaskSize;

                varying vec2 vTextureCoord;
                varying vec2 vMaskCoord;

                void main(void)
                {
                    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aTextureCoord;
                    vMaskCoord = aTextureCoord * (inputPixel.xy * uMaskSize.zw);
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

    static _MonoFilter = class extends PIXI.Filter {
        constructor(...args) {
            super(
                `\
                precision mediump float;

                attribute vec2 aVertexPosition;
                attribute vec2 aTextureCoord;

                uniform mat3 projectionMatrix;
                uniform vec4 inputPixel;
                uniform vec4 uMaskSize;

                varying vec2 vTextureCoord;
                varying vec2 vMaskCoord;

                void main(void)
                {
                    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                    vTextureCoord = aTextureCoord;
                    vMaskCoord = aTextureCoord * (inputPixel.xy * uMaskSize.zw);
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

                void main(void)
                {
                    vec4 mask = texture2D(uMask, vMaskCoord);
                    float s = mask.r;
                    float t = mask.g;
                    vec4 srgba = texture2D(uSampler, vTextureCoord);
                    vec3 srgb = srgba.rgb;
                    vec3 rgb = srgb2rgb(srgb);
                    float a = srgba.a;
                    float y = rgb2y(rgb);
                    vec3 lstar3 = rgb2srgb(vec3(y));
                    vec3 mono = mix(lstar3, lstar3 * uTint, t);
                    gl_FragColor = vec4(mix(mono, srgb, s), a);
                }`,
                ...args
            );
        }
    };
}

PerfectVision._postHook(PointSource, "_createContainer", function (_c, shaderCls) {
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

PerfectVision._postHook(PointSource, "drawLight", function (c) {
    const this_ = PerfectVision._extend(this, {});
    const c_ = PerfectVision._extend(c);

    c_.fov.clear();
    if (this.radius > 0)
        c_.fov.beginFill(0xFFFFFF, 1.0).drawPolygon(this_.fov ?? this.fov).endFill();

    PerfectVision._refresh = true;
    return c;
});

PerfectVision._postHook(LightingLayer, "draw", async function () {
    const retVal = await arguments[0];

    const ilm = this.illumination;
    const ilm_ = PerfectVision._extend(ilm);

    const bgRect = canvas.dimensions.sceneRect.clone().pad((this._blurDistance ?? 0) * 2);
    ilm_.background.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();

    return retVal;
});

PerfectVision._postHook(LightingLayer, "_drawIlluminationContainer", function (c) {
    const c_ = PerfectVision._extend(c, {});

    {
        c_.background = c.addChildAt(new PIXI.Graphics(), c.getChildIndex(c.background) + 1);
        c_.background.filter = new PerfectVision._MaskFilter("1.0 - r");
        c_.background.filterArea = canvas.app.renderer.screen;
        c_.background.filters = [c_.background.filter];
    }

    {
        c_.monoFilter = new PerfectVision._MonoFilter();

        if (canvas.background.filters?.length > 0) {
            canvas.background.filters.push(c_.monoFilter);

            console.warn("Perfect Vision | canvas.background.filters.length > 0");

            if (canvas.background.filterArea !== canvas.app.renderer.screen)
                console.warn("Perfect Vision | canvas.background.filterArea !== canvas.app.renderer.screen");
        } else {
            canvas.background.filters = [c_.monoFilter];
        }

        canvas.background.filterArea = canvas.app.renderer.screen;

        if (canvas.tiles.filters?.length > 0) {
            canvas.tiles.filters.push(c_.monoFilter);

            console.warn("Perfect Vision | canvas.tiles.filters.length > 0");

            if (canvas.tiles.filterArea !== canvas.app.renderer.screen)
                console.warn("Perfect Vision | canvas.tiles.filterArea !== canvas.app.renderer.screen");
        } else {
            canvas.tiles.filters = [c_.monoFilter];
        }

        canvas.tiles.filterArea = canvas.app.renderer.screen;
    }

    {
        c_.visionInDarkness = c.addChild(new PIXI.Container());
        c_.visionInDarkness.sortableChildren = true;
        c_.visionInDarkness.filter = new PerfectVision._MaskFilter("step(0.0, g - r)");
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
        c_.maskBlurred = new PIXI.Sprite();
        c_.maskBlurred.filter = this._blurDistance ?
            new PIXI.filters.BlurFilter(this._blurDistance) :
            new PIXI.filters.AlphaFilter(1.0);
        c_.maskBlurred.filters = [c_.maskBlurred.filter];
        c_.maskBlurred.filterArea = canvas.app.renderer.screen;
    }

    {
        const d = canvas.dimensions;
        const radius = 0.5 * Math.hypot(d.sceneWidth, d.sceneHeight) + (this._blurDistance ?? 0);
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

PerfectVision._preHook(LightingLayer, "refresh", function () {
    const ilm = this.illumination;
    const ilm_ = PerfectVision._extend(ilm);
    this.sources.set("PerfectVision.Light.1", ilm_.globalLight1);
    this.sources.set("PerfectVision.Light.2", ilm_.globalLight2);
    ilm_.globalLight1._resetIlluminationUniforms = true;
    ilm_.globalLight2._resetIlluminationUniforms = true;
    return arguments;
});

PerfectVision._postHook(LightingLayer, "refresh", function () {
    const ilm = this.illumination;
    const ilm_ = PerfectVision._extend(ilm);

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
    return arguments[0];
});

PerfectVision._preHook(LightingLayer, "tearDown", function () {
    const ilm = this.illumination;
    const ilm_ = PerfectVision._extend(ilm);

    if (ilm_.mask.texture) {
        ilm_.mask.texture.destroy(true);
        ilm_.mask.textureBlurred.destroy(true);

        canvas.background.filters.splice(canvas.background.filters.indexOf(ilm_.monoFilter));
        canvas.tiles.filters.splice(canvas.tiles.filters.indexOf(ilm_.monoFilter));
    }

    return arguments;
});

PerfectVision._preHook(Token, "updateSource", function () {
    const token = this;
    const initialize = function (opts) {
        let dimVisionInDarkness;
        let dimVisionInDimLight;
        // let dimVisionInBrightLight;
        let brightVisionInDarkness;
        let brightVisionInDimLight;
        // let brightVisionInBrightLight;

        switch (token.getFlag("perfect-vision", "visionRules") || "default") {
            case "default":
                dimVisionInDarkness = PerfectVision._settings.dimVisionInDarkness;
                dimVisionInDimLight = PerfectVision._settings.dimVisionInDimLight;
                // dimVisionInBrightLight = PerfectVision._settings.dimVisionInBrightLight;
                brightVisionInDarkness = PerfectVision._settings.brightVisionInDarkness;
                brightVisionInDimLight = PerfectVision._settings.brightVisionInDimLight;
                // brightVisionInBrightLight = PerfectVision._settings.brightVisionInBrightLight;
                break;
            case "custom":
                dimVisionInDarkness = token.getFlag("perfect-vision", "dimVisionInDarkness") || PerfectVision._settings.dimVisionInDarkness;
                dimVisionInDimLight = token.getFlag("perfect-vision", "dimVisionInDimLight") || PerfectVision._settings.dimVisionInDimLight;
                // dimVisionInBrightLight = token.getFlag("perfect-vision", "dimVisionInBrightLight") || PerfectVision._settings.dimVisionInBrightLight;
                brightVisionInDarkness = token.getFlag("perfect-vision", "brightVisionInDarkness") || PerfectVision._settings.brightVisionInDarkness;
                brightVisionInDimLight = token.getFlag("perfect-vision", "brightVisionInDimLight") || PerfectVision._settings.brightVisionInDimLight;
                // brightVisionInBrightLight = token.getFlag("perfect-vision", "brightVisionInBrightLight") || PerfectVision._settings.brightVisionInBrightLight;
                break;
            case "fvtt":
                dimVisionInDarkness = "dim";
                dimVisionInDimLight = "dim";
                // dimVisionInBrightLight = "bright";
                brightVisionInDarkness = "bright";
                brightVisionInDimLight = "bright";
                // brightVisionInBrightLight = "bright";
                break;
            case "dnd5e":
                dimVisionInDarkness = "dim_mono";
                dimVisionInDimLight = "bright";
                // dimVisionInBrightLight = "bright";
                brightVisionInDarkness = "bright";
                brightVisionInDimLight = "bright";
                // brightVisionInBrightLight = "bright";
                break;
            case "pf2e":
                dimVisionInDarkness = "darkness";
                dimVisionInDimLight = "bright";
                // dimVisionInBrightLight = "bright";
                brightVisionInDarkness = "bright_mono";
                brightVisionInDimLight = "bright";
                // brightVisionInBrightLight = "bright";
                break;
        };

        const this_ = PerfectVision._extend(this, {});

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

        const minR = token.w * 0.5 + 0.1 * canvas.dimensions.size;
        opts.dim = opts.dim === 0 && opts.bright === 0 ? minR : opts.dim;

        (PerfectVision._temp_Token_vision_initialize ?? Object.getPrototypeOf(this).initialize).call(this, opts);

        this_.ratio = undefined;
        this_.fov = this.fov;

        const fovCache = { [this.radius]: this.fov };
        const computeFov = (radius) => {
            if (radius <= 0)
                return null;

            if (fovCache[radius])
                return fovCache[radius];

            const { fov } = SightLayer.computeSight({ x: this.x, y: this.y }, radius, {
                angle: this.angle,
                rotation: this.rotation,
                unrestricted: this.type === SOURCE_TYPES.UNIVERSAL
            });
            return fov;
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

    };

    PerfectVision._temp_Token_vision_initialize = this.vision.hasOwnProperty("initialize") ? this.vision.initialize : undefined;
    this.vision.initialize = initialize;

    return arguments;
});

PerfectVision._postHook(Token, "updateSource", function () {
    if (PerfectVision._temp_Token_vision_initialize) {
        this.vision.initialize = PerfectVision._temp_Token_vision_initialize;
        delete PerfectVision._temp_Token_vision_initialize;
    } else {
        delete this.vision.initialize;
    }

    const ilm = canvas.lighting.illumination;
    const ilm_ = PerfectVision._extend(ilm);

    const monoFilter = ilm_.monoFilter;
    const monoFilterIndex = this.icon.filters ? this.icon.filters.indexOf(monoFilter) : -1;

    if (PerfectVision._settings.monoTokenIcons) {
        if (monoFilterIndex < 0) {
            if (this.icon.filters?.length > 0) {
                this.icon.filters.push(monoFilter);

                console.warn(`Perfect Vision | canvas.tokens.get("${this.id}").icon.filters.length > 0`);

                if (this.icon.filterArea !== canvas.app.renderer.screen)
                    console.warn(`Perfect Vision | canvas.tokens.get("${this.id}").icon.filterArea !== canvas.app.renderer.screen`);
            } else {
                this.icon.filters = [monoFilter];
            }

            this.icon.filterArea = canvas.app.renderer.screen;
        }
    } else if (monoFilterIndex >= 0) {
        this.icon.filters.splice(monoFilterIndex);
    }

    return arguments[0];
});

Hooks.once("init", (...args) => PerfectVision._init(...args));

Hooks.on("canvasReady", (...args) => PerfectVision._canvasReady(...args));

Hooks.on("canvasPan", (...args) => PerfectVision._canvasPan(...args));

Hooks.on("lightingRefresh", (...args) => PerfectVision._lightingRefresh(...args));

Hooks.on("sightRefresh", (...args) => PerfectVision._sightRefresh(...args));

Hooks.on("updateToken", (...args) => PerfectVision._updateToken(...args));

Hooks.on("updateScene", (...args) => PerfectVision._updateScene(...args));

Hooks.on("renderSettingsConfig", (...args) => PerfectVision._renderSettingsConfig(...args));

Hooks.on("renderTokenConfig", (...args) => PerfectVision._renderTokenConfig(...args));

Hooks.on("renderSceneConfig", (...args) => PerfectVision._renderSceneConfig(...args));