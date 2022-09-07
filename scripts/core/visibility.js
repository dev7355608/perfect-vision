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
            vision.los = vision.addChild(new GraphicsStencilMask());
            vision.fog = vision.addChild(new GraphicsStencilMask());
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
                revealed.mask = revealed.addChild(new StencilMask());
            } else {
                revealed.mask.removeChildren().forEach(c => c.destroy({ children: true }));
            }

            if (!this.tokenVision) {
                this.visible = false;

                return this.restrictVisibility();
            }

            let commitFog = false;
            const priorVision = canvas.masks.vision.detachVision();

            if (priorVision._explored) {
                const container = this.pending.addChild(new PIXI.Container());

                container.addChild(priorVision);
                container.mask = priorVision.fog;

                commitFog = this.pending.children.length >= FogManager.COMMIT_THRESHOLD;
            } else {
                priorVision.destroy({ children: true });
            }

            const vision = canvas.masks.vision.createVision();
            const hasVisionSources = canvas.effects.visionSources.size > 0;

            if (hasVisionSources) {
                for (const lightSource of canvas.effects.lightSources) {
                    if (!lightSource.active || lightSource.disabled
                        || lightSource instanceof GlobalLightSource) {
                        continue;
                    }

                    vision.fov.addChild(lightSource._createMask());

                    if (lightSource.data.vision) {
                        vision.los.addChild(lightSource._createMask());
                    }
                }

                for (const visionSource of canvas.effects.visionSources) {
                    visionSource.active = true;

                    if (visionSource.radius > 0) {
                        vision.fov.addChild(visionSource._createMask(false));
                    } else {
                        vision.base
                            .beginFill(0xFF0000, 1.0)
                            .drawCircle(
                                visionSource.x,
                                visionSource.y,
                                canvas.dimensions.size / 2
                            )
                            .endFill();
                    }

                    vision.los.addChild(visionSource._createMask(true));

                    if (canvas.fog.update(visionSource, forceUpdateFog)) {
                        vision._explored = true;
                    }
                }

                for (const region of LightingSystem.instance.activeRegions) {
                    vision.fov.addChild(region.createMask(!region.globalLight));
                    vision.los.addChild(region.createMask(!region.providesVision));
                    vision.fog.addChild(region.createMask(!region.fogExploration));
                    revealed.mask.addChild(region.createMask(!region.fogRevealed));
                }
            }

            if (commitFog) {
                canvas.fog.commit();
            }

            this.visible = hasVisionSources || !game.user.isGM;
            this.restrictVisibility();

            vision.fov.children.sort(PointSourceMesh._compare);
            vision.los.children.sort(PointSourceMesh._compare);
            vision.fog.children.sort(PointSourceMesh._compare);
            revealed.mask.children.sort(PointSourceMesh._compare);
        },
        libWrapper.OVERRIDE
    );

    const simpleOffsets = [new PIXI.Point()];
    const radialOffsets = [
        [0, 0], [-1, 0], [+1, 0], [0, -1], [0, +1],
        [-Math.SQRT1_2, -Math.SQRT1_2],
        [-Math.SQRT1_2, +Math.SQRT1_2],
        [+Math.SQRT1_2, +Math.SQRT1_2],
        [+Math.SQRT1_2, -Math.SQRT1_2]
    ].map(args => new PIXI.Point(...args));

    libWrapper.register(
        "perfect-vision",
        "CanvasVisibility.prototype.testVisibility",
        function (point, { tolerance = 2, object = null } = {}) {
            const { lightSources, visionSources } = canvas.effects;

            // If no vision sources are present, the visibility is dependant of the type of user
            if (!visionSources.size) return game.user.isGM;

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

                tests.push({ point: new PIXI.Point(x, y), los: new Map() });
            }

            const config = { object, tests };

            // First test basic detection for light sources which specifically provide vision
            for (const lightSource of lightSources) {
                if (!lightSource.data.vision || !lightSource.active || lightSource.disabled) continue;
                const result = lightSource.testVisibility(config);
                if (result === true) return true;
            }

            const modes = CONFIG.Canvas.detectionModes;

            // Second test basic detection tests for vision sources
            for (const visionSource of visionSources) {
                if (!visionSource.active) continue;
                const token = visionSource.object.document;
                const basic = token.detectionModes.find(m => m.id === DetectionMode.BASIC_MODE_ID);
                if (!basic) continue;
                const result = modes.basicSight.testVisibility(visionSource, basic, config);
                if (result === true) return true;
            }

            // Lastly test special detection modes for vision sources
            if (!(object instanceof Token)) return false; // Special detection modes can only detect tokens
            for (const visionSource of canvas.effects.visionSources.values()) {
                if (!visionSource.active) continue;
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
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );
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
