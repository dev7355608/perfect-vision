import { CachedAlphaObject } from "./utils/alpha.js";
import { Elevation } from "../elevation.js";
import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";
import { SourcePolygonMesh, SourcePolygonMeshShader } from "../../display/source-polygon-mesh.js";
import { Tiles } from "../tiles.js";

Hooks.once("init", () => {
    const mask = Mask.create("vision", {
        format: PIXI.FORMATS.RGB,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        groups: ["tiles"],
        dependencies: ["elevation"]
    });

    mask.stage.background = mask.stage.addChild(new PIXI.Graphics());
    mask.stage.layers = [
        new PIXI.Container(),
        new PIXI.Container(),
        new PIXI.Container()
    ];
    mask.stage.addChild(
        mask.stage.layers[0],
        mask.stage.layers[1],
        mask.stage.layers[2]
    );
    mask.stage.roofs = mask.stage.addChild(new PIXI.Container());
    mask.stage.los = mask.stage.addChild(new PIXI.Graphics());
    mask.stage.mask = null;

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        if (game.settings.get("core", "softShadows")) {
            mask.texture.multisample = canvas.app.renderer.multisample;
        } else {
            mask.texture.multisample = PIXI.MSAA_QUALITY.NONE;
        }

        mask.stage.background.clear();

        for (const layer of mask.stage.layers) {
            layer.removeChildren();
        }

        mask.stage.roofs.removeChildren();
        mask.stage.los.clear();
    });

    Hooks.on("lightingRefresh", () => {
        mask.stage.background.clear();

        if (canvas.lighting._pv_globalLight) {
            mask.stage.background.beginFill(0x00FF00).drawShape(canvas.lighting._pv_shape).endFill();
        }

        for (const area of canvas.lighting._pv_areas) {
            if (area._pv_globalLight) {
                mask.stage.background.beginFill(0x00FF00).drawShape(area._pv_shape).endFill();
            } else {
                mask.stage.background.beginFill(0x000000).drawShape(area._pv_shape).endFill();
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
                    mask.invalidate();
                }
            }
        }

        mask.invalidate();
    });

    Hooks.on("sightRefresh", () => {
        mask.stage.los.clear();

        if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
            mask.stage.los.beginFill();

            for (const source of canvas.sight.sources) {
                if (!source.active) {
                    continue;
                }

                mask.stage.los.drawPolygon(source.los);
            }

            for (const source of canvas.lighting.sources) {
                if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL) {
                    continue;
                }

                mask.stage.los.drawPolygon(source.fov);
            }

            mask.stage.los.endFill();
            mask.stage.los.visible = true;
            mask.stage.mask = mask.stage.los;
        } else {
            mask.stage.los.visible = false;
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
                    c._pv_fov = new SourcePolygonMesh(this._pv_fov, new VisionSourcePolygonMeshShader({
                        source: this,
                        tint: 0xFF0000
                    }));
                } else {
                    c._pv_fov.polygon = this._pv_fov;
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

        source._pv_area = null;
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
