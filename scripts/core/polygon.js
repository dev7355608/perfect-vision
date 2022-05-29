import { patch } from "../utils/patch.js";
import { LimitSystem } from "./limit-system.js";

Hooks.once("init", () => {
    PointSourcePolygon.prototype.limited = false;

    patch("ClockwiseSweepPolygon.prototype._compute", "MIXED", function (wrapped) {
        const cfg = this.config;

        cfg.density = optimalDensity(cfg.radius);

        if (cfg.type !== "sight") {
            return wrapped();
        }

        const { x, y } = this.origin;
        let radius = Math.min(cfg.radius, canvas.dimensions.maxR);
        const rMin = cfg.radiusMin ?? 0;
        let xMin, xMax, yMin, yMax;

        if (cfg.hasLimitedAngle) {
            const { aMin, aMax } = cfg;
            const cMin = Math.cos(aMin);
            const cMax = Math.cos(aMax);
            const sMin = Math.sin(aMin);
            const sMax = Math.sin(aMax);

            if (aMax >= Math.PI) {
                xMin = -1;
            } else {
                xMin = Math.min(0, cMin, cMax);
            }

            if (aMin <= 0 && aMax >= 0 || aMin >= 0 && aMax >= Math.PI * 2) {
                xMax = +1;
            } else {
                xMax = Math.max(0, cMin, cMax);
            }

            if (aMin <= -Math.PI * 0.5 && aMax >= -Math.PI * 0.5 || aMin >= -Math.PI * 0.5 && aMax >= Math.PI * 1.5) {
                yMin = -1;
            } else {
                yMin = Math.min(0, sMin, sMax);
            }

            if (aMin <= Math.PI * 0.5 && aMax >= Math.PI * 0.5 || aMin >= Math.PI * 0.5 && aMax >= Math.PI * 2.5) {
                yMax = +1;
            } else {
                yMax = Math.max(0, sMin, sMax);
            }

            xMin = x + xMin * radius;
            xMax = x + xMax * radius;
            yMin = y + yMin * radius;
            yMax = y + yMax * radius;
        } else {
            xMin = x - radius;
            xMax = x + radius;
            yMin = y - radius;
            yMax = y + radius;
        }

        const [lMin, lMax] = LimitSystem.instance.estimateRayLimits(
            xMin, yMin, xMax, yMax, rMin, radius
        );

        if (cfg.radius !== lMax) {
            cfg.hasLimitedRadius = lMax < canvas.dimensions.maxR;
            cfg.radius = lMax;
            cfg.radius2 = Math.pow(cfg.radius, 2);
            cfg.radiusE = 0.5 / cfg.radius;
            cfg.density = optimalDensity(cfg.radius);
            cfg.rMin = this._roundRayVertices(Ray.fromAngle(x, y, cfg.aMin, cfg.radius));

            if (cfg.hasLimitedAngle) {
                cfg.rMax = this._roundRayVertices(Ray.fromAngle(x, y, cfg.aMax, cfg.radius));
            }
        }

        if (cfg.radius === 0) {
            return;
        }

        wrapped();

        if (lMin === lMax) {
            return;
        }

        const rMax = cfg.radius;
        const precision = canvas.dimensions.size / 10;
        const points = [];
        let limited = false;

        radius = -1;

        for (let path of cutIntoQuarters(x, y, this.points)) {
            let xMin = x;
            let xMax = x;
            let yMin = y;
            let yMax = y;

            for (let i = 0, m = path.length; i < m; i += 2) {
                const x = path[i];
                const y = path[i + 1];

                xMin = Math.min(xMin, x);
                yMin = Math.min(yMin, y);
                xMax = Math.max(xMax, x);
                yMax = Math.max(yMax, y);
            }

            const [lMin, lMax] = LimitSystem.instance.estimateRayLimits(xMin, yMin, xMax, yMax, rMin, rMax);

            if (radius < 0) {
                radius = lMax;
            } else if (radius < lMax) {
                radius = lMax;
                limited = true;
            } else if (radius > lMax) {
                limited = true;
            }

            if (lMax < rMax) {
                path = restrictRadius(x, y, path, lMax, optimalDensity(lMax));
            }

            if (lMin < lMax) {
                limited = castRays(x, y, path, rMin, lMin, precision, points) || limited;
            } else {
                for (let i = 0, m = path.length; i < m; i += 2) {
                    const x = path[i];
                    const y = path[i + 1];

                    addPoint(points, x, y);
                }
            }
        }

        if (points.length >= 6) {
            const [x1, y1, x2, y2] = points;

            addPoint(points, x1, y1);
            addPoint(points, x2, y2);

            const m = points.length;

            [points[0], points[1], points[2], points[3]] = [points[m - 4], points[m - 3], points[m - 2], points[m - 1]];
            points.length -= 4;
        }

        this.config.radius = Math.max(radius, 0);
        this.points = points;
        this.limited = limited;
    });

    // TODO: ClockwisePolygon.prototype.getRayCollisions
});

