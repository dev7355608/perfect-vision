import { Board } from "./board.js";
import { patch } from "../utils/patch.js";
import { SpriteMesh } from "../display/sprite-mesh.js";

Hooks.once("init", () => {
    patch("Canvas.prototype.createBlurFilter", "POST", function (filter) {
        filter.resolution = canvas.app.renderer.resolution;

        return new Proxy(filter, {
            get: function (target, prop, receiver) {
                if (prop === "enabled" && canvas.blurDistance === 0) {
                    return false;
                }

                return Reflect.get(...arguments);
            }
        });
    });

    patch("Canvas.prototype.updateBlur", "OVERRIDE", function (scale) {
        scale = scale || this.stage.scale.x;

        if (this.blurDistance === 0) {
            return;
        }

        this.blurDistance = Math.round(Math.abs(scale) * CONFIG.Canvas.blurStrength);

        for (const filter of this.blurFilters) {
            filter.blur = this.blurDistance;
        }
    });

    patch("Canvas.prototype.draw", "POST", async function (result) {
        await result;

        this._pv_background = this.stage.addChildAt(new SpriteMesh(new BackgroundColorShader()), 0);

        const bgRect = this.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);

        this._pv_background.x = bgRect.x;
        this._pv_background.y = bgRect.y;
        this._pv_background.width = bgRect.width;
        this._pv_background.height = bgRect.height;

        Board.place("backgroundColor", this._pv_background, Board.SEGMENTS.LIGHTING[0], 0);

        return this;
    });

    patch("Canvas.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        BackgroundColorShader.instance.version = -1;

        Board.unplace("backgroundColor");

        this._pv_background.destroy(true);
        this._pv_background = null;

        return await wrapped(...args);
    });
});

class BackgroundColorShader extends PIXI.Shader {
    static vertexSource = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        void main()
        {
            vec3 position = translationMatrix * vec3(aVertexPosition, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
        }`;

    static fragmentSource = `\
        uniform vec3 uColor;

        void main()
        {
            gl_FragColor = vec4(uColor, 1.0);
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSource, this.fragmentSource);
        }

        return this._program;
    }

    static defaultUniforms() {
        return {
            uColor: new Float32Array(3),
        };
    }

    static get instance() {
        if (!this._instance) {
            this._instance = new BackgroundColorShader();
        }

        return this._instance;
    }

    constructor() {
        super(BackgroundColorShader.program, BackgroundColorShader.defaultUniforms());

        this.version = -1;
    }

    update() {
        if (this.version !== canvas.lighting.version) {
            this.version = canvas.lighting.version;

            const channels = canvas.lighting.channels;

            this.uniforms.uColor = channels.canvas.rgb;
        }
    }
}
