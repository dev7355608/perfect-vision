import { CachedAlphaObject } from "./utils/alpha.js";
import { Elevation, ElevationFilter } from "../elevation.js";
import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";
import { SourcePolygonMesh, SourcePolygonMeshShader } from "../../display/source-polygon-mesh.js";
import { Tiles } from "../tiles.js";
import { TexturelessMeshMaterial } from "../../display/mesh.js";

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
    mask.stage.los = mask.stage.addChild(new PIXI.Container());
    mask.stage.msk = new PIXI.MaskData(mask.stage.los);
    mask.stage.msk.type = PIXI.MASK_TYPES.STENCIL;
    mask.stage.msk.autoDetect = false;
    mask.stage.mask = null;

    const shaderBlack = new TexturelessMeshMaterial({ tint: 0x000000 });
    const shaderGreen = new TexturelessMeshMaterial({ tint: 0x00FF00 });

    let isVideo = false;

    mask.on("updateTexture", (mask) => {
        mask.render();

        if (isVideo) {
            mask.invalidate();
        }
    });

    Hooks.on("canvasInit", () => {
        isVideo = false;

        mask.clearColor = [0, 0, 0];

        if (game.settings.get("core", "softShadows")) {
            mask.texture.multisample = canvas.app.renderer.multisample;
        } else {
            mask.texture.multisample = PIXI.MSAA_QUALITY.NONE;
        }

        mask.stage.areas.removeChildren().forEach(c => c.destroy(true));

        for (const layer of mask.stage.layers) {
            layer.removeChildren();
        }

        mask.stage.roofs.removeChildren();
        mask.stage.los.removeChildren().forEach(c => c.destroy(true));
        mask.stage.mask = null;
    });

    Hooks.on("lightingRefresh", () => {
        isVideo = false;

        mask.clearColor[1] = canvas.lighting._pv_globalLight ? 1 : 0;

        mask.stage.areas.removeChildren().forEach(c => c.destroy(true));

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            const elevation = !canvas.sight.fogExploration && Mask.get("elevation");

            for (const area of areas) {
                if (area.skipRender) {
                    continue;
                }

                const fov = area._pv_fov.createMesh(area._pv_globalLight ? shaderGreen : shaderBlack);

                if (area._pv_los) {
                    const los = area._pv_los.createMaskData();

                    fov.mask = los;

                    mask.stage.areas.addChild(los.maskObject);
                }

                if (elevation) {
                    fov.filters = [new ElevationFilter(Elevation.getElevationRange(area))];
                }

                mask.stage.areas.addChild(fov);
            }
        }

        for (const layer of mask.stage.layers) {
            layer.removeChildren();
        }

        for (const source of canvas.sight.sources) {
            if (!source.active) {
                continue;
            }

            const sc = source.illumination;

            if (sc._pv_fovMono) {
                mask.stage.layers[0].addChild(sc._pv_fovMono);
            }

            if (sc._pv_fovColor) {
                mask.stage.layers[0].addChild(sc._pv_fovColor);
            }

            if (sc._pv_fovBrighten) {
                mask.stage.layers[2].addChild(sc._pv_fovBrighten);
            }
        }

        for (const source of canvas.lighting.sources) {
            if (!source.active) {
                continue;
            }

            const sc = source.illumination;

            if (sc._pv_fov) {
                mask.stage.layers[1].addChild(sc._pv_fov);
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
        mask.stage.los.removeChildren().forEach(c => c.destroy(true));

        if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
            for (const source of canvas.sight.sources) {
                if (!source.active) {
                    continue;
                }

                mask.stage.los.addChild(source._pv_los.createMesh());
            }

            for (const source of canvas.lighting.sources) {
                if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL) {
                    continue;
                }

                mask.stage.los.addChild(source._pv_fov.createMesh());
            }

            mask.stage.mask = mask.stage.msk;
        } else {
            mask.stage.mask = null;
        }

        mask.invalidate();
    });

    patch("PointSource.prototype._createContainer", "POST", function (c, shaderCls) {
        if (shaderCls === StandardIlluminationShader || shaderCls.prototype instanceof StandardIlluminationShader) {
            this._pv_illumination_version = -1;
        } else if (shaderCls === StandardColorationShader || shaderCls.prototype instanceof StandardColorationShader) {
            this._pv_coloration_version = -1;
        }

        return c;
    });

    patch("PointSource.prototype.drawLight", "POST", function (c) {
        if (c === null || this._pv_illumination_version === c._pv_version) {
            return c;
        }

        this._pv_illumination_version = c._pv_illumination_version;

        if (this.sourceType === "light") {
            if (this._pv_radius > 0) {
                if (!c._pv_fov) {
                    c._pv_fov = new SourcePolygonMesh(this._pv_fov.shape, new VisionSourcePolygonMeshShader({
                        source: this,
                        tint: 0xFF0000
                    }));
                } else {
                    c._pv_fov.polygon = this._pv_fov.shape;
                }
            } else if (c._pv_fov) {
                c._pv_fov.destroy(true);
                c._pv_fov = null;
            }

            mask.invalidate();
        } else if (this.sourceType === "sight") {
            if (this._pv_fovMono) {
                if (!c._pv_fovMono) {
                    c._pv_fovMono = new SourcePolygonMesh(this._pv_fovMono, new VisionSourcePolygonMeshShader({
                        source: this,
                        tint: 0x00FF00
                    }));
                    c._pv_fovMono.blendMode = PIXI.BLEND_MODES.ADD;
                } else {
                    c._pv_fovMono.polygon = this._pv_fovMono;
                }
            } else if (c._pv_fovMono) {
                c._pv_fovMono.destroy(true);
                c._pv_fovMono = null;
            }

            if (this._pv_fovColor) {
                if (!c._pv_fovColor) {
                    c._pv_fovColor = new SourcePolygonMesh(this._pv_fovColor, new VisionSourcePolygonMeshShader({
                        source: this,
                        tint: 0xFF0000
                    }));
                    c._pv_fovColor.blendMode = PIXI.BLEND_MODES.ADD;
                } else {
                    c._pv_fovColor.polygon = this._pv_fovColor;
                }
            } else if (c._pv_fovColor) {
                c._pv_fovColor.destroy(true);
                c._pv_fovColor = null;
            }

            if (this._pv_fovBrighten) {
                if (!c._pv_fovBrighten) {
                    c._pv_fovBrighten = new SourcePolygonMesh(this._pv_fovBrighten, new VisionSourcePolygonMeshShader({
                        source: this,
                        tint: 0x0000FF
                    }));
                    c._pv_fovBrighten.blendMode = PIXI.BLEND_MODES.ADD;
                } else {
                    c._pv_fovBrighten.polygon = this._pv_fovBrighten;
                }
            } else if (c._pv_fovBrighten) {
                c._pv_fovBrighten.destroy(true);
                c._pv_fovBrighten = null;
            }

            mask.invalidate();
        }

        return c;
    });

    function destroyPointSource(source) {
        const c = source.illumination;

        if (c._pv_fov) {
            c._pv_fov.destroy(true);
            c._pv_fov = null;
        }

        if (c._pv_fovMono) {
            c._pv_fovMono.destroy(true);
            c._pv_fovMono = null;
        }

        if (c._pv_fovColor) {
            c._pv_fovColor.destroy(true);
            c._pv_fovColor = null;
        }

        if (c._pv_fovBrighten) {
            c._pv_fovBrighten.destroy(true);
            c._pv_fovBrighten = null;
        }
    }

    patch("Token.prototype.destroy", "PRE", function () {
        destroyPointSource(this.vision);
        destroyPointSource(this.light);

        return arguments;
    });

    patch("AmbientLight.prototype.destroy", "PRE", function () {
        destroyPointSource(this.source);

        return arguments;
    });
});

class VisionSourcePolygonMeshShader extends SourcePolygonMeshShader {
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
                gl_FragColor = vec4(0.0);
            }
        }`;

    static get elevationProgram() {
        if (!this._elevationProgram) {
            this._elevationProgram = PIXI.Program.from(this.elevationVertex, this.elevationFragment);
        }

        return this._elevationProgram;
    }

    static get defaultProgram() {
        return Mask.get("elevation") ? this.elevationProgram : SourcePolygonMeshShader.defaultProgram;
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
            program: VisionSourcePolygonMeshShader.defaultProgram,
        }, options);

        const uniforms = VisionSourcePolygonMeshShader.defaultUniforms();

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        options.uniforms = uniforms;

        super(options);
    }

    update() {
        super.update();

        if (this.uniforms.uElevation) {
            Elevation.getElevationRange(this.source.object, this.uniforms.uElevationRange);
        }
    }
}
