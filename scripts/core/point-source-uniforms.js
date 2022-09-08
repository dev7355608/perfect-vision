import lightingUniformGroup from "./lighting-uniforms.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    const lightmask = !!game.modules.get("lightmask")?.active;

    function updateCommonUniforms(wrapped, shader) {
        wrapped(shader);

        const uniforms = Object.assign(shader.uniforms, lightingUniformGroup.uniforms);

        uniforms.luminosity = this.data.luminosity ?? 0;
        uniforms.resolution ??= [1, 1];
        uniforms.resolution[0] = uniforms.resolution[1] = this.data.resolution ?? 1;

        if (lightmask) {
            let radialFunction = 0;
            let rotation;
            const object = this.object;

            if (object instanceof AmbientLight || object instanceof Token) {
                const flags = object.document.flags.lightmask;
                const sides = Math.max(flags?.sides || 3, 3);

                switch (flags?.shape) {
                    case "polygon": radialFunction = Math.min(3, sides - 2) + Math.max(sides - 5, 0) * 2; break;
                    case "star": radialFunction = 4 + (Math.max(sides, 5) - 5) * 2; break;
                }

                rotation = (this.data.rotation + (flags?.rotation || 0)) * (Math.PI / 180);
            } else {
                rotation = this.data.rotation * (Math.PI / 180);
            }

            uniforms.radialFunction = radialFunction;
            uniforms.rotation = rotation;
        }

        uniforms.illuminationAlpha = this._flags.hasColor ? this.data.alpha : 0.5;
    }

    libWrapper.register(
        "perfect-vision",
        "LightSource.prototype._updateCommonUniforms",
        updateCommonUniforms,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "VisionSource.prototype._updateCommonUniforms",
        updateCommonUniforms,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );
});
