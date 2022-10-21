Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "LightSource.prototype._createMeshes",
        function (wrapped, ...args) {
            wrapped(...args);

            this.delimiter = this._createMesh(AdaptiveDelimiterShader);
            this.delimiter.shader.container = this.delimiter;
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "VisionSource.prototype._createMeshes", function (wrapped, ...args) {
            wrapped(...args);

            this.delimiter = this._createMesh(DelimiterVisionShader);
            this.delimiter.shader.container = this.delimiter;
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "LightSource.prototype._initializeBlending",
        function (wrapped, ...args) {
            wrapped(...args);

            this.delimiter.blendMode = PIXI.BLEND_MODES[this.isDarkness ? "MIN_COLOR" : "MAX_COLOR"];
            this.delimiter.zIndex = this.data.z ?? (this.isDarkness ? 10 : 0);
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "VisionSource.prototype._initializeBlending",
        function (wrapped, ...args) {
            wrapped(...args);

            this.delimiter.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
            this.delimiter.zIndex = 0;
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    function destroy(wrapped, ...args) {
        wrapped(...args);

        this.delimiter?.destroy();
    }

    libWrapper.register(
        "perfect-vision",
        "LightSource.prototype.destroy",
        destroy,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "VisionSource.prototype.destroy",
        destroy,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    function updateUniforms(wrapped, ...args) {
        wrapped(...args);

        if (!this._meshesInit) {
            return;
        }

        this._updateDelimiterUniforms();
    }

    libWrapper.register(
        "perfect-vision",
        "LightSource.prototype._updateUniforms",
        updateUniforms,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "VisionSource.prototype._updateUniforms",
        updateUniforms,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    Hooks.once("createEffectsCanvasGroup", effects => {
        effects.delimiter = effects.addChildAt(new CanvasDelimiterEffects(), effects.getChildIndex(effects.visibility));
    });

    Hooks.on("drawEffectsCanvasGroup", async () => {
        await canvas.effects.delimiter.draw();

        canvas.perception.update({ refreshLighting: true }, true);
    });

    Hooks.on("lightingRefresh", () => {
        const del = canvas.effects.delimiter;

        if (!del) {
            return;
        }

        del.lights.removeChildren();
        del.visible = game.settings.get("perfect-vision", "delimiters");

        for (const lightSource of canvas.effects.lightSources) {
            if (!lightSource.active || lightSource.disabled) {
                continue;
            }

            const delimiter = lightSource.drawDelimiter();

            if (delimiter) {
                del.lights.addChild(delimiter);
            }
        }

        for (const visionSource of canvas.effects.visionSources) {
            if (visionSource.radius <= 0) {
                continue;
            }

            const delimiter = visionSource.drawDelimiter();

            if (delimiter) {
                del.lights.addChild(delimiter);
            }
        }

        PointSourceMesh._sortByZIndex(del.lights.children);
    });

    LightSource.prototype.drawDelimiter = VisionSource.prototype.drawDelimiter = function () {
        if (this._resetUniforms.delimiter ?? true) {
            this._updateDelimiterUniforms();
        }

        if (!canvas.effects.delimiter.visible) {
            this.delimiter.visible = false;

            return null;
        }

        return this._updateMesh(this.delimiter);
    };

    LightSource.prototype._updateDelimiterUniforms = VisionSource.prototype._updateDelimiterUniforms = function () {
        this._updateCommonUniforms(this.delimiter.shader);
        this._resetUniforms.delimiter = false;
    };
});

class CanvasDelimiterEffects extends CanvasLayer {
    /**
     * The filter used to mask visual effects on this layer.
     * @type {VisualEffectsMaskingFilter}
     */
    filter;

    constructor() {
        super();

        /**
         * A minimalist texture that holds the background color.
         * @type {PIXI.Texture}
         */
        this.backgroundColorTexture = PIXI.Texture.fromBuffer(new Float32Array([0.5, 0.5, 0.5]), 1, 1, {
            type: PIXI.TYPES.FLOAT,
            format: PIXI.FORMATS.RGB,
            wrapMode: PIXI.WRAP_MODES.CLAMP,
            scaleMode: PIXI.SCALE_MODES.NEAREST,
            mipmap: PIXI.MIPMAP_MODES.OFF
        });
        this.background = this.addChild(new PIXI.LegacyGraphics());
        this.lights = this.addChild(new PIXI.Container());
        this.lights.sortableChildren = true;
    }

    /**
     * Clear delimiter effects container.
     */
    clear() {
        this.lights.removeChildren();
    }

    /** @override */
    async _draw(options) {
        this.filter = VisualEffectsMaskingFilter.create({
            filterMode: VisualEffectsMaskingFilter.FILTER_MODES.BACKGROUND,
            uRoofSampler: canvas.masks.depth.renderTexture,
            uVisionSampler: canvas.masks.vision.renderTexture
        });
        this.filter.blendMode = PIXI.BLEND_MODES.NORMAL;
        this.filterArea = canvas.app.renderer.screen;
        this.filters = [this.filter, DotFilter.create()];
        canvas.effects.visualEffectsMaskingFilters.add(this.filter);
        this.drawBaseline();
    }

    /** @override */
    async _tearDown(options) {
        canvas.effects.visualEffectsMaskingFilters.delete(this.filter);
        this.background.clear();
        this.clear();
    }

    /**
     * Draw delimiter baseline.
     */
    drawBaseline() {
        const bgRect = canvas.dimensions.rect.clone();

        this.background.clear().beginFill(0x808080).drawShape(bgRect).endFill();
    }

    /** @override */
    render(renderer) {
        PointSourceMesh._priorBlendMode = undefined;
        PointSourceMesh._currentTexture = this.backgroundColorTexture;

        super.render(renderer);
    }
}

class AdaptiveDelimiterShader extends AdaptiveLightingShader {
    /** @override */
    static SHADER_HEADER = `\
        uniform float attenuation;
        uniform bool darkness;
        uniform float depthElevation;
        uniform vec4 lightingLevels;
        uniform float ratio;
        uniform bool useSampler;
        uniform sampler2D primaryTexture;
        uniform sampler2D framebufferTexture;
        uniform sampler2D depthTexture;
        varying vec2 vUvs;
        varying vec2 vSamplerUvs;
        varying float vDepth;
        ${this.SWITCH_COLOR}`;

    /** @override */
    static fragmentShader = `
        ${this.SHADER_HEADER}
        void main() {
            ${AdaptiveIlluminationShader.FRAGMENT_BEGIN}
            vec3 colorBackground = vec3(0.5);
            vec3 colorDim;
            vec3 colorBright;
            vec3 dim;
            vec3 bright;
            float dimLevel;
            float brightLevel;
            if (darkness) {
                dim = vec3(0.25);
                bright = vec3(0.0);
                dimLevel = lightingLevels.y;
                brightLevel = lightingLevels.x;
            } else {
                dim = vec3(0.75);
                bright = vec3(1.0);
                dimLevel = lightingLevels.z;
                brightLevel = lightingLevels.w;
            }
            colorDim = mix(colorBackground, dim, smoothstep(0.0, 1.0, dimLevel));
            colorDim = mix(colorDim, bright, smoothstep(1.0, 2.0, dimLevel));
            colorBright = mix(colorBackground, dim, smoothstep(0.0, 1.0, brightLevel));
            colorBright = mix(colorBright, bright, smoothstep(1.0, 2.0, brightLevel));
            ${AdaptiveIlluminationShader.TRANSITION}
            ${AdaptiveIlluminationShader.FALLOFF}
            ${AdaptiveIlluminationShader.FRAGMENT_END}
        }`;

    /** @override */
    static defaultUniforms = {
        attenuation: 0.5,
        darkness: false,
        depthElevation: 1,
        lightingLevels: [0, 0, 0, 0],
        ratio: 0.5,
        useSampler: false,
        primaryTexture: null,
        framebufferTexture: null,
        depthTexture: null
    };
}

class DelimiterVisionShader extends AdaptiveVisionShader {
    /** @override */
    static SHADER_HEADER = `\
        uniform float attenuation;
        uniform float brightness;
        uniform float depthElevation;
        uniform bool useSampler;
        uniform sampler2D primaryTexture;
        uniform sampler2D framebufferTexture;
        uniform sampler2D depthTexture;
        varying vec2 vUvs;
        varying vec2 vSamplerUvs;
        varying float vDepth;`;

    /** @override */
    static fragmentShader = `
        ${this.SHADER_HEADER}
        void main() {
            ${IlluminationVisionShader.FRAGMENT_BEGIN}
            vec3 colorBackground = vec3(0.5);
            vec3 colorVision = vec3(brightness * 0.5 + 0.5);
            ${IlluminationVisionShader.VISION_COLOR}
            ${IlluminationVisionShader.FALLOFF}
            ${IlluminationVisionShader.FRAGMENT_END}
        }`;

    /** @override */
    static defaultUniforms = {
        attenuation: 0.5,
        brightness: 0.5,
        depthElevation: 1,
        useSampler: false,
        primaryTexture: null,
        framebufferTexture: null,
        depthTexture: null
    };
}

class DotFilter extends AbstractBaseFilter {
    /** @override */
    static vertexShader = `
        attribute vec2 aVertexPosition;

        uniform vec2 offset;
        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;

        varying vec2 vTextureCoord[9];
        varying vec2 vWorldCoord;

        void main() {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
            vec2 textureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
            vTextureCoord[0] = textureCoord + inputSize.zw * vec2(0.0, 0.0);
            vTextureCoord[1] = textureCoord + inputSize.zw * vec2(-1.0, 0.0);
            vTextureCoord[2] = textureCoord + inputSize.zw * vec2(1.0, 0.0);
            vTextureCoord[3] = textureCoord + inputSize.zw * vec2(0.0, -1.0);
            vTextureCoord[4] = textureCoord + inputSize.zw * vec2(0.0, 1.0);
            vTextureCoord[5] = textureCoord + inputSize.zw * vec2(-1.0, -1.0);
            vTextureCoord[6] = textureCoord + inputSize.zw * vec2(1.0, -1.0);
            vTextureCoord[7] = textureCoord + inputSize.zw * vec2(-1.0, 1.0);
            vTextureCoord[8] = textureCoord + inputSize.zw * vec2(1.0, 1.0);
            vWorldCoord = aVertexPosition * outputFrame.zw + outputFrame.xy + offset;
        }`;

    /** @override */
    static fragmentShader = `\
        varying vec2 vTextureCoord[9];
        varying vec2 vWorldCoord;

        uniform sampler2D uSampler;

        float cluster(float brightness) {
            if (brightness < 0.125) {
                brightness = 0.00;
            } else if (brightness < 0.375) {
                brightness = 0.25;
            } else if (brightness < 0.625) {
                brightness = 0.50;
            } else if (brightness < 0.875) {
                brightness = 0.75;
            } else  {
                brightness = 1.00;
            }
            return brightness;
        }

        void main() {
            float brightness = 0.0;
            for (int i = 0; i < 9; i++) {
                brightness += cluster(texture2D(uSampler, vTextureCoord[i]).r);
            }
            brightness /= 9.0;
            vec2 point = vWorldCoord / 3.0;
            float alpha = (sin(point.x) * sin(point.y)) * 4.0 - mix(4.0, 2.0, brightness);
            gl_FragColor = vec4(brightness * alpha);
        }`;

    /** @override */
    static create() {
        return super.create({ offset: new PIXI.Point() });
    }

    /** @override */
    apply(filterManager, input, output, clearMode, currentState) {
        const wt = canvas.effects.delimiter.worldTransform;

        this.uniforms.offset.set(-wt.tx, -wt.ty);

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
