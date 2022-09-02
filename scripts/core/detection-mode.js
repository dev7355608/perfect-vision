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
        const modeRange = mode.range;
        let rayCasterId = `${modeId} ${minRadius} `;

        if (modeRange > 0) {
            rayCasterId += modeRange;
        }

        if (type !== undefined) {
            rayCasterId += "+";
        }

        let rayCaster = RayCastingSystem.instance.cache.get(rayCasterId);

        if (!rayCaster) {
            const senses = { $: minRadius };

            if (modeRange > 0) {
                senses[modeId] = minRadius + modeRange * unitsToPixels;
            }

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

    const castRay = game.modules.get("levels")?.active
        ? (visionSource, mode, target, test, type) => {
            const rayCaster = getRayCaster(visionSource, mode, type);
            const point = test.point;
            const sourceZ = visionSource.object.losHeight * unitsToPixels;
            const targetZ = target ? (target.losHeight
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
            const targetZ = sourceZ;

            return rayCaster
                .moveTo(visionSource.x, visionSource.y, sourceZ)
                .castTo(point.x, point.y, targetZ, true);
        };

    libWrapper.register(
        "perfect-vision",
        "DetectionMode.prototype._testLOS",
        function (visionSource, mode, target, test) {
            if (this.walls) {
                const losCache = test.los;
                let hasLOS = losCache.get(visionSource);

                if (hasLOS === undefined) {
                    const los = visionSource.los;
                    const { x, y } = test.point;

                    hasLOS = (los._visionLimitation?.unconstrained ?? los).contains(x, y);
                    losCache.set(visionSource, hasLOS);
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
