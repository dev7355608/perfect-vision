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

        let shape = 0;
        let rotation = (this.data.rotation * Math.PI / 180) % (Math.PI * 2);

        switch (this.object.document.getFlag("lightmask", "shape")) {
            case "triangle":
                shape = 1;
                break;
            case "square":
                shape = 2;
                break;
            case "pentagon":
                shape = 3;
                break;
            case "pentagram":
                shape = 4;
                break;
            case "hexagon":
                shape = 5;
                break;
            case "hexagram":
                shape = 6;
                break;
        }

        if (shape === 0) {
            rotation = 0;
        }

        const uniforms = shader.uniforms;

        uniforms.pv_shape = shape;
        uniforms.pv_rotation = rotation;
    }

    patch("LightSource.prototype._updateCommonUniforms", "WRAPPER", updateShaderUniforms);

    patch("LightSource.prototype._updateDelimiterUniforms", "WRAPPER", updateShaderUniforms);
});
