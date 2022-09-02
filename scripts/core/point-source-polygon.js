import { RayCastingSystem } from "./ray-casting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    libWrapper.register(
        "perfect-vision",
        "CanvasVisibility.prototype.initializeSources",
        function (wrapped, ...args) {
            RayCastingSystem.instance.refresh();

            return wrapped(...args);
        },
        libWrapper.WRAPPER
    );

    libWrapper.register(
        "perfect-vision",
        "ClockwiseSweepPolygon.prototype.initialize",
        function (wrapped, origin, config) {
            wrapped(origin, config);

            if (this.config.type === "sight") {
                this._visionLimitation = new VisionLimitation(this);
            } else {
                delete this._visionLimitation;
            }
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "ClockwiseSweepPolygon.prototype._defineBoundingBox",
        function (wrapped) {
            const boundingBox = wrapped();

            this._visionLimitation?._defineBoundingBox(this, boundingBox);

            return boundingBox;
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "ClockwiseSweepPolygon.prototype._compute",
        function (wrapped) {
            this._visionLimitation?._preCompute(this);

            wrapped();

            this._visionLimitation?._postCompute(this);
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "ClockwiseSweepPolygon.prototype.visualize",
        function (wrapped) {
            wrapped();

            this._visionLimitation?._visualize(this);
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    // TODO: ClockwiseSweepPolygon.prototype._testCollision
});

class VisionLimitation extends PIXI.Polygon {
    #senses = {
        $: 0,
        [DetectionMode.DETECTION_TYPES.SIGHT]: Infinity,
        [DetectionMode.BASIC_MODE_ID]: 0
    };
    #rayCaster0;
    #rayCaster1;
    #rayCaster2;
    #rayCaster3;
    #rayCaster4;
    #minX = 0;
    #minY = 0;
    #minZ = 0;
    #maxX = 0;
    #maxY = 0;
    #maxZ = 0;
    #maxR = 0;
    #constrain = false;

    /**
     * @type {ClockwiseSweepPolygon}
     * @readonly
     */
    unconstrained;

    /**
     * @param {ClockwiseSweepPolygon} polygon
     */
    constructor(polygon) {
        super();

        this.origin = {
            x: polygon.origin.x,
            y: polygon.origin.y,
            z: 0
        };

        const source = polygon.config.source;

        if (source?.object) {
            const unitsToPixels = canvas.dimensions.size / canvas.dimensions.distance;

            this.origin.z = source.elevation * unitsToPixels;

            if (source.object instanceof Token) {
                const minRange = this.#senses.$ = source.object.w / 2;

                for (let { id, range, enabled } of source.object.document.detectionModes) {
                    if (enabled && range > 0 && id === DetectionMode.BASIC_MODE_ID) {
                        this.#senses[DetectionMode.BASIC_MODE_ID] = Math.max(
                            this.#senses[DetectionMode.BASIC_MODE_ID],
                            minRange + range * unitsToPixels
                        );
                    }
                }
            }
        }
    }

    /**
     * @param {ClockwiseSweepPolygon} polygon
     * @param {PIXI.Rectangle} boundingBox
     */
    _defineBoundingBox(polygon, boundingBox) {
        const { x, y, z } = this.origin;

        let minX = boundingBox.left + 1;
        let minY = boundingBox.top + 1;
        let maxX = boundingBox.right - 1;
        let maxY = boundingBox.bottom - 1;
        const minZ = this.#minZ = z;
        const maxZ = this.#maxZ = z;
        let maxR = Math.hypot(
            Math.max(x - minX, maxX - x),
            Math.max(y - minY, maxY - y)
        );

        if (polygon.config.hasLimitedRadius) {
            maxR = Math.min(maxR, polygon.config.radius);
        }

        this.#maxR = maxR;

        const rayCaster0 = this.#rayCaster0 = RayCastingSystem.instance.createRayCaster(
            this.#senses, minX, minY, minZ, maxX, maxY, maxZ, maxR
        );

        rayCaster0.moveTo(x, y, z);

        const maxD = rayCaster0.maxD;

        this.#minX = minX = Math.max(minX, x - maxD);
        this.#minY = minY = Math.max(minY, y - maxD);
        this.#maxX = maxX = Math.min(maxX, x + maxD);
        this.#maxY = maxY = Math.min(maxY, y + maxD);

        boundingBox.x = minX;
        boundingBox.y = minY;
        boundingBox.width = maxX - minX;
        boundingBox.height = maxY - minY;
        boundingBox.ceil();
        boundingBox.pad(1);
    }

    /**
     * @param {ClockwiseSweepPolygon} polygon
     */
    _preCompute(polygon) {
        const boundaryShapes = polygon.config.boundaryShapes;

        for (let i = boundaryShapes.length - 1; i >= 0; i--) {
            if (boundaryShapes[i] instanceof VisionLimitation) {
                const lastBoundaryShape = boundaryShapes.pop();

                if (i < boundaryShapes.length) {
                    boundaryShapes[i] = lastBoundaryShape;
                }
            }
        }
    }

    /**
     * @param {ClockwiseSweepPolygon} polygon
     */
    _postCompute(polygon) {
        const points = polygon.points;
        const { x: ox, y: oy } = this.origin;
        const rayCaster0 = this.#rayCaster0;
        const maxD = rayCaster0.maxD;

        this.points = [];
        this.#constrain = maxD < this.#maxR;

        if (rayCaster0.minD === maxD) {
            if (this.#constrain) {
                this.#addCircleSegment(maxD, 0);
                this.#addCircleSegment(maxD, Math.PI * 0.5);
                this.#addCircleSegment(maxD, Math.PI);
                this.#addCircleSegment(maxD, Math.PI * 1.5);
            }

            this.#rayCaster1 = this.#rayCaster2 = this.#rayCaster3 = this.#rayCaster4 = null;
        } else {
            const m = points.length;
            let px0, py0, px1, py1, px2, py2, px3, py3;

            px0 = px1 = px2 = px3 = ox;
            py0 = py1 = py2 = py3 = oy;

            let i = 0;
            let x1, y1, q1;

            for (; i < m; i += 2) {
                x1 = points[i];
                y1 = points[i + 1];

                if (y1 > oy) {
                    q1 = x1 >= ox ? 0 : 1;

                    break;
                }

                if (y1 < oy) {
                    q1 = x1 <= ox ? 2 : 3;

                    break;
                }
                if (x1 !== ox) {
                    q1 = x1 <= ox ? 1 : 3;

                    break;
                }
            }

            if (i < m) {
                const i0 = i = (i + 2) % m;

                for (; ;) {
                    const x2 = points[i];
                    const y2 = points[i + 1];
                    let q2;

                    if (y2 > oy) {
                        q2 = x2 >= ox ? 0 : 1;
                    } else if (y2 < oy) {
                        q2 = x2 <= ox ? 2 : 3;
                    } else if (x2 !== ox) {
                        q2 = x2 <= ox ? 1 : 3;
                    } else {
                        q2 = q1;
                    }

                    if (q2 !== q1) {
                        let s;

                        switch (q1) {
                            case 0:
                            case 2:
                                if (x2 !== x1) {
                                    s = (ox - x1) / (x2 - x1);
                                    x1 = ox;
                                    y1 = y1 * (1 - s) + y2 * s;
                                } else {
                                    s = 0;
                                    x1 = ox;
                                    y1 = oy;
                                }

                                break;
                            case 1:
                            case 3:
                                if (y2 !== y1) {
                                    s = (oy - y1) / (y2 - y1);
                                    x1 = x1 * (1 - s) + x2 * s;
                                    y1 = oy;
                                } else {
                                    s = 0;
                                    x1 = ox;
                                    y1 = oy;
                                }

                                break;
                        }

                        switch (q1) {
                            case 0:
                                if (s !== 0) {
                                    px0 = Math.max(px0, x1);
                                    py0 = Math.max(py0, y1);
                                }

                                px1 = Math.min(px1, x1);
                                py1 = Math.max(py1, y1);

                                break;
                            case 1:
                                if (s !== 0) {
                                    px1 = Math.min(px1, x1);
                                    py1 = Math.max(py1, y1);
                                }

                                px2 = Math.min(px2, x1);
                                py2 = Math.min(py2, y1);

                                break;
                            case 2:
                                if (s !== 0) {
                                    px2 = Math.min(px2, x1);
                                    py2 = Math.min(py2, y1);
                                }

                                px3 = Math.max(px3, x1);
                                py3 = Math.min(py3, y1);

                                break;
                            case 3:
                                if (s !== 0) {
                                    px3 = Math.max(px3, x1);
                                    py3 = Math.min(py3, y1);
                                }

                                px0 = Math.max(px0, x1);
                                py0 = Math.max(py0, y1);

                                break;
                        }

                        q1 = (q1 + 1) % 4;
                    } else {
                        switch (q2) {
                            case 0:
                                if (x1 !== ox) {
                                    px0 = Math.max(px0, x2);
                                    py0 = Math.max(py0, y2);
                                }

                                break;
                            case 1:
                                if (y1 !== oy) {
                                    px1 = Math.min(px1, x2);
                                    py1 = Math.max(py1, y2);
                                }

                                break;
                            case 2:
                                if (x1 !== ox) {
                                    px2 = Math.min(px2, x2);
                                    py2 = Math.min(py2, y2);
                                }

                                break;
                            case 3:
                                if (y1 !== oy) {
                                    px3 = Math.max(px3, x2);
                                    py3 = Math.min(py3, y2);
                                }

                                break;
                        }

                        i = (i + 2) % m;

                        if (i === i0) {
                            break;
                        }

                        x1 = x2;
                        y1 = y2;
                        q1 = q2;
                    }
                }
            }

            const minX = this.#minX;
            const minY = this.#minY;
            const minZ = this.#minZ;
            const maxX = this.#maxX;
            const maxY = this.#maxY;
            const maxZ = this.#maxZ;

            px0 = Math.min(px0, maxX);
            px3 = Math.min(px3, maxX);
            py0 = Math.min(py0, maxY);
            py1 = Math.min(py1, maxY);
            px1 = Math.max(px1, minX);
            px2 = Math.max(px2, minX);
            py2 = Math.max(py2, minY);
            py3 = Math.max(py3, minY);

            {
                const rayCaster1 = this.#rayCaster1 = rayCaster0.crop(ox, oy, minZ, px0, py0, maxZ);
                const { minD, maxD } = rayCaster1;

                px0 = Math.min(px0, ox + maxD);
                py0 = Math.min(py0, oy + maxD);

                if (minD === maxD) {
                    if (maxD < Math.hypot(px0 - ox, py0 - oy)) {
                        this.#addCircleSegment(maxD, 0);
                    } else {
                        this.#addPoint(px0, oy);
                        this.points.push(px0, py0, ox, py0);
                    }
                } else {
                    this.#castRays(rayCaster1, px0, oy, px0, py0);
                    this.#castRays(rayCaster1, px0, py0, ox, py0);
                }
            }

            {
                const rayCaster2 = this.#rayCaster2 = rayCaster0.crop(px1, oy, minZ, ox, py1, maxZ);
                const { minD, maxD } = rayCaster2;

                px1 = Math.max(px1, ox - maxD);
                py1 = Math.min(py1, oy + maxD);

                if (minD === maxD) {
                    if (maxD < Math.hypot(ox - px1, py1 - oy)) {
                        this.#addCircleSegment(maxD, Math.PI * 0.5);
                    } else {
                        this.#addPoint(ox, py1);
                        this.points.push(px1, py1, px1, oy);
                    }
                } else {
                    this.#castRays(rayCaster2, ox, py1, px1, py1);
                    this.#castRays(rayCaster2, px1, py1, px1, oy);
                }
            }

            {
                const rayCaster3 = this.#rayCaster3 = rayCaster0.crop(px2, py2, minZ, ox, oy, maxZ);
                const { minD, maxD } = rayCaster3;

                px2 = Math.max(px2, ox - maxD);
                py2 = Math.max(py2, oy - maxD);

                if (minD === maxD) {
                    if (maxD < Math.hypot(ox - px2, oy - py2)) {
                        this.#addCircleSegment(maxD, Math.PI);
                    } else {
                        this.#addPoint(px2, oy);
                        this.points.push(px2, py2, ox, py2);
                    }
                } else {
                    this.#castRays(rayCaster3, px2, oy, px2, py2);
                    this.#castRays(rayCaster3, px2, py2, ox, py2);
                }
            }

            {
                const rayCaster4 = this.#rayCaster4 = rayCaster0.crop(ox, py3, minZ, px3, oy, maxZ);
                const { minD, maxD } = rayCaster4;

                px3 = Math.min(px3, ox + maxD);
                py3 = Math.max(py3, oy - maxD);

                if (minD === maxD) {
                    if (maxD < Math.hypot(px3 - ox, oy - py3)) {
                        this.#addCircleSegment(maxD, Math.PI * 1.5);
                    } else {
                        this.#addPoint(ox, py3);
                        this.points.push(px3, py3, px3, oy);
                    }
                } else {
                    this.#castRays(rayCaster4, ox, py3, px3, py3);
                    this.#castRays(rayCaster4, px3, py3, px3, oy);
                }
            }
        }

        if (this.#constrain) {
            this.#closePoints();

            this.unconstrained = new polygon.constructor(polygon.points);
            this.unconstrained.config = { ...polygon.config };
            this.unconstrained.config.boundaryShapes = Array.from(polygon.config.boundaryShapes);
            this.unconstrained.origin = polygon.origin;
            this.unconstrained.edges = polygon.edges;
            this.unconstrained.rays = polygon.rays;
            this.unconstrained.vertices = polygon.vertices;
            this.unconstrained.bounds = this.unconstrained.getBounds();

            polygon.config.boundaryShapes.push(this);

            if (this.points.length >= 6) {
                polygon.points = polygon.intersectPolygon(this).points;
            } else {
                polygon.points.length = 0;
            }
        } else {
            this.points.length = 0;
            this.points.push(
                this.#minX, this.#minY,
                this.#maxX, this.#minY,
                this.#maxX, this.#maxY,
                this.#minX, this.#maxY
            );

            this.unconstrained = polygon;
        }
    }

    /**
     * @param {ClockwiseSweepPolygon} polygon
     */
    _visualize(polygon) {
        const dg = canvas.controls.debug;

        dg.lineStyle(8, 0xFF00FF, 1.0)
            .beginFill(0xFF00FF, 0.0)
            .drawRect(this.#minX, this.#minY, this.#maxX - this.#minX, this.#maxY - this.#minY)
            .endFill();
        dg.lineStyle(4, 0xFFFF00, 1.0);

        for (const rayCaster of [this.#rayCaster1, this.#rayCaster2, this.#rayCaster3, this.#rayCaster4]) {
            if (!rayCaster) {
                continue;
            }

            dg.beginFill(0xFFFF00, rayCaster.minD < rayCaster.maxD ? 0.25 : 0.0)
                .drawRect(
                    rayCaster.minX,
                    rayCaster.minY,
                    rayCaster.maxX - rayCaster.minX,
                    rayCaster.maxY - rayCaster.minY
                )
                .endFill();
        }

        dg.lineStyle(4, 0xFF0000, 1.0)
            .beginFill(0xFF0000, 0.0)
            .drawPolygon(this.points)
            .endFill();
    }

    #addCircleSegment(radius, aStart, aDelta = Math.PI * 0.5) {
        const { x, y } = this.origin;

        if (radius === 0) {
            this.#addPoint(x, y);

            return;
        }

        this.#addPoint(
            x + Math.cos(aStart) * radius,
            y + Math.sin(aStart) * radius
        );

        if (radius < canvas.dimensions.maxR) {
            const epsilon = 1; // PIXI.Circle.approximateVertexDensity
            const nStep = Math.ceil(aDelta / Math.sqrt(2 * epsilon / radius) - 1e-3);
            const aStep = aDelta / nStep;
            const points = this.points;

            for (let i = 1; i <= nStep; i++) {
                const a = aStart + aStep * i;

                points.push(
                    x + Math.cos(a) * radius,
                    y + Math.sin(a) * radius,
                );
            }
        } else {
            const aStep = aDelta * 0.5;
            const aMid = aStart + aStep;
            const aStop = aStart + aDelta;
            const radiusMid = radius / Math.cos(aStep);

            points.push(
                x + Math.cos(aMid) * radiusMid,
                y + Math.sin(aMid) * radiusMid,
                x + Math.cos(aStop) * radius,
                y + Math.sin(aStop) * radius
            );
        }
    }

    #castRays(rayCaster, c0x, c0y, c1x, c1y) {
        const { x, y, z } = this.origin;

        rayCaster.moveTo(x, y, z);

        const precision = canvas.dimensions.size / 10;
        const precision2 = precision * precision;
        const c0dx = c0x - x;
        const c0dy = c0y - y;
        const t0 = rayCaster.castTo(c0x, c0y, z);

        if (t0 < 0.99999) {
            this.#constrain = true;
        }

        const r0x = x + t0 * c0dx;
        const r0y = y + t0 * c0dy;

        this.#addPoint(r0x, r0y);

        const c1dx = c1x - x;
        const c1dy = c1y - y;
        const t1 = rayCaster.castTo(c1x, c1y, z);
        const r1x = x + t1 * c1dx;
        const r1y = y + t1 * c1dy;
        let cdx = c1x - c0x;
        let cdy = c1y - c0y;
        const cdd = Math.sqrt(cdx * cdx + cdy * cdy);

        cdx /= cdd;
        cdy /= cdd;

        const u0n = cdx * c0dx + cdy * c0dy;
        const ndx = c0dx - u0n * cdx;
        const ndy = c0dy - u0n * cdy;
        let ndd = ndx * ndx + ndy * ndy;

        if (ndd > 1e-6) {
            ndd /= Math.sqrt(ndd);

            const pdx = cdx * ndd * 0.5;
            const pdy = cdy * ndd * 0.5;
            const u1n = cdx * c1dx + cdy * c1dy;
            const c0dd = Math.sqrt(c0dx * c0dx + c0dy * c0dy);
            const c1dd = Math.sqrt(c1dx * c1dx + c1dy * c1dy);
            const fu0 = Math.log((u0n + c0dd) / ndd); // Math.asinh(u0n / ndd)
            const fu1 = Math.log((u1n + c1dd) / ndd); // Math.asinh(u1n / ndd)
            const dfu = fu1 - fu0;
            const fuk = Math.ceil(Math.abs(dfu * (ndd / precision))); // Math.asinh(precision / ndd)
            const fud = dfu / fuk;

            const recur = (i0, x0, y0, i2, x2, y2) => {
                if (!(i2 - i0 > 1)) {
                    return;
                }

                const dx02 = x0 - x2;
                const dy02 = y0 - y2;
                const dd02 = dx02 * dx02 + dy02 * dy02;

                if (dd02 <= precision2) {
                    return;
                }

                const i1 = (i0 + i2) >> 1;
                let u = Math.exp(fu0 + i1 * fud) - 1; u += u / (u + 1); // Math.sinh(fu0 + i1 * fud)
                const dx = ndx + u * pdx;
                const dy = ndy + u * pdy;
                const t1 = rayCaster.castTo(x + dx, y + dy, z); // TODO: optimize?
                const x1 = x + t1 * dx;
                const y1 = y + t1 * dy;

                recur(i0, x0, y0, i1, x1, y1);

                if (t1 < 0.99999) {
                    this.#constrain = true;
                }

                this.#addPoint(x1, y1);

                recur(i1, x1, y1, i2, x2, y2);
            };

            recur(0, r0x, r0y, fuk, r1x, r1y);
        }

        if (t1 < 0.99999) {
            this.#constrain = true;
        }

        this.#addPoint(r1x, r1y);
    }

    #addPoint(x, y) {
        const points = this.points;
        const m = points.length;

        if (m >= 4) {
            let x3 = points[m - 4];
            let y3 = points[m - 3];
            let x2 = points[m - 2];
            let y2 = points[m - 1];
            let x1 = x;
            let y1 = y;

            if (Math.abs(x1 - x2) > Math.abs(y1 - y2)) {
                if ((x1 > x2) !== (x1 < x3)) {
                    if ((x2 > x1) === (x2 < x3)) {
                        [x1, y1, x2, y2] = [x2, y2, x1, y1];
                    } else {
                        [x1, y1, x2, y2, x3, y3] = [x3, y3, x1, y1, x2, y2];
                    }
                }
            } else {
                if ((y1 > y2) !== (y1 < y3)) {
                    if ((y2 > y1) === (y2 < y3)) {
                        [x1, y1, x2, y2] = [x2, y2, x1, y1];
                    } else {
                        [x1, y1, x2, y2, x3, y3] = [x3, y3, x1, y1, x2, y2];
                    }
                }
            }

            const a = y2 - y3;
            const b = x3 - x2;
            const c = a * (x1 - x2) + b * (y1 - y2);

            if ((c * c) / (a * a + b * b) > 0.0625) {
                points.push(x, y);
            } else {
                const dx = points[m - 4] - x;
                const dy = points[m - 3] - y;

                points.length -= 2;

                if (dx * dx + dy * dy > 0.0625) {
                    points.push(x, y);
                }
            }
        } else if (m === 2) {
            const dx = points[m - 2] - x;
            const dy = points[m - 1] - y;

            if (dx * dx + dy * dy > 0.0625) {
                points.push(x, y);
            }
        } else {
            points.push(x, y);
        }
    }

    #closePoints() {
        const points = this.points;

        if (points.length < 6) {
            points.length = 0;

            return;
        }

        const [x1, y1, x2, y2] = points;

        this.#addPoint(x1, y1);
        this.#addPoint(x2, y2);

        const m = points.length;

        [points[0], points[1], points[2], points[3]] = [points[m - 4], points[m - 3], points[m - 2], points[m - 1]];
        points.length -= 4;
    }
}