function optimalDensity(radius) {
    return Math.min(60, 2 * Math.sqrt(radius));
}

function cutIntoQuarters(x0, y0, points) {
    const m = points.length;
    const qs = [];
    let i = 0;

    for (; i < m; i += 2) {
        if (points[i] !== x0 || points[i + 1] !== y0) {
            break;
        }
    }

    if (i === m) {
        return qs;
    }

    for (let i0 = i, x1, y1, q1, qp, qc = 0; ;) {
        const x2 = points[i % m];
        const y2 = points[(i + 1) % m];
        let q2;

        if (y2 > y0) {
            q2 = x2 >= x0 ? 0 : 1;
        } else if (y2 < y0) {
            q2 = x2 <= x0 ? 2 : 3;
        } else if (x2 !== x0) {
            q2 = x2 <= x0 ? 1 : 3;
        } else {
            q2 = q1;
        }

        if (qp) {
            if (qp.length === m - 1) {
                break;
            }

            qp.push(x1, y1);
        }

        if (q2 !== (q1 ?? q2)) {
            let s;

            switch (q1) {
                case 0:
                case 2:
                    if (x2 !== x1) {
                        s = (x0 - x1) / (x2 - x1);
                        x1 = x0;
                        y1 = y1 * (1 - s) + y2 * s;
                    } else {
                        s = y1 / (y1 - y2);
                        x1 = x0;
                        y1 = y0;
                    }

                    if (qp) {
                        qp.push(x1, y1);

                        while (qp.length >= 3 && qp[qp.length - 4] === x0) {
                            qp.length -= 2;
                        }
                    }

                    break;
                case 1:
                case 3:
                    if (y2 !== y1) {
                        s = (y0 - y1) / (y2 - y1);
                        x1 = x1 * (1 - s) + x2 * s;
                        y1 = y0;
                    } else {
                        s = x1 / (x1 - x2);
                        x1 = x0;
                        y1 = y0;
                    }

                    if (qp) {
                        qp.push(x1, y1);

                        while (qp.length >= 3 && qp[qp.length - 3] === y0) {
                            qp.length -= 2;
                        }
                    }

                    break;
            }

            if (qp?.length === 2) {
                qs.length -= 1;
            }

            if (qc === 4) {
                break;
            }

            qc++;
            qs.push(qp = []);
            q1 = (q1 + 1) % 4;
        } else {
            x1 = x2;
            y1 = y2;
            q1 = q2;
            i = (i + 2) % m;

            if (i === i0 && !qp) {
                qs.push(points);

                break;
            }
        }
    }

    return qs;
}

