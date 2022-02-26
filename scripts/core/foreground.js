import { patch } from "../utils/patch.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";

Hooks.once("init", () => {
    patch("ForegroundLayer.layerOptions", "POST", function (options) {
        return foundry.utils.mergeObject(options, {
            zIndex: BackgroundLayer.layerOptions.zIndex + 200
        });
    });

    patch("ForegroundLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        let stage = this._pv_stage;

        if (stage) {
            stage.transform.reference = canvas.stage.transform;

            for (const child of stage.children) {
                child._parentID = -1;
            }
        } else {
            stage = this._pv_stage = new PIXI.Container();
            stage.transform = new SynchronizedTransform(canvas.stage.transform);

            const geometry = new PIXI.Geometry()
                .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]), true, false), 2, false, PIXI.TYPES.FLOAT)
                .addAttribute("aCenterRadius", new PIXI.Buffer(new Float32Array([]), false, false), 3, false, PIXI.TYPES.FLOAT, undefined, undefined, true);
            const shader = RadialOcclusionShader.instance;

            stage.mesh = stage.addChild(new PIXI.Mesh(geometry, shader, undefined, PIXI.DRAW_MODES.TRIANGLE_FAN));
            stage.mesh.visible = false;
            stage.mesh.geometry.instanceCount = 0;
        }

        let buffer = this._pv_buffer;

        if (!buffer) {
            buffer = this._pv_buffer = CanvasFramebuffer.create(
                { name: "occlusion" },
                [
                    {
                        format: PIXI.FORMATS.RED,
                        type: PIXI.TYPES.UNSIGNED_BYTE,
                        clearColor: [1, 0, 0, 0]
                    }
                ]
            );

            buffer.on("update", buffer => {
                buffer.render(canvas.app.renderer, this._pv_stage);
            });
        }

        await wrapped(...args);

        return this;
    });

    patch("ForegroundLayer.prototype._drawOcclusionMask", "OVERRIDE", function () {
        const placeholder = new PIXI.Container();

        placeholder.renderable = false;
        placeholder.tokens = placeholder.addChild(new PIXI.Container());
        placeholder.roofs = placeholder.addChild(new PIXI.Container());

        return placeholder;
    });

    patch("ForegroundLayer.prototype.initialize", "OVERRIDE", function () {
        // TODO ?
    });

    patch("ForegroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        const stage = this._pv_stage;

        stage.transform.reference = PIXI.Transform.IDENTITY;

        for (const child of stage.children) {
            child._parentID = -1;
        }

        return await wrapped(...args);
    });

    patch("ForegroundLayer.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        let mask = false;

        for (const tile of this.tiles) {
            if (tile.tile) {
                tile.tile.mask = tile._pv_getOcclusionMask();

                if (tile.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
                    mask = true;
                }
            }
        }

        if (mask) {
            this._pv_buffer.invalidate(true);
        } else {
            this._pv_buffer.dispose();
        }

        canvas.weather._pv_refreshBuffer();

        return this;
    });

    patch("ForegroundLayer.prototype._drawOcclusionShapes", "OVERRIDE", function (tokens) {
        if (this.tiles.length !== 0 && tokens?.length > 0) {
            const rMulti = typeof _betterRoofs !== "undefined" /* Better Roofs */ ?
                (canvas.scene.getFlag("betterroofs", "occlusionRadius")
                    ?? game.settings.get("betterroofs", "occlusionRadius")) : 1.0;

            const instances = [];

            for (const token of tokens) {
                const c = token.center;
                const r = Math.max(token.w, token.h);

                instances.push(c.x, c.y, r * rMulti);
            }

            const mesh = this._pv_stage.mesh;
            const geometry = mesh.geometry;

            geometry.buffers[1].update(instances);
            geometry.instanceCount = instances.length / 3;
            mesh.visible = geometry.instanceCount > 0;
        }
    });
});

class RadialOcclusionShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;
        attribute vec3 aCenterRadius;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        varying vec3 vCoord;

        void main() {
            vec2 center = aCenterRadius.xy;
            float radius = aCenterRadius.z;
            vec2 local = aVertexPosition * radius;

            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(center + local, 1.0))).xy, 0.0, 1.0);

            vCoord = vec3(local, radius);
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        uniform float uSmoothness;

        varying vec3 vCoord;

        void main() {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - smoothstep(vCoord.z - uSmoothness, vCoord.z, length(vCoord.xy)));
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }

        return this._instance;
    }

    constructor() {
        super(RadialOcclusionShader.program, { uSmoothness: 0 });
    }

    update() {
        this.uniforms.uSmoothness = canvas.dimensions._pv_inset;
    }
}
