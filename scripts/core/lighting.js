import { LightingFramebuffer } from "./lighting-framebuffer.js";
import { LightingRegionSource, LightingSystem } from "./lighting-system.js";
import { RayCastingSystem } from "./ray-casting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    let globalLight = false;
    let fogExploration = false;
    let illuminationBackground;

    Hooks.once("createEffectsCanvasGroup", effects => {
        effects.background.vision.sortableChildren = false;
        effects.background.lighting.sortableChildren = false;
        effects.illumination.lights.sortableChildren = false;
        effects.coloration.sortableChildren = false;
        effects.illumination.removeChild(effects.illumination.background);

        illuminationBackground = effects.illumination.addChildAt(
            new SpriteMesh(PIXI.Texture.WHITE, IlluminationBackgroundSamplerShader), 0);
    });

    Hooks.once("drawEffectsCanvasGroup", () => {
        const container = canvas.masks.depth.addChild(new PIXI.Container());
        const render = function (renderer) {
            for (const region of LightingSystem.instance.activeRegions) {
                if (region.object instanceof Tile) {
                    continue;
                }

                region.renderDepth(renderer);
            }
        };

        container.render = render.bind(container);
    });

    Hooks.on("drawEffectsCanvasGroup", () => {
        const bgRect = canvas.dimensions.rect;

        illuminationBackground.x = bgRect.x;
        illuminationBackground.y = bgRect.y;
        illuminationBackground.width = bgRect.width;
        illuminationBackground.height = bgRect.height;

        LightingFramebuffer.instance.draw();
    });

    Hooks.on("tearDownEffectsCanvasGroup", () => {
        LightingFramebuffer.instance.tearDown();
    });

    Hooks.on("canvasTearDown", () => {
        LightingSystem.instance.reset();
        RayCastingSystem.instance.reset();
    });

    Hooks.on("canvasReady", () => {
        Hooks.once("lightingRefresh", () => {
            const meshes = [];

            for (const container of [
                canvas.effects.background.vision,
                canvas.effects.background.lighting,
                canvas.effects.illumination.lights,
                canvas.effects.coloration]) {
                for (const mesh of container.children) {
                    if (mesh.cullable) {
                        mesh.cullable = false;
                        meshes.push(mesh);
                    }
                }
            }

            canvas.app.ticker.addOnce(
                function () {
                    for (const mesh of meshes) {
                        mesh.cullable = true;
                    }
                },
                globalThis,
                PIXI.UPDATE_PRIORITY.LOW - 1
            );
        });
    });

    libWrapper.register(
        "perfect-vision",
        "CanvasOcclusionMask.prototype.updateOcclusion",
        function (wrapped, ...args) {
            if (LightingFramebuffer.instance.invalidateOnOcclusionUpdate) {
                LightingFramebuffer.instance.invalidate();
            }

            return wrapped(...args);
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.groups.primary.groupClass.prototype.mapElevationAlpha",
        function (elevation) {
            return LightingSystem.instance.mapElevationAlpha(elevation);
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CanvasIlluminationEffects.prototype.updateGlobalLight",
        function () {
            return false;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.fogManager.prototype.fogExploration",
        function () {
            return fogExploration;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.groups.effects.groupClass.prototype.initializeLightSources",
        function (wrapped, ...args) {
            wrapped(...args);

            for (const region of LightingSystem.instance) {
                if (region.data.active) {
                    this.lightSources.set(region.id, region.source);
                }
            }
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.groups.effects.groupClass.prototype.refreshLighting",
        function (wrapped, ...args) {
            const perception = LightingSystem.instance.refresh();

            globalLight = false;
            fogExploration = false;

            for (const region of LightingSystem.instance.activeRegions) {
                globalLight ||= region.globalLight;
                fogExploration ||= region.fogExploration;

                if (globalLight && fogExploration) {
                    break;
                }
            }

            this.illumination.globalLight = globalLight;

            if (perception.refreshLighting) {
                perception.refreshLighting = false;

                canvas.lighting._onDarknessChange();
                canvas.sounds._onDarknessChange();

                LightingFramebuffer.instance.refresh();
            }

            if (perception.refreshDepth) {
                canvas.masks.depth.dirty = true;

                for (const region of LightingSystem.instance) {
                    if (region.object instanceof Tile && region.object.mesh) {
                        region.object.mesh.shader.uniforms.depthElevation = region.depth;
                    }
                }

                this.refreshLightSources();
                this.refreshVisionSources();
                canvas.masks.occlusion.updateOcclusion();
            }

            delete perception.refreshDepth;

            canvas.perception.update(perception, true);

            wrapped(...args);

            PointSourceMesh._sortByZIndex(this.background.vision.children);
            PointSourceMesh._sortByZIndex(this.background.lighting.children);
            PointSourceMesh._sortByZIndex(this.illumination.lights.children);
            PointSourceMesh._sortByZIndex(this.coloration.children);
        },
        libWrapper.WRAPPER
    );

    if (game.modules.get("better-roofs")?.active && isNewerVersion(game.modules.get("better-roofs").version, "1.7.3")) {
        betterRoofsHelpers.prototype.computeShowHideTile = function (tile, overrideHide, controlledToken, brMode) {
            const region = LightingSystem.instance.getRegion(`Tile.${tile.document.id}`)
                ?? LightingSystem.instance.getRegion("globalLight");
            const pointSource = region?.globalLight
                ? canvas.effects.visionSources.get(`Token.${controlledToken.id}`)?.los.points
                : canvas.effects.visionSources.get(`Token.${controlledToken.id}`)?.fov.points

            if (controlledToken &&
                !tile.occluded &&
                tile.visible &&
                (controlledToken.losHeight ?? controlledToken.document.elevation) < tile.document.elevation &&
                this.checkIfInPoly(pointSource, tile, controlledToken, 5)
            ) {
                this.showTileThroughFog(tile);
            } else {
                this.hideTileThroughFog(tile);
            }
        }
    }
});

class IlluminationBackgroundSamplerShader extends BaseSamplerShader {
    /** @override */
    static classPluginName = null;

    /** @override */
    static vertexShader = `
      precision ${PIXI.settings.PRECISION_VERTEX} float;

      attribute vec2 aVertexPosition;

      uniform mat3 projectionMatrix;
      uniform vec2 screenDimensions;

      varying vec2 vUvsMask;

      void main() {
        vUvsMask = aVertexPosition / screenDimensions;
        gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      }
    `;

    /** @override */
    static fragmentShader = `
      precision ${PIXI.settings.PRECISION_FRAGMENT} float;

      varying vec2 vUvsMask;

      uniform sampler2D colorBackgroundTexture;

      void main() {
        gl_FragColor = vec4(texture2D(colorBackgroundTexture, vUvsMask).rgb, 1.0);
      }
    `;

    /** @override */
    static defaultUniforms = {
        screenDimensions: [1, 1],
        colorBackgroundTexture: null
    };

    constructor(...args) {
        super(...args);

        this.uniforms.screenDimensions = canvas.screenDimensions;
        this.uniforms.colorBackgroundTexture = LightingFramebuffer.instance.textures[1];
    }
}
