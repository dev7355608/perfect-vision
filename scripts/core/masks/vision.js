import { CachedAlphaObject } from "./utils/alpha.js";
import { Elevation } from "../elevation.js";
import { Mask } from "../mask.js";
import { Tiles } from "../tiles.js";
import { ShapeShader } from "../../display/shape.js";
import { StencilMask, StencilMaskData, StencilMaskShader } from "../../display/stencil-mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("vision", {
        format: PIXI.FORMATS.RGB,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        groups: ["tiles"],
        dependencies: ["elevation"]
    });

    mask.stage.areas = mask.stage.addChild(new PIXI.Container());
    mask.stage.layers = [
        new PIXI.Container(),
        new PIXI.Container(),
        new PIXI.Container()
    ];
    mask.stage.addChild(...mask.stage.layers);
    mask.stage.roofs = mask.stage.addChild(new PIXI.Container());
    mask.stage.los = mask.stage.addChild(new StencilMask());
    mask.stage.msk = new StencilMaskData(mask.stage.los);
    mask.stage.mask = null;

    const shaderBlack = new ShapeShader({ tint: 0x000000 });
    const shaderGreen = new ShapeShader({ tint: 0x00FF00 });

    const stateNormal = PIXI.State.for2d();
    const stateAdd = PIXI.State.for2d();

    stateAdd.blendMode = PIXI.BLEND_MODES.ADD;

    let isVideo = false;

    mask.on("updateTexture", (mask) => {
        mask.render();

        if (isVideo) {
            mask.invalidate();
        }
    });

    Hooks.on("canvasInit", () => {
        isVideo = false;

        let multisample;

        if (game.settings.get("core", "softShadows")) {
            multisample = PIXI.MSAA_QUALITY.LOW;
        } else {
            multisample = PIXI.MSAA_QUALITY.NONE;
        }

        if (mask.texture.multisample !== multisample) {
            mask.reset({ multisample });
        }

        mask.stage.areas.removeChildren().forEach(c => c.destroy(true));

        for (const layer of mask.stage.layers) {
            layer.removeChildren().forEach(c => c.destroy(true));
        }

        mask.stage.roofs.removeChildren();
        mask.stage.los.clear();
        mask.stage.mask = null;
    });

    Hooks.on("lightingRefresh", () => {
        isVideo = false;

        mask.stage.areas.removeChildren().forEach(c => c.destroy(true));

        if (canvas.lighting._pv_globalLight) {
            const fov = canvas.lighting._pv_fov.createMesh(shaderGreen, stateNormal);

            mask.stage.areas.addChild(fov);
        }

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            for (const area of areas) {
                const fov = mask.stage.areas.addChild(area._pv_fov.createMesh(area._pv_globalLight ? shaderGreen : shaderBlack, stateNormal));

                if (area._pv_los) {
                    fov.mask = new StencilMaskData(mask.stage.areas.addChild(area._pv_los.createMesh(StencilMaskShader.instance)));
                }
            }
        }

        for (const layer of mask.stage.layers) {
            layer.removeChildren().forEach(c => c.destroy(true));
        }

        for (const source of canvas.sight.sources) {
            if (!source.active) {
                continue;
            }

            if (source._pv_fovMono) {
                mask.stage.layers[0].addChild(source._pv_fovMono.createMesh(new VisionShader({ source, tint: 0x00FF00 }), stateAdd));
            }

            if (source._pv_fovColor) {
                mask.stage.layers[0].addChild(source._pv_fovColor.createMesh(new VisionShader({ source, tint: 0xFF0000 }), stateAdd));
            }

            if (source._pv_fovBrighten) {
                mask.stage.layers[2].addChild(source._pv_fovBrighten.createMesh(new VisionShader({ source, tint: 0x0000FF }), stateAdd));
            }
        }

        for (const source of canvas.lighting.sources) {
            if (!source.active) {
                continue;
            }

            if (source._pv_radius > 0 && source._pv_fov) {
                mask.stage.layers[1].addChild(source._pv_fov.createMesh(new VisionShader({ source, tint: 0xFF0000 }), stateNormal));
            }
        }

        mask.stage.roofs.removeChildren();

        if (canvas.foreground.displayRoofs) {
            for (const roof of canvas.foreground.roofs) {
                if (!Tiles.isOverhead(roof) || !Tiles.isVisible(roof)) {
                    continue;
                }

                const alpha = CachedAlphaObject.create(roof.tile, { alpha: [Tiles.getAlpha(roof), Tiles.getOcclusionAlpha(roof)], mask: Tiles.getOcclusionMaskTexture(roof) });

                alpha.zIndex = roof.zIndex;
                mask.stage.roofs.addChild(alpha);

                if (roof.isVideo && !roof.sourceElement.paused) {
                    isVideo = true;
                }
            }
        }

        mask.invalidate();
    });

    Hooks.on("sightRefresh", () => {
        mask.stage.los.clear();

        if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
            const areas = canvas.lighting._pv_areas;

            if (areas?.length > 0) {
                for (const area of areas) {
                    mask.stage.los.drawShape(area._pv_fov, area._pv_los ? [area._pv_los] : null, !area._pv_vision);
                }
            }

            for (const source of canvas.sight.sources) {
                if (!source.active) {
                    continue;
                }

                mask.stage.los.drawShape(source._pv_los);
            }

            for (const source of canvas.lighting.sources) {
                if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL) {
                    continue;
                }

                if (source._pv_radius > 0) {
                    mask.stage.los.drawShape(source._pv_fov);
                }
            }

            mask.stage.mask = mask.stage.msk;
        } else {
            mask.stage.mask = null;
        }

        mask.invalidate();
    });
});

class VisionShader extends ShapeShader {
    static elevationVertex = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;
        uniform vec4 uMaskSize;

        varying vec2 vMaskCoord;

        void main()
        {
            vec3 position = translationMatrix * vec3(aVertexPosition, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
            vMaskCoord = position.xy * uMaskSize.zw;
        }`;

    static elevationFragment = `\
        varying vec2 vMaskCoord;

        uniform sampler2D uElevation;
        uniform vec2 uElevationRange;
        uniform vec4 uColor;

        void main()
        {
            float elevation = texture2D(uElevation, vMaskCoord).r;

            if (elevation < 0.0 || uElevationRange.x <= elevation && elevation < uElevationRange.y) {
                gl_FragColor = uColor;
            } else {
                discard;
            }
        }`;

    static get elevationProgram() {
        if (!this._elevationProgram) {
            this._elevationProgram = PIXI.Program.from(this.elevationVertex, this.elevationFragment);
        }

        return this._elevationProgram;
    }

    static get defaultProgram() {
        return Mask.get("elevation") ? this.elevationProgram : ShapeShader.defaultProgram;
    }

    static defaultUniforms() {
        return {
            uMaskSize: Mask.size,
            uElevation: Mask.getTexture("elevation"),
            uElevationRange: new Float32Array(2)
        };
    }

    constructor(options = {}) {
        options = Object.assign({
            program: VisionShader.defaultProgram,
        }, options);

        const uniforms = VisionShader.defaultUniforms();

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        options.uniforms = uniforms;

        super(options);

        this.source = options.source;
    }

    update() {
        super.update();

        if (this.uniforms.uElevation) {
            Elevation.getElevationRange(this.source.object, this.uniforms.uElevationRange);
        }
    }
}
