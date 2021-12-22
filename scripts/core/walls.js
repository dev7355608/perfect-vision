import { patch } from "../utils/patch.js";
import { TransformedShape } from "../utils/transformed-shape.js";

Hooks.once("init", () => {
    patch("WallsLayer.prototype._createBoundaries", "OVERRIDE", function () {
        // Boundaries are padded outwards by the grid size to allow lighting effects to be cleanly masked at the edges
        let { width, height, size } = canvas.dimensions;

        size /= 10;

        const coords = [-size, -size, width + size, -size, width + size, height + size, -size, height + size, -size, -size];

        // Register boundaries
        this.boundaries.clear();
        for (let i = 0; i < 4; i++) {
            const d = new WallDocument({
                _id: foundry.utils.randomID(),
                c: coords.slice(i * 2, (i * 2) + 4)
            }, { parent: canvas.scene });
            this.boundaries.add(new Wall(d));
        }
    });

    patch("ClockwiseSweepPolygon.prototype.initialize", "WRAPPER", function (wrapped, origin, config, ...args) {
        if (config.type === "sight") {
            config.density = Math.max(config.density ?? 0, 60);
            config.radiusMin = config.radiusMin ?? 0;
            config._pv_paddingDensity = Math.PI / config.density;
            config._pv_precision = Math.ceil(canvas.dimensions.size / 5);
            config._pv_limits = canvas._pv_raySystem.estimateRayLimits(
                RaySystem.round(origin.x),
                RaySystem.round(origin.y),
                config.radiusMin,
                config.radius ?? Infinity
            );
            config._pv_castRays = config._pv_limits[0] < config._pv_limits[1];

            if (Number.isFinite(config._pv_limits[1])) {
                config.radius = Math.max(config._pv_limits[1], 1);
                config._pv_density = Math.min(config._pv_paddingDensity, Math.asin(Math.min(0.5 * config._pv_precision / config.radius, 1)) * 2);
            } else {
                config.radius = undefined;
            }
        }

        return wrapped(origin, config, ...args);
    });

    patch("ClockwiseSweepPolygon.prototype._constructPolygonPoints", "OVERRIDE", function () {
        const { hasLimitedAngle, hasLimitedRadius, type } = this.config;
        this.points = [];

        // Open a limited shape
        if (hasLimitedAngle) {
            this.points.push(this.origin.x, this.origin.y);
        }

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
            const rs = canvas._pv_raySystem;
            const ox = this.origin.x;
            const oy = this.origin.y;
            const rox = RaySystem.round(this.origin.x);
            const roy = RaySystem.round(this.origin.y);
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

                const nPad = Math.round(d / this.config._pv_density);
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
                    const rbx = RaySystem.round(x);
                    const rby = RaySystem.round(y);
                    const t = rs.castRay(rox, roy, rbx - rox, rby - roy, 0, rmin, rmax);
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

                let ndx = c0.x - ox;
                let ndy = c0.y - oy;
                const u = cdx * ndx + cdy * ndy;

                ndx -= u * cdx;
                ndy -= u * cdy;

                const ndd = Math.sqrt(ndx * ndx + ndy * ndy);

                ndx /= ndd;
                ndy /= ndd;

                let d = r1.angle - r0.angle;

                if (d < 0) {
                    d += 2 * Math.PI;
                }

                const nPad = Math.round(d / Math.min(this.config._pv_paddingDensity, Math.abs(2 * Math.asin(Math.min(0.5 * precision / ndd, 1)))));
                const delta = d / nPad;
                const a = r0.angle;

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
                    const a1 = a + i1 * delta;
                    const dx = Math.cos(a1);
                    const dy = Math.sin(a1);
                    const dist = ndd / (ndx * dx + ndy * dy);
                    const x = ox + dist * dx;
                    const y = oy + dist * dy;
                    const rbx = RaySystem.round(x);
                    const rby = RaySystem.round(y);
                    const t = rs.castRay(rox, roy, rbx - rox, rby - roy, 0, rmin);
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
                const rbx = RaySystem.round(ray.B.x);
                const rby = RaySystem.round(ray.B.y);
                const rdx = rbx - rox;
                const rdy = rby - roy;
                const rmax = Math.sqrt(rdx * rdx + rdy * rdy);
                const d = rs.castRay(rox, roy, rdx, rdy, 0, rmin, rmax) * rmax;

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

                const nPad = Math.round(d / density);
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

    Hooks.on("canvasInit", () => {
        canvas._pv_raySystem = new RaySystem();
    });
});

export class RaySystem {
    static round(x) {
        return Math.round(x * 256) * (1 / 256);
    }

    constructor() {
        this.A = {};
        this.n = 0;
        this.D = null;
        this.E = null;
        this.K = null;
        this.S = null;
        this.Ct = null;
        this.Ci = null;
        this.rmin = NaN;
        this.rmax = NaN;
    }

    addArea(id, fov, los = undefined, limit = Infinity, layer = 0, index = 0) {
        if (!(fov instanceof TransformedShape)) {
            fov = new TransformedShape(fov);
        }

        if (los && !(los instanceof TransformedShape)) {
            los = new TransformedShape(los);
        }

        const createData = fov => {
            if (!fov) {
                return;
            }

            const shape = fov.shape;

            let data;

            if (shape.type === PIXI.SHAPES.CIRC || shape.type === PIXI.SHAPES.ELIP) {
                data = shape.matrix?.clone().invert() ?? new PIXI.Matrix();

                data.translate(-shape.x, -shape.y);

                if (shape.type === PIXI.SHAPES.CIRC) {
                    data.scale(1 / shape.radius, 1 / shape.radius);
                } else {
                    data.scale(1 / shape.width, 1 / shape.height);
                }
            } else {
                data = fov.generateContour();

                for (let i = 0; i < data.length; i++) {
                    data[i] = RaySystem.round(data[i]);
                }

                console.assert(data.length !== 0);
            }

            return data;
        }

        const bounds = fov.bounds.clone();

        if (los) {
            bounds.fit(los.bounds);
        }

        bounds.ceil();

        this.A[id] = { fov: createData(fov), los: createData(los), bounds, limit, layer, index };
    }

    deleteArea(id) {
        delete this.A[id];
    }

    reset() {
        this.A = {};
    }

    update() {
        const A = Object.entries(this.A)
            .sort(([id1, a1], [id2, a2]) => a1.layer - a2.layer || a1.index - a2.index || id1.localeCompare(id2, "en"))
            .map(e => e[1]);

        let n = 0;
        let m = 0;

        for (const a of A) {
            const p1 = a.fov;
            const p2 = a.los;
            const m1 = p1.length;
            const m2 = p2 ? p2.length : 0;

            m += 4;
            m += m1 !== undefined ? m1 : 6;
            m += m2;

            n++;
        }

        this.n = n;

        if (n === 0) {
            this.D = null;
            this.E = null;
            this.K = null;
            this.S = null;
            this.Ct = null;
            this.Ci = null;
            this.rmin = NaN;
            this.rmax = NaN;

            return;
        }

        const D = this.D = new Float32Array(new ArrayBuffer(n * 13 + m * 4), 0, n);
        const E = this.E = new Float32Array(D.buffer, D.byteOffset + D.byteLength, m);
        const K = this.K = new Uint32Array(E.buffer, E.byteOffset + E.byteLength, n * 2);
        this.S = new Uint8Array(K.buffer, K.byteOffset + K.byteLength, n);
        this.Ct = this.Ct ?? new Float64Array(8);
        this.Ci = this.Ci ?? new Int32Array(this.Ct.buffer);

        let i = 0;
        let k = 0;
        let rmin = Infinity;
        let rmax = 0;

        for (const a of A) {
            const p1 = a.fov;
            const p2 = a.los;
            const m1 = p1.length;
            const m2 = p2 ? p2.length : 0;
            const d = a.limit;

            rmin = Math.min(rmin, d);
            rmax = Math.max(rmax, d);

            D[i] = 1 / d;
            K[(i << 1)] = m1 !== undefined ? m1 : 1;
            K[(i << 1) + 1] = m2;

            const b = a.bounds;

            E[k++] = b.left;
            E[k++] = b.right;
            E[k++] = b.top;
            E[k++] = b.bottom;

            if (m1 !== undefined) {
                for (let j = 0; j < m1;) {
                    E[k++] = p1[j++];
                    E[k++] = p1[j++];
                }
            } else {
                E[k++] = p1.a;
                E[k++] = p1.b;
                E[k++] = p1.c;
                E[k++] = p1.d;
                E[k++] = p1.tx;
                E[k++] = p1.ty;
            }

            for (let j = 0; j < m2;) {
                E[k++] = p2[j++];
                E[k++] = p2[j++];
            }

            i++;
        }

        this.rmin = Math.min(rmin, rmax);
        this.rmax = rmax;
    }

    get uniformlyLimited() {
        return this.rmin === this.rmax;
    }

    // TODO: return limits for all four quadrants
    estimateRayLimits(rax, ray, rmin = 0, rmax = Infinity) {
        const { n, D, E, K } = this;

        rmax = Math.min(rmax, this.rmax);

        const xmin = rax - rmax;
        const xmax = rax + rmax;
        const ymin = ray - rmax;
        const ymax = ray + rmax;

        let dmin = Infinity;
        let dmax = 0;

        for (let i = 0, k = 0; i < n; i++) {
            const x1 = E[k++];
            const x2 = E[k++];
            const y1 = E[k++];
            const y2 = E[k++];

            if (x1 < xmax && x2 > xmin && y1 < ymax && y2 > ymin) {
                const d = D[i];

                dmin = Math.min(dmin, d);
                dmax = Math.max(dmax, d);
            }

            k += K[i << 1] + K[(i << 1) + 1];
        }

        const lmax = Math.min(rmin + Math.round(1 / dmin), rmax);
        const lmin = Math.min(rmin + Math.round(1 / dmax), lmax);

        return [lmin, lmax];
    }

    // if rmax is passed, it must be equal to sqrt(rdx * rdx + rdy * rdy)
    castRay(rax, ray, rdx, rdy, rdz = 0, rmin = 0, rmax) {
        const { n, D, E, K, S } = this;
        let { Ct, Ci } = this;
        const rpx = 1 / rdx;
        const rpy = 1 / rdy;

        let c = 0;

        for (let i = 0, k = 0; i < n; i++) {
            const i1 = i << 1;
            const m1 = K[i1];
            const m2 = K[i1 + 1];

            let s = (m2 !== 0) << 1 | 1;

            if (m1 > 16 || m1 === 1 || m2 !== 0) {
                const tx1 = (E[k++] - rax) * rpx;
                const tx2 = (E[k++] - rax) * rpx;

                let tmin = Math.min(tx1, tx2);
                let tmax = Math.max(tx1, tx2);

                const ty1 = (E[k++] - ray) * rpy;
                const ty2 = (E[k++] - ray) * rpy;

                tmin = Math.max(tmin, Math.min(ty1, ty2));
                tmax = Math.min(tmax, Math.max(ty1, ty2));

                if (tmin >= 1 || tmax <= Math.max(0, tmin)) {
                    k += (m1 !== 1 ? m1 : 6) + m2;
                    S[i] = s;

                    continue;
                }
            } else {
                k += 4;
            }

            for (let j = 1; j <= 2; j++) {
                let m = K[i1 + j - 1];

                if (m === 0) {
                    continue;
                }

                if (m !== 1) {
                    let eax = E[k + m - 2];
                    let eay = E[k + m - 1];

                    do {
                        const ebx = E[k++];
                        const eby = E[k++];

                        const edx = ebx - eax;
                        const edy = eby - eay;
                        const q = rdx * edy - rdy * edx;

                        while (q !== 0) {
                            const dax = eax - rax;
                            const day = eay - ray;
                            const u = (dax * rdy - day * rdx) / q;

                            if (u < 0 || u > 1 || u === 0 && q > 0 || u === 1 && q < 0) {
                                break;
                            }

                            const t = (dax * edy - day * edx) / q;

                            if (t <= 0) {
                                break;
                            }

                            s ^= j;

                            if (t < 1) {
                                Ci[(c << 2) + 1] = i << 2 | j;
                                Ct[Ci[c << 2] = (c << 1) + 1] = t;

                                c++;

                                if (c << 1 === Ct.length) {
                                    const ct = Ct;

                                    Ct = this.Ct = new Float64Array(Ct.length << 1);
                                    Ci = this.Ci = new Int32Array(Ct.buffer);

                                    Ct.set(ct);
                                }
                            }

                            break;
                        }

                        eax = ebx;
                        eay = eby;
                    } while ((m -= 2) !== 0);
                } else {
                    let t1, t2;

                    {
                        const ea = E[k++];
                        const eb = E[k++];
                        const ec = E[k++];
                        const ed = E[k++];
                        const ex = E[k++];
                        const ey = E[k++];

                        const x = ea * rax + ec * ray + ex;
                        const y = eb * rax + ed * ray + ey;
                        const dx = ea * rdx + ec * rdy;
                        const dy = eb * rdx + ed * rdy;
                        const a = dx * dx + dy * dy;
                        const b = dx * x + dy * y;
                        const c = x * x + y * y - 1;

                        if (c !== 0) {
                            const d = b * b - a * c;

                            if (d <= 0) {
                                continue;
                            }

                            const f = Math.sqrt(d);

                            if (b !== 0) {
                                t1 = (-b - Math.sign(b) * f) / a;
                                t2 = c / (a * t1);
                            } else {
                                t1 = f / a;
                                t2 = -t1;
                            }
                        } else {
                            t1 = 0;
                            t2 = -b / a;
                        }
                    }

                    if (t1 > 0) {
                        s ^= j;

                        if (t1 < 1) {
                            Ci[(c << 2) + 1] = i << 2 | j;
                            Ct[Ci[c << 2] = (c << 1) + 1] = t1;

                            c++;

                            if (c << 1 === Ct.length) {
                                const ct = Ct;

                                Ct = this.Ct = new Float64Array(Ct.length << 1);
                                Ci = this.Ci = new Int32Array(Ct.buffer);

                                Ct.set(ct);
                            }
                        }
                    }

                    if (t2 > 0) {
                        s ^= j;

                        if (t2 < 1) {
                            Ci[(c << 2) + 1] = i << 2 | j;
                            Ct[Ci[c << 2] = (c << 1) + 1] = t2;

                            c++;

                            if (c << 1 === Ct.length) {
                                const ct = Ct;

                                Ct = this.Ct = new Float64Array(Ct.length << 1);
                                Ci = this.Ci = new Int32Array(Ct.buffer);

                                Ct.set(ct);
                            }
                        }
                    }
                }
            }

            S[i] = s;
        }

        for (let h = c - 2; h >= 0; h--) {
            const j = (h << 1) + 1;
            const t = Ct[j];

            let k = h;

            for (; ;) {
                const kl = (k << 1) + 1;

                if (kl >= c) {
                    break;
                }

                const kr = k + 1 << 1;

                if (kr >= c) {
                    const jl = Ci[kl << 2];
                    const tl = Ct[jl];

                    if (t > tl) {
                        Ci[k << 2] = jl;
                        k = kl;
                    }

                    break;
                }

                const jl = Ci[kl << 2];
                const jr = Ci[kr << 2];
                const tl = Ct[jl];
                const tr = Ct[jr];

                if (tl <= tr) {
                    if (t <= tl) {
                        break;
                    }

                    Ci[k << 2] = jl;
                    k = kl;
                } else {
                    if (t <= tr) {
                        break;
                    }

                    Ci[k << 2] = jr;
                    k = kr;
                }
            }

            Ci[k << 2] = j;
        }

        let w0 = 1 / (rmax ?? Math.sqrt(rdx * rdx + rdy * rdy));

        const tmin = w0 * rmin;
        const dmul = rdz !== 0 ? Math.sqrt((w0 * rdz) * (w0 * rdz) + 1) : 1;

        let i0 = n;

        while (--i0 >= 0 && S[i0] !== 0);

        let d0 = i0 >= 0 ? D[i0] * dmul : Infinity;
        let t0 = 0;

        if (c !== 0) {
            trace: for (; ;) {
                const j = Ci[0];
                const t = Ct[j];
                const is = Ci[(j - 1 << 1) + 1];
                const i = is >> 2;
                const s = S[i] ^= is & 3;

                for (; ;) {
                    if (s === 0) {
                        if (i0 < i) {
                            i0 = i;
                        } else {
                            break;
                        }
                    } else if (i0 === i) {
                        while (--i0 >= 0 && S[i0] !== 0);
                    } else {
                        break;
                    }

                    const dt = t - Math.max(t0, tmin);
                    const w = dt > 0 ? w0 - dt * d0 : w0;

                    if (w <= 0) {
                        break trace;
                    }

                    t0 = t;
                    w0 = w;
                    d0 = i0 >= 0 ? D[i0] * dmul : 0;

                    break;
                }

                if (--c !== 0) {
                    const j = Ci[c << 2];
                    const t = Ct[j];

                    let k = 0;

                    for (; ;) {
                        const kl = (k << 1) + 1;

                        if (kl >= c) {
                            break;
                        }

                        const kr = k + 1 << 1;

                        if (kr >= c) {
                            const jl = Ci[kl << 2];
                            const tl = Ct[jl];

                            if (t > tl) {
                                Ci[k << 2] = jl;
                                k = kl;
                            }

                            break;
                        }

                        const jl = Ci[kl << 2];
                        const jr = Ci[kr << 2];
                        const tl = Ct[jl];
                        const tr = Ct[jr];

                        if (tl <= tr) {
                            if (t <= tl) {
                                break;
                            }

                            Ci[k << 2] = jl;
                            k = kl;
                        } else {
                            if (t <= tr) {
                                break;
                            }

                            Ci[k << 2] = jr;
                            k = kr;
                        }
                    }

                    Ci[k << 2] = j;
                } else {
                    break trace;
                }
            }
        }

        if (d0 !== 0) {
            t0 = Math.min(Math.max(t0, tmin) + w0 / d0, 1);
        } else {
            t0 = 1;
        }

        return t0;
    }

    // TODO
    visualize(clear = true) {
        const { ax, ay, dx, dy, t } = this;
        const bx = ax + t * dx;
        const by = ay + t * dy;
        const cx = bx + (1 - t) * dx;
        const cy = by + (1 - t) * dy;

        const dg = canvas.controls.debug;

        if (clear) {
            dg.clear();
        }

        dg.lineStyle(2, 0x00FF00, 1.0).moveTo(ax, ay).lineTo(bx, by);
        dg.lineStyle(2, 0xFF0000, 1.0).moveTo(bx, by).lineTo(cx, cy);
        dg.lineStyle(1, 0x000000).beginFill(0x0000FF).drawCircle(bx, by, 6).endFill();
    }
}
