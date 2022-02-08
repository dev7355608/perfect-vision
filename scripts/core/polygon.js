import { patch } from "../utils/patch.js";
import { LimitSystem } from "./limit-system.js";

Hooks.once("init", () => {
    patch("ClockwiseSweepPolygon.prototype.initialize", "WRAPPER", function (wrapped, origin, config, ...args) {
        if (config.type === "sight") {
            config.density = Math.max(config.density ?? 0, 60);
            config.radiusMin = config.radiusMin ?? 0;
            config._pv_paddingDensity = Math.PI / config.density;
            config._pv_precision = Math.ceil(canvas.dimensions.size / 10);
            config._pv_limits = LimitSystem.instance.estimateRayLimits(
                origin.x,
                origin.y,
                config.radiusMin,
                config.radius ?? Infinity
            );
            config._pv_castRays = config._pv_limits[0] < config._pv_limits[1];

            if (Number.isFinite(config._pv_limits[1])) {
                config.radius = Math.max(config._pv_limits[1], 1);
                config._pv_density = Math.min(config._pv_paddingDensity, Math.asin(Math.min(0.5 * config._pv_precision / config.radius, 1)) * 2);

                this._pv_limited = true;
            } else {
                config.radius = undefined;

                this._pv_limited = config._pv_castRays; // TODO
            }
        }

        return wrapped(origin, config, ...args);
    });

    patch("ClockwiseSweepPolygon.prototype._constructPolygonPoints", "OVERRIDE", function () {
        const { hasLimitedAngle, hasLimitedRadius } = this.config;
        this.points = [];

        // We must have at least 2 rays with collision points, otherwise supplementary rays are needed
        if (hasLimitedRadius) {

            // Determine whether supplementary rays are required
            let n = 0;
            for (let r of this.rays) {
                if (r.result.collisions.length) n++;
                if (n > 1) break;
            }

            // Add minimum and maximum rays
            if (n < 2) {
                const rMin = this.config.rMin;
                const vMin = PolygonVertex.fromPoint(rMin.B, { distance: 1 });
                rMin.result = new CollisionResult({ target: vMin, collisions: [vMin] });
                this.rays.unshift(rMin);

                const rMax = Ray.fromAngle(this.origin.x, this.origin.y, this.config.aMax, this.config.radius);
                const vMax = PolygonVertex.fromPoint(rMax.B, { distance: 1 });
                rMax.result = new CollisionResult({ target: vMax, collisions: [vMax] });
                this.rays.push(rMax);
            }
        }

        // We need padding points before a ray if the prior ray reached its termination and has no clockwise edges
        const needsPadding = lastRay => {
            if (!hasLimitedRadius || !lastRay) return false;
            const r = lastRay.result;
            const c = r.collisions[r.collisions.length - 1];
            return c.isTerminal && !c.cwEdges.size;
        }

        let addPadding;
        let processEdge;
        let processRay;
        let pointQueue;

        if (this.config._pv_castRays) {
            const ls = LimitSystem.instance;
            const ox = this.origin.x;
            const oy = this.origin.y;
            const rox = ls.constructor.round(this.origin.x);
            const roy = ls.constructor.round(this.origin.y);
            const rmin = this.config.radiusMin;
            const [lmin, rmax] = this.config._pv_limits;
            const lmin2 = lmin * lmin;
            const precision = this.config._pv_precision;
            const precision2 = precision * precision;

            pointQueue = [];

            addPadding = (r0, r1, t0, x0, y0, x1, y1) => {
                let d = r1.angle - r0.angle;

                if (d < 0) {
                    d += 2 * Math.PI;
                }

                const nPad = Math.ceil(d / this.config._pv_density);
                const delta = d / nPad;
                const density = this.config._pv_paddingDensity - 0.5 * delta;
                const a = r0.angle;

                let s = t0 === 1 ? 1 : 0;

                if (d === 0) {
                    return s;
                }

                const recur = (i0, x0, y0, i2, x2, y2, p2) => {
                    if (i2 - i0 <= 1) {
                        return;
                    }

                    const dx02 = x0 - x2;
                    const dy02 = y0 - y2;

                    if (dx02 * dx02 + dy02 * dy02 <= p2) {
                        return;
                    }

                    const i1 = (i0 + i2) >> 1;
                    const a1 = a + i1 * delta;
                    const dx = Math.cos(a1);
                    const dy = Math.sin(a1);
                    const x = ox + rmax * dx;
                    const y = oy + rmax * dy;
                    const rbx = ls.constructor.round(x);
                    const rby = ls.constructor.round(y);
                    const t = ls.castRayUnsafe(rox, roy, rbx - rox, rby - roy, 0, rmin, rmax);
                    const x1 = ox + t * (x - ox);
                    const y1 = oy + t * (y - oy);

                    recur(i0, x0, y0, i1, x1, y1, precision2);

                    if (t === 1 && s === 2) {
                        this.points.length -= 2;
                    }

                    this.points.push(x1, y1);

                    d += delta;

                    if (t !== 1) {
                        s = 0;
                    } else if (d >= density) {
                        s = 1;
                        d = 0;
                    } else if (s === 0) {
                        s = 1;
                    } else {
                        s = 2;
                    }

                    recur(i1, x1, y1, i2, x2, y2, precision2);
                };

                recur(0, x0, y0, nPad, x1, y1, -1);

                return s;
            };

            processEdge = (r0, r1, t0, x0, y0, x1, y1) => {
                const c0 = r0.result.collisions[r0.result.collisions.length - 1];
                const c1 = r1.result.collisions[0];
                const c0dx = c0.x - ox;
                const c0dy = c0.y - oy;
                const c0dd = c0dx * c0dx + c0dy * c0dy;
                const c1dx = c1.x - ox;
                const c1dy = c1.y - oy;
                const c1dd = c1dx * c1dx + c1dy * c1dy;

                if (c0dd <= lmin2 && c1dd <= lmin2) {
                    return;
                }

                let cdx = c1.x - c0.x;
                let cdy = c1.y - c0.y;
                const cdd = Math.sqrt(cdx * cdx + cdy * cdy);

                cdx /= cdd;
                cdy /= cdd;

                const u0 = cdx * (c0.x - ox) + cdy * (c0.y - oy);
                const u1 = cdx * (c1.x - ox) + cdy * (c1.y - oy);
                const px = c0.x - u0 * cdx;
                const py = c0.y - u0 * cdy;
                const ndx = px - ox;
                const ndy = py - oy;
                const ndd = Math.sqrt(ndx * ndx + ndy * ndy);
                const fu0 = Math.asinh(u0 / ndd);
                const fu1 = Math.asinh(u1 / ndd);
                const d = fu1 - fu0;
                const nPad = Math.ceil(Math.abs(d / Math.asinh(precision / ndd)));
                const delta = d / nPad;

                let s = t0 === 1 ? 1 : 0;

                const recur = (i0, x0, y0, i2, x2, y2) => {
                    if (i2 - i0 <= 1) {
                        return;
                    }

                    const dx02 = x0 - x2;
                    const dy02 = y0 - y2;

                    if (dx02 * dx02 + dy02 * dy02 <= precision2) {
                        return;
                    }

                    const i1 = (i0 + i2) >> 1;
                    const u = Math.sinh(fu0 + i1 * delta) * ndd;
                    const x = px + u * cdx;
                    const y = py + u * cdy;
                    const rbx = ls.constructor.round(x);
                    const rby = ls.constructor.round(y);
                    const t = ls.castRayUnsafe(rox, roy, rbx - rox, rby - roy, 0, rmin);
                    const x1 = ox + t * (x - ox);
                    const y1 = oy + t * (y - oy);

                    recur(i0, x0, y0, i1, x1, y1);

                    if (t === 1 && s === 2) {
                        this.points.length -= 2;
                    }

                    this.points.push(x1, y1);

                    s = t !== 1 ? 0 : s === 0 ? 1 : 2;

                    recur(i1, x1, y1, i2, x2, y2);
                };

                recur(0, x0, y0, nPad, x1, y1);

                return s;
            };

            processRay = ray => {
                const rbx = ls.constructor.round(ray.B.x);
                const rby = ls.constructor.round(ray.B.y);
                const rdx = rbx - rox;
                const rdy = rby - roy;
                const rmax = Math.sqrt(rdx * rdx + rdy * rdy);
                const d = ls.castRayUnsafe(rox, roy, rdx, rdy, 0, rmin, rmax) * rmax;

                // Add collision points for the ray
                let x0, y0;

                for (const c of ray.result.collisions) {
                    const t = Math.min(1, d / Math.hypot(c.x - ox, c.y - oy));
                    const x = ox + t * (c.x - ox);
                    const y = oy + t * (c.y - oy);

                    if (!(Math.max(Math.abs(x - x0), Math.abs(y - y0)) < 0.5)) {
                        pointQueue.push(t, x, y);
                    }

                    x0 = x;
                    y0 = y;
                }
            }
        } else {
            addPadding = (r0, r1) => {
                const density = Math.PI / this.config.density;
                let d = r1.angle - r0.angle;

                if (d < 0) {
                    d += 2 * Math.PI;
                }

                const nPad = Math.ceil(d / density);
                const delta = d / nPad;

                for (let i = 1; i < nPad; i++) {
                    const p = r0.shiftAngle(i * delta).B;

                    this.points.push(p.x, p.y);
                }
            };
        }

        // Add points for rays in the sweep
        let lastRay;
        let t0, x0, y0, s, t;

        for (const ray of this.rays) {
            if (!ray.result.collisions.length) {
                continue;
            }

            let x1, y1;

            if (processRay) {
                processRay(ray);

                x1 = pointQueue[1];
                y1 = pointQueue[2];
            }

            if (needsPadding(lastRay)) {
                s = addPadding(lastRay, ray, t0, x0, y0, x1, y1);
            } else if (processEdge && lastRay) {
                s = processEdge(lastRay, ray, t0, x0, y0, x1, y1);
            } else if (pointQueue && !lastRay) {
                t = pointQueue[0];
            }

            if (processRay) {
                for (let i = 0; i < pointQueue.length; i += 3) {
                    t0 = pointQueue[i];
                    x0 = pointQueue[i + 1];
                    y0 = pointQueue[i + 2];

                    if (i === 0 && t0 === 1 && s === 2) {
                        this.points.length -= 2;
                    }

                    this.points.push(x0, y0);
                }

                pointQueue.length = 0;
            } else {
                for (const c of ray.result.collisions) {
                    this.points.push(c.x, c.y);
                }
            }

            lastRay = ray;
        }

        // Close the limited shape
        if (hasLimitedAngle) {
            this.points.push(this.origin.x, this.origin.y);

            t = s = 0;
        }
        // Final padding rays, if necessary
        else if (needsPadding(lastRay)) {
            const firstRay = this.rays.find(r => r.result.collisions.length);
            const x1 = this.points[0];
            const y1 = this.points[1];

            s = addPadding(lastRay, firstRay, t0, x0, y0, x1, y1);
        } else if (processEdge && lastRay) {
            const firstRay = this.rays.find(r => r.result.collisions.length);
            const x1 = this.points[0];
            const y1 = this.points[1];

            s = processEdge(lastRay, firstRay, t0, x0, y0, x1, y1);
        }

        if (t === 1 && s === 2) {
            this.points.length -= 2;
        }
    });

    // TODO: ClockwisePolygon.prototype.getRayCollisions
});
