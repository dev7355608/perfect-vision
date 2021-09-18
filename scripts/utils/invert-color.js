export class InvertColor {
    static get geometry() {
        if (!this._geometry) {
            this._geometry = this._geometry = new PIXI.Geometry()
                .addAttribute("aPosition", new PIXI.Buffer(new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]), true, false), 2, false, PIXI.TYPES.FLOAT);
            this._geometry.refCount++;
        }

        return this._geometry;
    }

    static get shader() {
        return this._shader ?? (this._shader = new PIXI.Shader(PIXI.Program.from(`\
            #version 100

            precision ${PIXI.settings.PRECISION_VERTEX} float;

            attribute vec2 aPosition;

            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }`, `\
            #version 100

            precision ${PIXI.settings.PRECISION_FRAGMENT} float;

            void main() {
                gl_FragColor = vec4(1.0);
            }`))
        );
    }

    static get state() {
        return this._state ?? (this._state = new PIXI.State());
    }

    static get drawMode() {
        return PIXI.DRAW_MODES.TRIANGLE_FAN;
    }

    static invert(renderer, red = true, green = true, blue = true, alpha = true) {
        const gl = renderer.gl;
        const { geometry, shader, state, drawMode } = this;

        renderer.batch.flush();

        state.blendMode = PIXI.BLEND_MODES.NONE;

        for (let i = renderer.state.blendModes.length - 1; i >= 0; i--) {
            const blendMode = renderer.state.blendModes[i];

            if (blendMode.length === 2 && blendMode[0] === gl.ONE_MINUS_DST_COLOR && blendMode[1] === gl.ZERO) {
                state.blendMode = i;

                break;
            }
        }

        if (state.blendMode === PIXI.BLEND_MODES.NONE) {
            state.blendMode = renderer.state.blendModes.push([gl.ONE_MINUS_DST_COLOR, gl.ZERO]) - 1;
        }

        renderer.state.set(state);
        renderer.shader.bind(shader, true);
        renderer.geometry.bind(geometry, shader);

        const colorMask = !(red && green && blue && alpha);

        if (colorMask) {
            gl.colorMask(red, green, blue, alpha);
        }

        renderer.geometry.draw(drawMode);

        if (colorMask) {
            gl.colorMask(true, true, true, true);
        }
    }
}
