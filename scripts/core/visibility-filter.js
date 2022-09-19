import { LightingFramebuffer } from "./lighting-framebuffer.js";
import { ShaderPatcher } from "../utils/shader-patcher.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "VisibilityFilter.create",
        function (wrapped, ...args) {
            if (!this.fragmentShader.includes("#define PERFECT_VISION\n")) {
                this.fragmentShader = new ShaderPatcher("frag")
                    .setSource(source)
                    .requireVariable("hasFogTexture")
                    .requireVariable("vMaskTextureCoord")
                    .overrideVariable("backgroundColor")
                    .addUniform("backgroundColorTexture", "sampler2D")
                    .wrapMain(`\
                        void main() {
                            if (hasFogTexture) {
                                backgroundColor = texture2D(backgroundColorTexture, vMaskTextureCoord).rgb;
                            }

                            @main();
                        }

                        #define PERFECT_VISION
                    ` + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n"))
                    .getSource();
            }

            const shader = wrapped(...args);

            shader.uniforms.backgroundColorTexture = LightingFramebuffer.instance.textures[1];

            return shader;
        },
        libWrapper.WRAPPER
    );
});
