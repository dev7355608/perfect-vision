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
            const targetZ = point.z ?? (target instanceof PlaceableObject ? (target.losHeight
                ?? target.document.elevation
                ?? target.document.flags.levels?.rangeBottom
                ?? 0) * unitsToPixels : sourceZ);

            return rayCaster
                .moveTo(visionSource.x, visionSource.y, sourceZ)
                .castTo(point.x, point.y, targetZ, true);
        }
        : (visionSource, mode, target, test, type) => {
            const rayCaster = getRayCaster(visionSource, mode, type);
            const point = test.point;
            const sourceZ = visionSource.elevation * unitsToPixels;
            const targetZ = point.z ?? (target instanceof Token
                ? target.document.elevation * unitsToPixels
                : sourceZ);

            return rayCaster
                .moveTo(visionSource.x, visionSource.y, sourceZ)
                .castTo(point.x, point.y, targetZ, true);
        };

    function testAngle(visionSource, point) {
        const { angle, rotation, externalRadius } = visionSource.data;

        if (angle !== 360) {
            const dx = point.x - visionSource.x;
            const dy = point.y - visionSource.y;

            if (dx * dx + dy * dy > externalRadius * externalRadius) {
                const aMin = rotation + 90 - angle / 2;
                const a = Math.toDegrees(Math.atan2(dy, dx));

                if (((a - aMin) % 360 + 360) % 360 > angle) {
                    return false;
                }
            }
        }

        return true;
    }

    function isConstrained(los) {
        const boundaryShapes = los.config.boundaryShapes;

        if (boundaryShapes.length === 0) {
            return false;
        }

        if (boundaryShapes.length >= 2) {
            return true;
        }

        return !(boundaryShapes[0] instanceof LimitedAnglePolygon);
    }

    libWrapper.register(
        "perfect-vision",
        "DetectionMode.prototype._testLOS",
        function (visionSource, mode, target, test) {
            if (this.walls) {
                const losCache = test.los;
                let hasLOS = losCache.get(visionSource);

                if (hasLOS === undefined) {
                    const point = test.point;
                    const los = visionSource.los;
                    const constrained = isConstrained(los);

                    if (!constrained || mode.id === DetectionMode.BASIC_MODE_ID) {
                        hasLOS = los.contains(point.x, point.y);

                        if (!constrained) {
                            losCache.set(visionSource, hasLOS);
                        }
                    } else {
                        hasLOS = testAngle(visionSource, point)
                            && !CONFIG.Canvas.losBackend.testCollision(
                                { x: visionSource.x, y: visionSource.y },
                                point,
                                { type: los.config.type, mode: "any", source: visionSource }
                            );
                        losCache.set(visionSource, hasLOS);
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
