import { extractVisionLimitationData } from "./data-model.js";
import { LightingSystem } from "./lighting-system.js";
import { RayCastingSystem } from "./ray-casting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "AmbientLight.prototype.emitsLight",
        function () {
            const document = this.document;

            if (document.hidden || this.radius === 0) {
                return false;
            }

            const source = this.source;
            const elevation = source.elevation;
            const darkness = LightingSystem.instance.getRegionAt(source, elevation)
                ?.darknessLevel ?? canvas.darknessLevel;
            const { min, max } = document.config.darkness;

            return darkness.between(min ?? 0, max ?? 1);
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "AmbientSound.prototype.isAudible",
        function () {
            const document = this.document;

            if (document.hidden) {
                return false;
            }

            const source = this.source;
            const elevation = source.elevation;
            const darkness = LightingSystem.instance.getRegionAt(source, elevation)
                ?.darknessLevel ?? canvas.darknessLevel;
            const { min, max } = document.darkness;

            return darkness.between(min ?? 0, max ?? 1);
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    const wallHeight = !!game.modules.get("wall-height")?.active;

    function updateLightSource(wrapped, options) {
        let defer = options?.defer ?? false;

        wrapped(options);

        const document = this.document;
        const sourceId = this.sourceId;
        const source = this instanceof AmbientLight ? this.source : this.light;
        const flags = this instanceof AmbientLight
            ? document.flags["perfect-vision"]
            : document.flags["perfect-vision"]?.light;
        const deleted = !canvas.effects.lightSources.has(sourceId);

        source.data.resolution = flags?.resolution || 1;

        if (!deleted && flags?.visionLimitation?.enabled) {
            let shapes;
            const los = source.los;

            if (los.config.type === "universal"
                && los.config.boundaryShapes.length === 1
                && (los.config.boundaryShapes[0] instanceof PIXI.Circle
                    || los.config.boundaryShapes[0] instanceof PIXI.Ellipse)) {
                const origin = los.origin;
                const circle = los.config.boundaryShapes[0];
                const radiusX = circle.radius ?? circle.width;
                const radiusY = circle.radius ?? circle.height;

                shapes = [{
                    x: origin.x - radiusX,
                    y: origin.y - radiusY,
                    width: radiusX * 2,
                    height: radiusY * 2,
                    type: "e"
                }];
            } else {
                shapes = [{ points: los.points, type: "p" }];
            }

            const visionLimitation = extractVisionLimitationData(document);
            const data = {
                object: this,
                active: source.active,
                mode: source.isDarkness ? "min" : "max",
                limits: {
                    ...visionLimitation.detection,
                    [DetectionMode.BASIC_MODE_ID]: visionLimitation.sight
                },
                shapes,
                priority: [2, source.data.z ?? (source.isDarkness ? 10 : 0)]
            };

            if (wallHeight) {
                if (this instanceof AmbientLight) {
                    data.elevation = document.flags.levels?.rangeBottom ?? PrimaryCanvasGroup.BACKGROUND_ELEVATION;
                    data.height = (document.flags.levels?.rangeTop ?? Infinity) - data.elevation;
                } else {
                    data.elevation = document.elevation;
                    data.height = document.object.losHeight - data.elevation;
                }
            } else {
                if (this instanceof AmbientLight) {
                    data.elevation = PrimaryCanvasGroup.BACKGROUND_ELEVATION;
                    data.height = canvas.scene.foregroundElevation - data.elevation
                        - canvas.dimensions.distance / canvas.dimensions.size;
                } else {
                    data.elevation = document.elevation;
                    data.height = Math.max(document.width, document.height) * canvas.dimensions.distance;
                }
            }

            if (!RayCastingSystem.instance.hasRegion(sourceId)) {
                RayCastingSystem.instance.createRegion(sourceId, data);
            } else if (!RayCastingSystem.instance.updateRegion(sourceId, data)) {
                defer = true;
            }
        } else if (!RayCastingSystem.instance.destroyRegion(sourceId)) {
            defer = true;
        }

        if (!defer) {
            canvas.perception.update({ initializeVision: true }, true);
        }
    }

    libWrapper.register(
        "perfect-vision",
        "AmbientLight.prototype.updateSource",
        updateLightSource,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "Token.prototype.updateLightSource",
        updateLightSource,
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    Hooks.on("lightingRefresh", () => {
        for (const light of canvas.lighting.placeables) {
            const sourceId = light.sourceId;

            if (RayCastingSystem.instance.hasRegion(sourceId)) {
                RayCastingSystem.instance.updateRegion(sourceId, { active: light.source.active });
            }
        }

        for (const token of canvas.tokens.placeables) {
            const sourceId = token.sourceId;

            if (RayCastingSystem.instance.hasRegion(sourceId)) {
                RayCastingSystem.instance.updateRegion(sourceId, { active: token.light.active });
            }
        }

        if (RayCastingSystem.instance.refresh()) {
            canvas.effects.visibility.initializeSources();
            canvas.effects.visibility.refresh();
        }
    });
});
