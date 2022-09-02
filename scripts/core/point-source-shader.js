import { ShaderPatcher } from "../utils/shader-patcher.js";

export class DepthStencilShader extends PIXI.Shader {
    static vertexShader = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;
        uniform mat3 textureMatrix;

        varying vec2 vTextureCoord;

        void main() {
            vTextureCoord = (textureMatrix * vec3(aVertexPosition, 1.0)).xy;
            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(aVertexPosition, 1.0))).xy, 0.0, 1.0);
        }`;

    static fragmentShader = `\
        varying vec2 vTextureCoord;

        uniform sampler2D sampler;
        uniform float alphaThreshold;
        uniform float depthElevation;

        void main() {
            if (texture2D(sampler, vTextureCoord).a <= alphaThreshold) {
                discard;
            }

            gl_FragColor = vec4(0.0, 0.0, 0.0, depthElevation);
        }`;

    /**
     * The default uniforms.
     * @type {object}
     * @readonly
     */
    static defaultUniforms = {
        sampler: PIXI.Texture.WHITE,
        textureMatrix: PIXI.Matrix.IDENTITY,
        alphaThreshold: 0.75,
        depthElevation: 0
    };

    static #program;

    /**
     * Create a new instance.
     * @param {object} [defaultUniforms]- The default uniforms.
     * @returns {DepthStencilShader}
     */
    static create(defaultUniforms = {}) {
        const program = DepthStencilShader.#program ??= PIXI.Program.from(
            DepthStencilShader.vertexShader,
            DepthStencilShader.fragmentShader
        );
        const uniforms = foundry.utils.mergeObject(
            this.defaultUniforms,
            defaultUniforms,
            { inplace: false, insertKeys: false }
        );

        return new this(program, uniforms);
    }

    /**
     * A shared instance.
     * @type {DepthStencilShader}
     * @readonly
     */
    static instance = DepthStencilShader.create();

    /**
     * The texture.
     * @type {PIXI.Texture}
     */
    get texture() {
        return this.uniforms.sampler;
    }

    set texture(value) {
        this.uniforms.sampler = value;
    }

    /**
     * The texture matrix.
     * @type {PIXI.Texture}
     */
    get textureMatrix() {
        return this.uniforms.textureMatrix;
    }

    set textureMatrix(value) {
        this.uniforms.textureMatrix = value;
    }

    /**
     * The alpha threshold.
     * @type {number}
     */
    get alphaThreshold() {
        return this.uniforms.alphaThreshold;
    }

    set alphaThreshold(value) {
        this.uniforms.alphaThreshold = value;
    }

    /**
     * The depth elevation.
     * @type {number}
     */
    get depthElevation() {
        return this.uniforms.depthElevation;
    }

    set depthElevation(value) {
        this.uniforms.depthElevation = value;
    }
}

function patchGLPosition(source) {
    try {
        source = new ShaderPatcher("vert")
            .setSource(source)
            .requireVariable("aDepthValue")
            .replace(
                /\bgl_Position = vec4\(\(projectionMatrix \* tPos\)\.xy, 0\.0, 1\.0\);/gm,
                "gl_Position = vec4((projectionMatrix * tPos).xy, aDepthValue * 2.0 - 1.0, 1.0);"
            )
            .getSource();
    } finally {
        return source;
    }
}

function patchResolutionUniform(source) {
    try {
        // TODO: potential compatibility problems with modules that patch shaders and use vUvs
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("resolution")
            .overrideVariable("vUvs")
            .prependBlock(`
                #ifndef radialLength
                #define radialLength length
                #endif
                #ifndef radialDistance
                #define radialDistance distance
                #endif
            `)
            .replace(/\bfloat dist = (distance|radialDistance)\(vUvs, vec2\(0.5\)\)/gm, "float dist = radialDistance(@vUvs, vec2(0.5))")
            .replace(/\bbeamsEmanation\(uvs, dist\)/gm, "beamsEmanation(uvs, radialLength(uvs))", false)
            .replace(/\bbeamsEmanation\(uvs, dist, pCol\)/gm, "beamsEmanation(uvs, radialLength(uvs), pCol)", false)
            .replace(/\bscale\(vUvs, 10\.0 \* ratio\)/gm, "scale(@vUvs, 10.0 * ratio)", false)
            .replace(/\bwave\(dist\)/gm, "wave(radialDistance(vUvs, vec2(0.5)) * 2.0)", false)
            .replace(/\bdist \* 10\.0 \* intensity \* distortion\b/, "dist * (resolution.x + resolution.y) * 5.0 * intensity * distortion", false)
            .replace(/\bfloat beam = fract\(angle \* 16\.0 \+ time\);/gm, "float beam = fract(angle * 8.0 * (resolution.x + resolution.y) + time);", false)
            .replace(/\bvec2 apivot = PIVOT - dstpivot;/gm, "vec2 apivot = PIVOT - dstpivot * resolution;", false)
            .replace(/\bfloat ddist = (distance|radialDistance)\(uv, PIVOT\)/gm, "float ddist = radialLength(((uv - PIVOT) * mat2(cost, sint, -sint, cost)) / resolution)", false)
            .wrapMain(`\
                void main() {
                    vUvs = (@vUvs - vec2(0.5)) * resolution + vec2(0.5);

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideDarknessLevelUniform(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("vSamplerUvs")
            .overrideVariable("darknessLevel")
            .addUniform("darknessLevelTexture", "sampler2D")
            .wrapMain(`\
                void main() {
                    darknessLevel = texture2D(darknessLevelTexture, vSamplerUvs).r;

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideDarknessPenaltyUniform(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("darknessLevel")
            .addUniform("darknessLightPenalty", "float")
            .overrideVariable("darknessPenalty")
            .wrapMain(`\
                void main() {
                    darknessPenalty = darknessLevel * darknessLightPenalty;

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideColorBackgroundUniform(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("vSamplerUvs")
            .overrideVariable("colorBackground")
            .addUniform("colorBackgroundTexture", "sampler2D")
            .wrapMain(`\
                void main() {
                    colorBackground = texture2D(colorBackgroundTexture, vSamplerUvs).rgb;

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideAmbientDaylightUniform(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("ambientDarkness")
            .requireVariable("colorBackground")
            .requireVariable("darknessLevel")
            .overrideVariable("ambientDaylight")
            .wrapMain(`\
                void main() {
                    ambientDaylight = (colorBackground - ambientDarkness * (1.0 - darknessLevel)) / darknessLevel;

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideAmbientDarknessUniform(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("vSamplerUvs")
            .overrideVariable("ambientDarkness")
            .addUniform("ambientDarknessTexture", "sampler2D")
            .wrapMain(`\
                void main() {
                    ambientDarkness = texture2D(ambientDarknessTexture, vSamplerUvs).rgb;

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideColorVisionUniform(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .requireVariable("ambientBrightest")
            .requireVariable("brightness")
            .requireVariable("colorBackground")
            .requireVariable("darknessPenalty")
            .requireVariable("weights")
            .overrideVariable("colorVision")
            .wrapMain(`\
                void main() {
                    vec3 colorBright = max(mix(colorBackground, ambientBrightest, (1.0 - darknessPenalty) * weights.x), colorBackground);
                    vec3 colorDim = mix(colorBackground, colorBright, weights.y);

                    colorVision = mix(
                        mix(colorBackground, colorDim, brightness * 2.0),
                        mix(colorDim, colorBright, brightness * 2.0 - 1.0),
                        step(0.5, brightness)
                    );

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideColorDimAndBrightUniforms(source) {
    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .overrideVariable("colorDim")
            .overrideVariable("colorBright")
            .addUniform("lightingLevels", "vec4")
            .wrapMain(`\
                void main() {
                    vec3 bright;
                    vec3 dim;
                    float brightLevel;
                    float dimLevel;

                    if (!darkness) {
                        float luminosityPenalty = clamp(luminosity * 2.0, 0.0, 1.0);
                        float luminosityGain = clamp(luminosity * 2.0 - 1.0, 0.0, 1.0);

                        bright = max(
                            mix(
                                mix(colorBackground, ambientBrightest, (1.0 - darknessPenalty) * weights.x),
                                ambientBrightest,
                                luminosityGain
                            ) * luminosityPenalty,
                            colorBackground
                        );
                        dim = mix(colorBackground, bright, weights.y);
                        brightLevel = lightingLevels.x;
                        dimLevel = lightingLevels.y;
                    } else {
                        vec3 colorDarkness = mix(ambientDarkness, colorBackground, weights.w);
                        vec3 iMid = mix(colorBackground, colorDarkness, 0.5);
                        vec3 mid = (color * iMid) * (illuminationAlpha * 2.0);
                        vec3 black = (color * colorDarkness) * (illuminationAlpha * 2.0);

                        float lc;
                        vec3 cdim1, cdim2, cbr1, cbr2;

                        if (luminosity < -0.5) {
                            lc = abs(luminosity) - 0.5;
                            cdim1 = black;
                            cdim2 = black * 0.625;
                            cbr1 = black * 0.5;
                            cbr2 = black * 0.125;
                        } else {
                            lc = sqrt(abs(luminosity) * 2.0);
                            cdim1 = mid;
                            cdim2 = black;
                            cbr1 = mid;
                            cbr2 = black * 0.5;
                        }

                        dim = min(mix(cdim1, cdim2, lc), colorBackground);
                        bright = min(mix(cbr1, cbr2, lc), dim);
                        dimLevel = lightingLevels.z;
                        brightLevel = lightingLevels.w;
                    }

                    colorBright = mix(colorBackground, dim, clamp(brightLevel, 0.0, 1.0));
                    colorBright = mix(colorBright, bright, clamp(brightLevel - 1.0, 0.0, 1.0));
                    colorBright = mix(colorBright, ambientBrightest, clamp(brightLevel - 2.0, 0.0, 1.0));
                    colorDim = mix(colorBackground, dim, clamp(dimLevel, 0.0, 1.0));
                    colorDim = mix(colorDim, bright, clamp(dimLevel - 1.0, 0.0, 1.0));
                    colorDim = mix(colorDim, ambientBrightest, clamp(dimLevel - 2.0, 0.0, 1.0));

                    @main();
                }
            `)
            .getSource();
    } finally {
        return source;
    }
}

function overrideRadialDistance(source) {
    const radialFactors = (n, k) => {
        let s, t;

        if (k === 1) {
            s = Math.hypot(1, Math.tan(Math.PI / n));
            t = 0;
        } else {
            const a = Math.PI * 2 / n;
            const p = foundry.utils.lineLineIntersection(
                { x: 1, y: 0 },
                { x: Math.cos(a * k), y: Math.sin(a * k) },
                { x: Math.cos(a), y: Math.sin(a) },
                { x: Math.cos(a * (1 - k)), y: Math.sin(a * (1 - k)) }
            );
            const r = Math.hypot(p.x, p.y);
            const c = Math.cos(Math.PI / n);
            const d = r * (c * c - 1);

            s = (r * c - 1) / d;
            t = (r - c) / d;
        }

        return [(Math.PI * 2) / n, s, t];
    };

    const radialFunctions = [[3, 1], [4, 1]];

    for (let i = 0; i < 8; i++) {
        radialFunctions.push([i + 5, 1], [i + 5, 2]);
    }

    try {
        source = new ShaderPatcher("frag")
            .setSource(source)
            .prependBlock(`\
                #ifdef radialLength
                #undef radialLength
                #endif
                #ifdef radialDistance
                #undef radialDistance
                #endif
                #define LIGHT_MASK
                #ifdef LIGHT_MASK
                float @@radialLength(vec2 v) {
                    float d = length(v);
                    float s1;
                    float s2;
                    float s3;
                    if (radialFunction == 0) return d;
                    ${radialFunctions.map(([n, k], i) => `${i > 0 ? "else" : ""} if (radialFunction == ${i + 1}) { `
                + radialFactors(n, k).map((v, i) => `s${i + 1} = ${toFloatLiteral(v)};`).join(" ") + " }").join("\n")}
                    else return d;
                    float a = atan(v.y, v.x) - rotation;
                    float k = a / s1;
                    return (s2 * cos(a - (floor(k) + 0.5) * s1) - s3 * cos(a - floor(k + 0.5) * s1)) * d;
                }
                float @@radialDistance(vec2 p, vec2 q) {
                    return @@radialLength(p - q);
                }
                #define radialLength @@radialLength
                #define radialDistance @@radialDistance
                #else
                #define radialLength length
                #define radialDistance distance
                #endif
            `)
            .addUniform("radialFunction", "int")
            .addUniform("rotation", "float")
            .replace(/\bdistance\s*\(\s*vUvs\s*,\s*vec2\s*\(\s*0.5\s*\)\s*\)/gm, "radialDistance(vUvs, vec2(0.5))")
            .replace(/\blength\s*\(\s*nuv\s*\)/gm, "radialLength(nuv)", false)
            .replace(/\bdistance\s*\(\s*uv\s*,\s*PIVOT\s*\)/gm, "radialDistance(uv, PIVOT)", false)
            .getSource();
    } finally {
        return source;
    }
}

function toFloatLiteral(x) {
    x = Math.fround(x);

    if (Math.abs(x) < 1e-8) {
        return "0.0";
    }

    for (let n = 17; n > 0; n--) {
        if (x !== Math.fround(x.toFixed(n))) {
            return x.toFixed(n + 1);
        }
    }

    return x.toFixed(1);
}

function applyPatches(shaderClass, patchVertex, patchFrag) {
    if (patchVertex && !shaderClass.vertexShader.includes("#define PERFECT_VISION\n")) {
        shaderClass.vertexShader = patchVertex(shaderClass.vertexShader)
            + "\n\n#define PERFECT_VISION\n"
            + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n");
    }
    if (patchFrag && !shaderClass.fragmentShader.includes("#define PERFECT_VISION\n")) {
        shaderClass.fragmentShader = patchFrag(shaderClass.fragmentShader)
            + "\n\n#define PERFECT_VISION\n"
            + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n");
    }
}

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    const lightmask = !!game.modules.get("lightmask")?.active;

    libWrapper.register(
        "perfect-vision",
        "AdaptiveLightingShader.create",
        function (wrapped, ...args) {
            applyPatches(
                this,
                source => {
                    source = patchGLPosition(source);

                    return source;
                },
                source => {
                    source = overrideColorDimAndBrightUniforms(source);
                    source = overrideColorVisionUniform(source);
                    source = overrideAmbientDarknessUniform(source);
                    source = overrideAmbientDaylightUniform(source);
                    source = overrideColorBackgroundUniform(source);
                    source = overrideDarknessPenaltyUniform(source);
                    source = overrideDarknessLevelUniform(source);

                    if (lightmask) {
                        source = overrideRadialDistance(source);
                    }

                    if (!(this.prototype instanceof AdaptiveVisionShader)) {
                        source = patchResolutionUniform(source);
                    }

                    return source;
                }
            );

            return wrapped(...args);
        },
        libWrapper.WRAPPER
    );
});
