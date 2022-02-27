import { patch } from "../utils/patch.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";

Hooks.once("init", () => {
    patch("ForegroundLayer.layerOptions", "POST", function (options) {
        return foundry.utils.mergeObject(options, {
            zIndex: BackgroundLayer.layerOptions.zIndex + 200
        });
    });

    patch("ForegroundLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        CanvasFramebuffer.get("occlusionRadial").draw();
        CanvasFramebuffer.get("roofs").draw();

        await wrapped(...args);

        return this;
    });

    patch("ForegroundLayer.prototype._drawOcclusionMask", "OVERRIDE", function () {
        const placeholder = new PIXI.Container();

        placeholder.renderable = false;
        placeholder.tokens = placeholder.addChild(new PIXI.Container());
        placeholder.roofs = placeholder.addChild(new PIXI.Container());
        placeholder.roofs.sortableChildren = true;

        return placeholder;
    });

    patch("ForegroundLayer.prototype.initialize", "OVERRIDE", function () {
        // TODO ?
    });

    patch("ForegroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        CanvasFramebuffer.get("occlusionRadial").tearDown();
        CanvasFramebuffer.get("roofs").tearDown();

        return await wrapped(...args);
    });

    patch("ForegroundLayer.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        let occlusionRadial = false;

        for (const tile of this.tiles) {
            if (tile.tile) {
                tile.tile.mask = tile._pv_getOcclusionMask();

                if (tile.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
                    occlusionRadial = true;
                }
            }
        }

        if (occlusionRadial) {
            CanvasFramebuffer.get("occlusionRadial").acquire();
        } else {
            CanvasFramebuffer.get("occlusionRadial").dispose();
        }

        CanvasFramebuffer.get("roofs").refresh();
        CanvasFramebuffer.get("weatherMask").refresh();

        return this;
    });

    patch("ForegroundLayer.prototype._drawOcclusionShapes", "OVERRIDE", function (tokens) {
        CanvasFramebuffer.get("occlusionRadial").refresh(tokens);
    });
});

Hooks.once("canvasInit", () => {
    RadialOcclusionFramebuffer.create({ name: "occlusionRadial" });
    RoofsFramebuffer.create({ name: "roofs", dependencies: ["lighting"] });
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

class RadialOcclusionFramebuffer extends CanvasFramebuffer {
    constructor() {
        super([
            {
                format: PIXI.FORMATS.RED,
                type: PIXI.TYPES.UNSIGNED_BYTE,
                clearColor: [1, 0, 0, 0]
            }
        ]);
    }

    draw() {
        super.draw();

        const geometry = new PIXI.Geometry()
            .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]), true, false), 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aCenterRadius", new PIXI.Buffer(new Float32Array([]), false, false), 3, false, PIXI.TYPES.FLOAT, undefined, undefined, true);
        const shader = RadialOcclusionShader.instance;

        this.mesh = this.stage.addChild(new PIXI.Mesh(geometry, shader, undefined, PIXI.DRAW_MODES.TRIANGLE_FAN));
        this.mesh.geometry.instanceCount = 0;
        this.stage.sortableChildren = true;
        this.stage.visible = false;
    }

    refresh(tokens) {
        if (canvas.foreground.tiles.length !== 0 && tokens?.length > 0) {
            const rMulti = typeof _betterRoofs !== "undefined" /* Better Roofs */ ?
                (canvas.scene.getFlag("betterroofs", "occlusionRadius")
                    ?? game.settings.get("betterroofs", "occlusionRadius")) : 1.0;

            const instances = [];

            for (const token of tokens) {
                const c = token.center;
                const r = Math.max(token.w, token.h);

                instances.push(c.x, c.y, r * rMulti);
            }

            const mesh = this.mesh;
            const geometry = mesh.geometry;

            geometry.buffers[1].update(instances);
            geometry.instanceCount = instances.length / 3;

            this.stage.visible = geometry.instanceCount > 0;
        } else {
            this.stage.visible = false;
        }

        this.invalidate();
    }
}

class RoofsFramebuffer extends CanvasFramebuffer {
    constructor() {
        super([{
            format: PIXI.FORMATS.RED,
            type: PIXI.TYPES.UNSIGNED_BYTE,
            clearColor: [1, 0, 0, 0]
        }]);
    }

    draw() {
        super.draw();

        this.stage.visible = false;
    }

    refresh() {
        this.stage.removeChildren().forEach(c => c.destroy());
        this.baseTextures.forEach(t => t.off("update", this._onBaseTextureUpdate, this));
        this.baseTextures.length = 0;

        if (canvas.foreground.displayRoofs) {
            for (const roof of canvas.foreground.roofs) {
                if (roof.occluded && roof.tile.alpha <= 0) {
                    continue;
                }

                const sprite = roof._pv_createSprite();

                if (!sprite) {
                    continue;
                }

                sprite.tint = 0x000000;
                sprite.texture.baseTexture.on("update", this._onBaseTextureUpdate, this);

                this.baseTextures.push(sprite.texture.baseTexture);
                this.stage.addChild(sprite);
            }
        }

        this.stage.visible = this.stage.children.length !== 0;

        this.acquire();
        this.invalidate();
    }
}
