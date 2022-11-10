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
                    .setSource(this.fragmentShader)
                    .requireVariable("hasFogTexture")
                    .requireVariable("vMaskTextureCoord")
                    .overrideVariable("exploredColor")
                    .addUniform("colorBackgroundTexture", "sampler2D")
                    .addUniform("uniformLighting", "bool")
                    .wrapMain(`\
                        void main() {
                            if (uniformLighting) {
                                exploredColor = @exploredColor;
                            } else {
                                exploredColor = (@exploredColor / @backgroundColor)
                                    * texture2D(colorBackgroundTexture, vMaskTextureCoord).rgb;
                            }

                            @main();
                        }

                        #define PERFECT_VISION
                    ` + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n"))
                    .getSource();
            }

            const shader = wrapped(...args);

            shader.uniforms.lightingTextures = LightingFramebuffer.instance.uniformGroup;

            return shader;
        },
        libWrapper.WRAPPER
    );
});
