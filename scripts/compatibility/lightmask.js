import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("lightmask")?.active) {
        return;
    }

    patch("LightSource.prototype.initialize", "WRAPPER", function (wrapped, data) {
        const rotation = this.data.rotation;

        wrapped(data);

        const shape = this.object.document.getFlag("lightmask", "shape");

        if (this.data._pv_shape !== shape || this.data.rotation !== rotation) {
            this.data._pv_shape = shape;

            for (let k of Object.keys(this._resetUniforms)) {
                this._resetUniforms[k] = true;
            }
        }

        return this;
    });

    function updateShaderUniforms(wrapped, shader) {
        wrapped(shader);

        let shape = -1;
        let rotation = (this.data.rotation * Math.PI / 180) % (Math.PI * 2);
        const sides = Math.max(this.object.document.getFlag("lightmask", "sides") || 3, 3);

        switch (this.object.document.getFlag("lightmask", "shape")) {
            case "polygon":
                shape = Math.min(2, sides - 3) + Math.max(sides - 5, 0) * 2;
                break;
            case "star":
                shape = 3 + (Math.max(sides, 5) - 5) * 2;
                break;
        }

        if (shape === -1) {
            rotation = 0;
        }

        const uniforms = shader.uniforms;

        uniforms.pv_shape = shape;
        uniforms.pv_rotation = rotation;
    }

    patch("LightSource.prototype._updateCommonUniforms", "WRAPPER", updateShaderUniforms);

    patch("LightSource.prototype._pv_updateDelimiterUniforms", "WRAPPER", updateShaderUniforms);
});
