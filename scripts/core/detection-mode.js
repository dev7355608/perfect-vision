import { RayCastingSystem } from "./ray-casting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    let unitsToPixels;

    Hooks.on("canvasInit", () => {
        unitsToPixels = canvas.dimensions.size / canvas.dimensions.distance;
    });

    function getRayCaster(visionSource, mode, type) {
        const minRadius = visionSource.object.w / 2;
        const modeId = mode.id;
        const modeRange = mode.range > 0 ? minRadius + mode.range * unitsToPixels : 0;
        let rayCasterId = `${modeId} ${minRadius} ${modeRange}`;

        if (type !== undefined) {
            rayCasterId += "+";
        }

        let rayCaster = RayCastingSystem.instance.cache.get(rayCasterId);

        if (!rayCaster) {
            const senses = {
                $: minRadius,
                [modeId]: modeRange
            };

            if (type !== undefined) {
                senses[type] = Infinity;
            }

            RayCastingSystem.instance.cache.set(
                rayCasterId,
                rayCaster = RayCastingSystem.instance.createRayCaster(senses)
            );
        }

        return rayCaster;
    }

    const castRay = game.modules.get("wall-height")?.active
        ? (visionSource, mode, target, test, type) => {
            const rayCaster = getRayCaster(visionSource, mode, type);
            const point = test.point;
            const sourceZ = visionSource.object.losHeight * unitsToPixels;
            const targetZ = target instanceof PlaceableObject ? (target.losHeight
                ?? target.document.elevation
                ?? target.document.flags.levels?.rangeBottom
                ?? 0) * unitsToPixels : sourceZ;

            return rayCaster
                .moveTo(visionSource.x, visionSource.y, sourceZ)
                .castTo(point.x, point.y, targetZ, true);
        }
        : (visionSource, mode, target, test, type) => {
            const rayCaster = getRayCaster(visionSource, mode, type);
            const point = test.point;
            const sourceZ = visionSource.elevation * unitsToPixels;
            const targetZ = target instanceof Token
                ? target.document.elevation * unitsToPixels
                : sourceZ;

            return rayCaster
                .moveTo(visionSource.x, visionSource.y, sourceZ)
                .castTo(point.x, point.y, targetZ, true);
        };

    libWrapper.register(
        "perfect-vision",
        "DetectionMode.prototype._testLOS",
        function (visionSource, mode, target, test) {
            if (this.walls) {
                let hasLOS;

                if (mode.id === DetectionMode.BASIC_MODE_ID) {
                    hasLOS = visionSource.los.contains(test.point.x, test.point.y);
                } else {
                    const cacheKey = `${visionSource.object.sourceId}#${this.type}`;

                    hasLOS = test.los.get(cacheKey);

                    if (hasLOS === undefined) {
                        let type;

                        switch (this.type) {
                            case DetectionMode.DETECTION_TYPES.SIGHT: type = "sight"; break;
                            case DetectionMode.DETECTION_TYPES.SOUND: type = "sound"; break;
                            case DetectionMode.DETECTION_TYPES.MOVE: type = "move"; break;
                            default: type = "other"; break;
                        }

                        hasLOS = !CONFIG.Canvas.losBackend.testCollision(
                            { x: visionSource.x, y: visionSource.y },
                            test.point,
                            { type, mode: "any", source: visionSource }
                        );
                        test.los.set(cacheKey, hasLOS);
                    }
                }

                if (!hasLOS) {
                    return false;
                }
            }

            return castRay(visionSource, mode, target, test, this.type);
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "DetectionMode.prototype._testRange",
        function (visionSource, mode, target, test) {
            return castRay(visionSource, mode, target, test);
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );
});
