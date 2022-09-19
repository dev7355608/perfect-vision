import { LightingFramebuffer } from "./lighting-framebuffer.js";
import { ShaderPatcher } from "../utils/shader-patcher.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "VisualEffectsMaskingFilter.create",
        function (wrapped, ...args) {
            const filter = wrapped(...args);

            filter.uniforms.replacementColorTexture = LightingFramebuffer.instance.textures[1];

            if (game.user.isGM) {
                filter.uniforms.brightnessBoost = 0;
            }

            return filter;
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "VisualEffectsMaskingFilter.fragmentShader",
        function (wrapped, filterMode, postProcessModes) {
            let source = wrapped(filterMode, postProcessModes);

            if (filterMode === VisualEffectsMaskingFilter.FILTER_MODES.ILLUMINATION) {
                source = new ShaderPatcher("frag")
                    .setSource(source)
                    .requireVariable("vMaskTextureCoord")
                    .overrideVariable("replacementColor")
                    .addUniform("replacementColorTexture", "sampler2D")
                    .wrapMain(`\
                        void main() {
                            replacementColor = texture2D(replacementColorTexture, vMaskTextureCoord).rgb;
                            repColor = vec4(replacementColor, 1.0);

                            @main();
                        }
                    ` + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n"))
                    .getSource();

                if (game.user.isGM) {
                    source = new ShaderPatcher("frag")
                        .setSource(source)
                        .addUniform("brightnessBoost", "float")
                        .wrapMain(`\
                            void main() {
                                @main();

                                gl_FragColor = gl_FragColor * (1.0 - brightnessBoost) + brightnessBoost;
                            }
                        ` + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n"))
                        .getSource();
                }
            }

            return source;
        },
        libWrapper.WRAPPER
    );
});
