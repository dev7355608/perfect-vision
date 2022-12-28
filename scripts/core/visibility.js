import { LightingSystem } from "./lighting-system.js";
import { StencilMask } from "../utils/stencil-mask.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "CanvasVisionMask.prototype.createVision",
        function () {
            const vision = new PIXI.Container();
            const fill = vision.addChild(
                new PIXI.LegacyGraphics()
                    .beginFill(0xFF0000)
                    .drawShape(canvas.dimensions.rect.clone())
                    .endFill());

            vision.fov = vision.addChild(new GraphicsStencilMask());
            vision.fov.cullable = true;
            vision.los = vision.addChild(new GraphicsStencilMask());
            vision.los.cullable = true;
            vision.fog = vision.addChild(new GraphicsStencilMask());
            vision.fog.cullable = true;
            vision.base = vision.fov.addChild(new PIXI.LegacyGraphics());
            vision.base.elevation = Infinity;
            vision.base.sort = Infinity;
            vision.mask = vision.los;
            vision._explored = false;
            fill.mask = vision.fov;

            return this.vision = this.addChild(vision);
        },
        libWrapper.OVERRIDE
    );

    libWrapper.register(
        "perfect-vision",
        "CanvasVisibility.prototype.restrictVisibility",
        function (wrapped, ...args) {
            for (const token of canvas.tokens.placeables) {
                token._basicVisible = false;
            }

            return wrapped(...args);
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    let revealed;

    libWrapper.register(
        "perfect-vision",
        "CanvasVisibility.prototype.refresh",
        function ({ forceUpdateFog = false } = {}) {
            if (!this.initialized) {
                return;
            }

            if (!revealed || revealed.destroyed) {
                revealed = this.explored.addChild(
                    new PIXI.LegacyGraphics()
                        .beginFill(0xFFFFFF)
                        .drawShape(canvas.dimensions.rect.clone())
                        .endFill());
                revealed.msk = revealed.addChild(new StencilMask());
                revealed.mask = null;
                revealed.visible = false;
            } else {
                revealed.msk.removeChildren().forEach(c => c.destroy({ children: true }));
                revealed.mask = null;
                revealed.visible = false;
            }

            if (!this.tokenVision) {
                this.visible = false;

                return this.restrictVisibility();
            }

            let commitFog = false;
            const priorVision = canvas.masks.vision.detachVision();

            if (priorVision._explored) {
                if (priorVision.fog) {
                    const container = this.pending.addChild(new PIXI.Container());

                    container.fov = priorVision.fov;
                    container.los = priorVision.los;
                    container.fog = priorVision.fog;
                    container.addChild(priorVision);
                    container.mask = priorVision.fog;
                } else {
                    this.pending.addChild(priorVision);
                }

                commitFog = this.pending.children.length >= FogManager.COMMIT_THRESHOLD;
            } else {
                priorVision.destroy({ children: true });
            }

            const vision = canvas.masks.vision.createVision();
            const hasVisionSources = canvas.effects.visionSources.size > 0;
            let globalLight;
            let providesVision;
            let fogExploration;
            let fogRevealed;

            if (hasVisionSources) {
                const region = LightingSystem.instance.getRegion("globalLight");

                globalLight = region.globalLight;
                providesVision = region.providesVision;
                fogExploration = region.fogExploration;
                fogRevealed = region.fogRevealed;

                for (const region of LightingSystem.instance.activeRegions) {
                    if (globalLight !== region.globalLight) {
                        globalLight = undefined;
                    }

                    if (providesVision !== region.providesVision) {
                        providesVision = undefined;
                    }

                    if (fogExploration !== region.fogExploration) {
                        fogExploration = undefined;
                    }

                    if (fogRevealed !== region.fogRevealed) {
                        fogRevealed = undefined;
                    }
                }

                if (globalLight === true) {
                    vision.fov.visible = false;
                    vision.children[0].mask = null;
                }

                if (providesVision === true) {
                    vision.los.visible = false;
                    vision.mask = null;
                }

                if (fogExploration !== undefined) {
                    vision.fog.visible = false;
                    vision.fog = null;

                    if (fogExploration === false) {
                        vision._explored = false;
                    }
                }

                revealed.visible = fogRevealed !== false;

                if (fogRevealed === undefined) {
                    revealed.mask = revealed.msk;
                }

                for (const lightSource of canvas.effects.lightSources) {
                    if (!lightSource.active || lightSource.disabled
                        || lightSource instanceof GlobalLightSource) {
                        continue;
                    }

                    if (globalLight !== true) {
                        const mask = vision.fov.addChild(lightSource._createMask());

                        mask.cullable = false;
                    }

                    if (providesVision !== true && lightSource.data.vision) {
                        const mask = vision.los.addChild(lightSource._createMask());

                        mask.cullable = false;
                    }
                }

                for (const visionSource of canvas.effects.visionSources) {
                    visionSource.active = true;

                    if (globalLight !== true) {
                        if (visionSource.radius > 0) {
                            const mask = vision.fov.addChild(visionSource._createMask(false));

                            mask.cullable = false;
                        } else {
                            vision.base
                                .beginFill(0xFF0000, 1.0)
                                .drawCircle(
                                    visionSource.x,
                                    visionSource.y,
                                    visionSource.object.w / 2
                                )
                                .endFill();
                        }
                    }

                    if (providesVision !== true) {
                        let mask;

                        if (!visionSource.data.blinded) {
                            mask = visionSource._createMask(true);
                        } else if (visionSource.radius > 0) {
                            mask = visionSource._createMask(false);
                        }

                        if (mask) {
                            vision.los.addChild(mask);

                            mask.cullable = false;
                            mask.elevation = Infinity;
                            mask.sort = Infinity;
                        }
                    }

                    if (canvas.fog.update(visionSource, forceUpdateFog)) {
                        vision._explored = true;
                    }
                }

                if (Number.isFinite(region?.elevation)) {
                    const addMask = (container, region, hole) => {
                        if (hole) {
                            return null;
                        }

                        const mask = container.addChild(region.createMask(hole));

                        mask.elevation = -Infinity;
                        mask.sort = -Infinity;
                        mask.cullable = false;

                        return mask;
                    };

                    if (globalLight !== true) {
                        addMask(vision.fov, region, !region.globalLight);
                    }

                    if (providesVision !== true) {
                        addMask(vision.los, region, !region.providesVision);
                    }

                    if (fogExploration === undefined) {
                        addMask(vision.fog, region, !region.fogExploration);
                    }

                    if (fogRevealed === undefined) {
                        addMask(revealed.msk, region, !region.fogRevealed);
                    }
                }

                for (const region of LightingSystem.instance.activeRegions) {
                    let addMask;

                    if (region.occluded && region.occlusionMode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
                        addMask = (container, region, hole) => {
                            const mask = region.createMask(hole);
                            const masks = [region.createMask(false)];

                            mask.cullable = false;
                            masks[0].renderable = false;

                            const radialOcclusion = new PIXI.LegacyGraphics();

                            radialOcclusion.renderable = false;
                            radialOcclusion._stencilHole = true;
                            radialOcclusion.beginFill(0xFFFFFF, 1);

                            for (const token of canvas.tokens._getOccludableTokens()) {
                                if (token.document.elevation >= region.elevation) {
                                    continue;
                                }

                                const c = token.center;
                                const o = Number(token.document.flags.core?.occlusionRadius) || null;
                                const m = Math.max(token.mesh.width, token.mesh.height);
                                const r = Number.isFinite(o) ? Math.max(m, token.getLightRadius(o)) : m;

                                radialOcclusion.drawCircle(c.x, c.y, r);

                                if (masks.length < 2) {
                                    masks.push(radialOcclusion);
                                }
                            }

                            radialOcclusion.endFill();

                            if (masks.length > 1) {
                                mask._stencilMasks = masks;
                            } else {
                                mask._stencilMasks = null;
                            }

                            return container.addChild(mask, ...masks);
                        };
                    } else if (region.occlusionMode === CONST.TILE_OCCLUSION_MODES.VISION) {
                        addMask = (container, region, hole) => {
                            const mask = region.createMask(hole);
                            const masks = [region.createMask(false)];

                            mask.cullable = false;
                            masks[0].renderable = false;

                            for (const visionSource of canvas.effects.visionSources) {
                                if (visionSource.elevation >= region.elevation) {
                                    continue;
                                }

                                const losMask = visionSource._createMask(true);

                                losMask.cullable = false;
                                losMask.renderable = false;
                                losMask._stencilHole = true;
                                losMask._stencilMasks = null;
                                masks.push(losMask);
                            }

                            if (masks.length > 1) {
                                mask._stencilMasks = masks;
                            } else {
                                mask._stencilMasks = null;
                            }

                            return container.addChild(mask, ...masks);
                        };
                    } else if (!region.occluded) {
                        addMask = (container, region, hole) => {
                            const mask = container.addChild(region.createMask(hole));

                            mask.cullable = false;

                            return mask;
                        };
                    }

                    if (addMask) {
                        if (globalLight !== true) {
                            addMask(vision.fov, region, !region.globalLight);
                        }

                        if (providesVision !== true) {
                            addMask(vision.los, region, !region.providesVision);
                        }

                        if (fogExploration === undefined) {
                            addMask(vision.fog, region, !region.fogExploration);
                        }

                        if (fogRevealed === undefined) {
                            addMask(revealed.msk, region, !region.fogRevealed);
                        }
                    }
                }

                if (vision._explored) {
                    for (const source of canvas.effects.lightSources) {
                        if (!source.active || source.disabled
                            || source instanceof GlobalLightSource) {
                            continue;
                        }

                        source._sourceGeometry._explored = true;
                    }

                    for (const source of canvas.effects.visionSources) {
                        source._sourceGeometry._explored = true;
                        source._sourceLosGeometry._explored = true;
                    }

                    for (const region of LightingSystem.instance.activeRegions) {
                        region.geometry._explored = true;
                    }
                }
            }

            PointSourceMesh._sortByElevation(vision.fov.children);
            PointSourceMesh._sortByElevation(vision.los.children);
            PointSourceMesh._sortByElevation(vision.fog?.children ?? []);
            PointSourceMesh._sortByElevation(revealed.msk.children);

            if (commitFog) {
                canvas.fog.commit();
            } else {
                canvas.fog._debouncedCommit();
            }

            this.visible = hasVisionSources || !game.user.isGM;
            this.restrictVisibility();

            if (hasVisionSources && fogRevealed !== true) {
                let revealedTokens;

                for (const token of canvas.tokens.placeables) {
                    if (token.visible && token._basicVisible) {
                        if (!revealedTokens) {
                            revealedTokens = revealed.msk.addChild(new PIXI.LegacyGraphics());
                            revealedTokens.beginFill();
                        }

                        revealedTokens.drawCircle(
                            token.center.x,
                            token.center.y,
                            token.w / 2
                        );
                    }
                }

                if (revealedTokens) {
                    revealedTokens.endFill();
                    revealed.visible = true;
                    revealed.mask = revealed.msk;
                }
            }
        },
        libWrapper.OVERRIDE
    );

    libWrapper.register(
        "perfect-vision",
        "CONFIG.Canvas.fogManager.prototype.commit",
        async function (wrapped, ...args) {
            for (const vision of this.pending.children) {
                vision.fov.cullable = false;
                vision.los.cullable = false;

                if (vision.fog) {
                    vision.fog.cullable = false;
                }
            }

            return await wrapped(...args);
        },
        libWrapper.WRAPPER
    );

    if (!game.modules.get("levels")?.active && !game.modules.get("tokenvisibility")?.active) {
        const simpleOffsets = [new PIXI.Point()];
        const radialOffsets = [
            [0, 0], [-1, 0], [+1, 0], [0, -1], [0, +1],
            [-Math.SQRT1_2, -Math.SQRT1_2],
            [-Math.SQRT1_2, +Math.SQRT1_2],
            [+Math.SQRT1_2, +Math.SQRT1_2],
            [+Math.SQRT1_2, -Math.SQRT1_2]
        ].map(args => new PIXI.Point(...args));
        const setElevationZ = (config, source) => {
            const object = config.object;
            const z = (object instanceof Token
                ? object.document.elevation
                : source.elevation) * (canvas.dimensions.size
                    / canvas.dimensions.distance);

            for (const test of config.tests) {
                test.point.z = z;
            }
        };

        libWrapper.register(
            "perfect-vision",
            "CanvasVisibility.prototype.testVisibility",
            function (point, { tolerance = 2, object = null } = {}) {
                const { lightSources, visionSources } = canvas.effects;

                // If no vision sources are present, the visibility is dependant of the type of user
                if (!visionSources.size) return game.user.isGM;

                // Get scene rect to test that some points are not detected into the padding
                const sr = canvas.dimensions.sceneRect;
                const inBuffer = !sr.contains(point.x, point.y);

                // Prepare an array of test points depending on the requested tolerance
                let polygon;
                const offsets = tolerance > 0 ? radialOffsets : simpleOffsets;

                if (object instanceof Token && tolerance > 0) {
                    const radius = object.w / 2;

                    tolerance = radius * Math.SQRT1_2;
                    polygon = TestVisibilityPolygon.get(object);
                    polygon.initialize({ x: point.x, y: point.y }, radius);
                }

                const tests = [];

                for (let i = 0, n = offsets.length; i < n; i++) {
                    const offset = offsets[i];
                    const x = point.x + tolerance * offset.x;
                    const y = point.y + tolerance * offset.y;

                    if (polygon && i !== 0) {
                        polygon.compute();

                        if (!polygon.contains(x, y)) {
                            continue;
                        }
                    }

                    tests.push({ point: { x, y, z: 0 }, los: new Map() });
                }

                const config = { object, tests };

                // First test basic detection for light sources which specifically provide vision
                for (const lightSource of lightSources) {
                    if (!lightSource.data.vision || !lightSource.active || lightSource.disabled) continue;
                    setElevationZ(config, lightSource);
                    const result = lightSource.testVisibility(config);
                    if (result === true) return true;
                }

                const modes = CONFIG.Canvas.detectionModes;

                // Second test basic detection tests for vision sources
                for (const visionSource of visionSources) {
                    if (!visionSource.active) continue;
                    // Skip sources that are not both inside the scene or both inside the buffer
                    if (inBuffer === sr.contains(visionSource.x, visionSource.y)) continue;
                    const token = visionSource.object.document;
                    const basic = token.detectionModes.find(m => m.id === DetectionMode.BASIC_MODE_ID);
                    if (!basic) continue;
                    setElevationZ(config, visionSource);
                    const result = modes.basicSight.testVisibility(visionSource, basic, config);
                    if (result === true) return true;
                }

                // Lastly test special detection modes for vision sources
                if (!(object instanceof Token)) return false; // Special detection modes can only detect tokens
                for (const visionSource of visionSources) {
                    if (!visionSource.active) continue;
                    // Skip sources that are not both inside the scene or both inside the buffer
                    if (inBuffer === sr.contains(visionSource.x, visionSource.y)) continue;
                    setElevationZ(config, visionSource);
                    const token = visionSource.object.document;
                    for (const mode of token.detectionModes) {
                        if (mode.id === DetectionMode.BASIC_MODE_ID) continue;
                        const dm = modes[mode.id];
                        const result = dm?.testVisibility(visionSource, mode, config);
                        if (result === true) {
                            object.detectionFilter = dm.constructor.getDetectionFilter();
                            return true;
                        }
                    }
                }

                return false;
            },
            libWrapper.OVERRIDE,
            { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
        );
    }
});

class GraphicsStencilMask extends StencilMask {
    constructor() {
        super();

        this._graphics = this.addChild(new PIXI.LegacyGraphics());
        this._graphics.elevation = Infinity;
        this._graphics.sort = Infinity;
    }

    get currentPath() {
        return this._graphics.currentPath;
    }

    get fill() {
        return this._graphics.fill;
    }

    get geometry() {
        return this._graphics.geometry;
    }

    get line() {
        return this._graphics.line;
    }
}

for (const method of [
    "arc",
    "arcTo",
    "beginFill",
    "beginHole",
    "beginTextureFill",
    "bezierCurveTo",
    "clear",
    "closePath",
    "drawChamferRect",
    "drawCircle",
    "drawEllipse",
    "drawFilletRect",
    "drawPolygon",
    "drawRect",
    "drawRegularPolygon",
    "drawRoundedPolygon",
    "drawRoundedRect",
    "drawShape",
    "drawStar",
    "drawTorus",
    "endFill",
    "endHole",
    "lineStyle",
    "lineTextureStyle",
    "lineTo",
    "moveTo",
    "quadraticCurveTo",
    "setMatrix",
    "finishPoly",
    "startPoly"
]) {
    GraphicsStencilMask.prototype[method] = function () {
        return this._graphics[method].apply(this._graphics, arguments);
    };
}

class TestVisibilityPolygon extends ClockwiseSweepPolygon {
    static #cache = new WeakMap();

    static get(token) {
        let polygon = this.#cache.get(token);

        if (!polygon) {
            this.#cache.set(token, polygon = new this(token));
        }

        return polygon;
    }

    static _wallsID = 0;

    #token;
    #x = 0;
    #y = 0;
    #radius = 0;
    #bounds = new PIXI.Rectangle();
    #elevation = 0;
    #wallsID = -1;
    #dirty = true;
    #unrestricted;

    constructor(token) {
        super();

        this.#token = token;
    }

    /** @override */
    initialize(origin, radius) {
        const token = this.#token;
        const { x, y } = origin;
        const elevation = token.document.elevation;

        if (!(this.#x === x
            && this.#y === y
            && this.#radius === radius
            && this.#elevation === elevation
            && this.#wallsID === TestVisibilityPolygon._wallsID)) {
            this.#x = x;
            this.#y = y;
            this.#radius = radius;
            this.#bounds.x = x - radius;
            this.#bounds.y = y - radius;
            this.#bounds.width = this.#bounds.height = radius * 2;
            this.#elevation = elevation;
            this.#wallsID = TestVisibilityPolygon._wallsID;
            this.#dirty = true;

            super.initialize(origin, { type: "move", source: new MovementSource(token) });
        }
    }

    /** @override */
    getBounds() {
        return this.#bounds;
    }

    /** @override */
    compute() {
        if (this.#dirty) {
            this.#dirty = false;
            super.compute();
        }
    }

    /** @override */
    _compute() {
        this.points.length = 0;

        if (this._identifyEdges()) {
            this._identifyVertices();
            this._executeSweep();
            this.#unrestricted = false;
        } else {
            this.#unrestricted = true;
        }

        this.vertices.clear();
        this.edges.clear();
        this.rays.length = 0;
    }

    /** @override */
    _identifyEdges() {
        const walls = this._getWalls();
        const type = this.config.type;

        for (const wall of walls) {
            this.edges.add(PolygonEdge.fromWall(wall, type));
        }

        if (this.edges.size === 0) {
            return false;
        }

        for (let boundary of canvas.walls.outerBounds) {
            const edge = PolygonEdge.fromWall(boundary, type);

            edge._isBoundary = true;
            this.edges.add(edge);
        }

        return true;
    }

    /** @override */
    _defineBoundingBox() {
        return this.#bounds.clone().ceil().pad(1);
    }

    /** @override */
    contains(x, y) {
        return this.#unrestricted || this.bounds.contains(x, y)
            && PIXI.Polygon.prototype.contains.call(this, x, y);
    }
}

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("canvasInit", () => {
        TestVisibilityPolygon._wallsID++;
    });

    Hooks.on("createWall", document => {
        if (document.rendered) {
            TestVisibilityPolygon._wallsID++;
        }
    });

    Hooks.on("updateWall", document => {
        if (document.rendered) {
            TestVisibilityPolygon._wallsID++;
        }
    });

    Hooks.on("deleteWall", document => {
        if (document.rendered) {
            TestVisibilityPolygon._wallsID++;
        }
    });
});
