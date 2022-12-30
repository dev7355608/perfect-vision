import { RayCastingSystem } from "./ray-casting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    let unitsToPixels;

    Hooks.on("canvasInit", () => {
        unitsToPixels = canvas.dimensions.size / canvas.dimensions.distance;
    });

    function getRayCaster(visionSource, mode) {
        const minRadius = visionSource.object.w / 2;
        const modeId = mode.id;
        const modeRadius = mode.range > 0 ? minRadius + mode.range * unitsToPixels : 0;
        const rayCasterId = `${modeId} ${modeRadius}-${minRadius}`;
        let rayCaster = RayCastingSystem.instance.cache.get(rayCasterId);

        if (!rayCaster) {
            const senses = { $: minRadius, [modeId]: modeRadius };

            RayCastingSystem.instance.cache.set(
                rayCasterId,
                rayCaster = RayCastingSystem.instance.createRayCaster(senses)
            );
        }

        return rayCaster;
    }

    function testRay(visionSource, mode, target, test) {
        const point = test.point;
        const sourceZ = visionSource.elevation * unitsToPixels;

        return getRayCaster(visionSource, mode)
            .setOrigin(visionSource.x, visionSource.y, sourceZ)
            .setTarget(point.x, point.y, point.z ?? sourceZ)
            .castRay(true);
    }

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

        const boundaryShape = boundaryShapes[0];

        if (!(boundaryShape instanceof LimitedAnglePolygon)) {
            return true;
        }

        return boundaryShape.radius < canvas.dimensions.maxR;
    }

    libWrapper.register(
        "perfect-vision",
        "DetectionMode.prototype._testLOS",
        function (visionSource, mode, target, test) {
            if (!this.walls) {
                return true;
            }

            const losCache = test.los;
            let hasLOS = losCache.get(visionSource);

            if (hasLOS === undefined) {
                const point = test.point;
                const los = visionSource.los;

                if (mode.id === DetectionMode.BASIC_MODE_ID) {
                    hasLOS = los.contains(point.x, point.y);

                    if (hasLOS === true || !isConstrained(los)) {
                        losCache.set(visionSource, hasLOS);
                    }
                } else {
                    if (!isConstrained(los)) {
                        hasLOS = los.contains(point.x, point.y);
                    } else {
                        hasLOS = testAngle(visionSource, point)
                            && !CONFIG.Canvas.losBackend.testCollision(
                                { x: visionSource.x, y: visionSource.y },
                                point,
                                { type: los.config.type, mode: "any", source: visionSource }
                            );
                    }

                    losCache.set(visionSource, hasLOS);
                }
            }

            return hasLOS;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "DetectionMode.prototype._testRange",
        function (visionSource, mode, target, test) {
            if (mode.range <= 0) {
                return false;
            }

            if (mode.id === DetectionMode.BASIC_MODE_ID) {
                const sourceZ = visionSource.elevation * unitsToPixels;
                const { x, y, z } = test.point;
                const radius = visionSource.object.getLightRadius(mode.range);
                const dx = x - visionSource.x;
                const dy = y - visionSource.y;
                const dz = (z ?? sourceZ) - sourceZ;

                return dx * dx + dy * dy + dz * dz <= radius * radius;
            } else {
                return testRay(visionSource, mode, target, test);
            }
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "DetectionModeBasicSight.prototype.testVisibility",
        function (wrapped, visionSource, mode, config = {}) {
            const result = wrapped(visionSource, mode, config);

            if (result === true) {
                const object = config.object;

                if (object instanceof Token) {
                    object._basicVisible = true;
                }
            }

            return result;
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "DetectionModeBasicSight.prototype._testPoint",
        function (visionSource, mode, target, test) {
            if (!this._testLOS(visionSource, mode, target, test)) {
                return false;
            }

            const minRadius = visionSource.object.w / 2;
            const modeId = DetectionMode.BASIC_MODE_ID;
            const modeRadius = visionSource._losRadius;
            const rayCasterId = `${modeId} ${modeRadius}-${minRadius}`;
            let rayCaster = RayCastingSystem.instance.cache.get(rayCasterId);

            if (!rayCaster) {
                const senses = { $: minRadius, [modeId]: modeRadius };

                RayCastingSystem.instance.cache.set(
                    rayCasterId,
                    rayCaster = RayCastingSystem.instance.createRayCaster(senses)
                );
            }

            const sourceZ = visionSource.elevation * unitsToPixels;
            let { x, y, z } = test.point;

            z ??= sourceZ;

            if (!rayCaster
                .setOrigin(visionSource.x, visionSource.y, sourceZ)
                .setTarget(x, y, z)
                .castRay(true)) {
                return false;
            }

            if (this._testRange(visionSource, mode, target, test)) {
                return true;
            }

            for (const lightSource of canvas.effects.lightSources) {
                if (!lightSource.active || lightSource.disabled) {
                    continue;
                }

                if (lightSource.los.contains(x, y, z)) {
                    return true;
                }
            }

            return false;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "LightSource.prototype.testVisibility",
        function ({ tests, object } = {}) {
            if (!(this.data.vision && this._canDetectObject(object))) {
                return false;
            }

            return tests.some(test => {
                const { x, y, z } = test.point;

                return this.los.contains(x, y, z);
            });
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );
});