function restrictRadius(x, y, points, radius, density) {
    if (radius <= 0) {
        return [];
    }

    points.push(x, y);

    const p = [];
    const rr = radius * radius;
    const sa = Math.PI / density;

    for (let i = 0, m = points.length, x1 = 0, y1 = 0; i < m; i += 2) {
        const x2 = points[i] - x;
        const y2 = points[i + 1] - y;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dd = x1 * x1 + y1 * y1;
        const a = dx * dx + dy * dy;
        const b = dx * x1 + dy * y1;
        const c = dd - rr;
        const d1 = b * b - a * c;

        if (a === 0) {
            continue;
        }

        if (c <= 0) {
            p.push(x + x1, y + y1);
        }

        if (d1 >= 0) {
            const d2 = Math.sqrt(d1);
            let t1 = (-b - d2) / a;
            let t2 = (-b + d2) / a;

            if (t2 <= -1e-6 || t2 >= 1 + 1e-6) {
                t2 = NaN;
            } else {
                t2 = Math.clamped(t2, 0, 1);
            }

            if (t1 <= -1e-6 || t1 >= 1 + 1e-6) {
                [t1, t2] = [t2, NaN];
            } else {
                t1 = Math.clamped(t1, 0, 1);
            }

            if (t1 === t1) {
                const xt1 = x + (x1 + dx * t1);
                const yt1 = y + (y1 + dy * t1);

                if (c > 0) {
                    const a0 = Math.atan2(p[p.length - 1] - y, p[p.length - 2] - x);
                    const a1 = Math.atan2(yt1 - y, xt1 - x);
                    const da = a1 - a0 + (a1 < a0 ? Math.PI * 2 : 0);
                    const na = Math.ceil(da / sa);

                    for (let j = 1; j < na; j++) {
                        const a = a0 + da * (j / na);

                        p.push(
                            x + Math.cos(a) * radius,
                            y + Math.sin(a) * radius
                        );
                    }
                }

                if (xt1 !== p[p.length - 2] || yt1 !== p[p.length - 1]) {
                    p.push(xt1, yt1);
                }

                if (t2 > t1) {
                    const xt2 = x + (x1 + dx * t2);
                    const yt2 = y + (y1 + dy * t2);

                    if (xt2 !== xt1 || yt2 !== yt1) {
                        p.push(xt2, yt2);
                    }
                }
            }
        }

        x1 = x2;
        y1 = y2;
    }

    points.length -= 2;

    return p;
}

function castRays(x, y, points, rMin, lMin, precision, out) {
    const ls = LimitSystem.instance;
    const lMin2 = lMin * lMin;
    const precision2 = precision * precision;
    let state = 0;
    let limited = false;
    let c0x = points[0];
    let c0y = points[1];
    let c0dx = c0x - x;
    let c0dy = c0y - y;
    let c0dd = c0dx * c0dx + c0dy * c0dy;

    c0dd /= Math.sqrt(c0dd);

    const t0 = c0dd > lMin ? ls.castRay(x, y, c0dx, c0dy, 0, rMin) : 1;
    let r0x = x + t0 * c0dx;
    let r0y = y + t0 * c0dy;

    if (t0 >= 0.99998) {
        state = 1;
    } else {
        state = 0;
        limited = true;
    }

    addPoint(out, r0x, r0y);

    for (let i = 2, m = points.length; i < m; i += 2) {
        const c1x = points[i];
        const c1y = points[i + 1];
        const c1dx = c1x - x;
        const c1dy = c1y - y;
        let c1dd = c1dx * c1dx + c1dy * c1dy;

        c1dd /= Math.sqrt(c1dd);

        const t1 = c1dd > lMin ? ls.castRay(x, y, c1dx, c1dy, 0, rMin) : 1;
        const r1x = x + t1 * c1dx;
        const r1y = y + t1 * c1dy;

        if (c0dd > lMin || c1dd > lMin) {
            let cdx = c1x - c0x;
            let cdy = c1y - c0y;
            let cdd = cdx * cdx + cdy * cdy;

            if (cdd > precision2) {
                cdd = Math.sqrt(cdd);
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
                        const dd = dx * dx + dy * dy;
                        const t1 = dd > lMin2 ? ls.castRay(x, y, dx, dy, 0, rMin) : 1;
                        const x1 = x + t1 * dx;
                        const y1 = y + t1 * dy;

                        recur(i0, x0, y0, i1, x1, y1);

                        if (t1 >= 0.99998) {
                            if (state === 2) {
                                out.length -= 2;
                            }

                            state = state === 0 ? 1 : 2;
                        } else {
                            state = 0;
                            limited = true;
                        }

                        addPoint(out, x1, y1);

                        recur(i1, x1, y1, i2, x2, y2);
                    };

                    recur(0, r0x, r0y, fuk, r1x, r1y);
                }
            }
        }

        if (t1 >= 0.99998) {
            if (state === 2) {
                out.length -= 2;
            }

            state = 1;
        } else {
            state = 0;
            limited = true;
        }

        addPoint(out, r1x, r1y);

        c0x = c1x;
        c0y = c1y;
        c0dx = c1dx;
        c0dy = c1dy;
        c0dd = c1dd;
        r0x = r1x;
        r0y = r1y;
    }

    return limited;
}

function addPoint(points, x, y) {
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

    return points;
}
