import { Region } from "../utils/region.js";

export class LimitSystem {
    static instance = new LimitSystem();

    static round(x) {
        return Math.round(x * 256) * (1 / 256);
    }

    regions = {};
    dirty = false;
    n = 0;
    D = null;
    E = null;
    K = null;
    S = null;
    Ct = null;
    Ci = null;
    lmin = Infinity;
    lmax = Infinity;

    addRegion(id, options) {
        const region = this.regions[id] = new LimitSystemRegion(options);

        this.dirty = true;

        return region;
    }

    updateRegion(id, changes) {
        const region = this.regions[id];

        if (region?._update(changes)) {
            this.dirty = true;

            return true;
        }

        return false;
    }

    deleteRegion(id) {
        const deleted = id in this.regions;

        delete this.regions[id];

        if (deleted) {
            this.dirty = true;
        }

        return deleted;
    }

    hasRegion(id) {
        return id in this.regions;
    }

    getRegion(id) {
        return this.regions[id];
    }

    reset() {
        this.regions = {};
        this.dirty = true;
    }

    update() {
        if (!this.dirty) {
            return false;
        }

        const regions = Object.entries(this.regions)
            .sort(([id1, { index: index1 }], [id2, { index: index2 }]) => {
                let d = 0;

                for (let i = 0, n = Math.min(index1.length, index2.length); d === 0 && i < n; i++) {
                    d = index1[i] - index2[i];
                }

                return d || index1.length - index2.length || id1.localeCompare(id2, "en");
            }).map(e => e[1]);

        let n = 0;
        let m = 0;

        for (const region of regions) {
            if (!region.active) {
                continue;
            }

            const p1 = region._shape;
            const p2 = region._mask;
            const m1 = p1.length;
            const m2 = p2 ? p2.length : 0;

            if (m1 === 0 || p2?.length === 0) {
                continue;
            }

            switch (region.mode) {
                case "sum":
                case "min":
                    if (region.limit === Infinity) {
                        continue;
                    }

                    break;
                case "max":
                    if (region.limit === 0) {
                        continue;
                    }

                    break;
            }

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
            this.lmin = Infinity;
            this.lmax = Infinity;

            return;
        }

        const D = this.D = new Float32Array(new ArrayBuffer(n * 13 + m * 4), 0, n);
        const E = this.E = new Float32Array(D.buffer, D.byteOffset + D.byteLength, m);
        const K = this.K = new Uint32Array(E.buffer, E.byteOffset + E.byteLength, n * 2);
        const S = this.S = new Uint8Array(K.buffer, K.byteOffset + K.byteLength, n);
        this.Ct = this.Ct ?? new Float64Array(8);
        this.Ci = this.Ci ?? new Int32Array(this.Ct.buffer);

        let i = 0;
        let k = 0;
        let dmin = Infinity;
        let dmax = 0;
        let dadd = 0;

        for (const region of regions) {
            if (!region.active) {
                continue;
            }

            const p1 = region._shape;
            const p2 = region._mask;
            const m1 = p1.length;
            const m2 = p2 ? p2.length : 0;

            if (m1 === 0 || p2?.length === 0) {
                continue;
            }

            switch (region.mode) {
                case "sum":
                case "min":
                    if (region.limit === Infinity) {
                        continue;
                    }

                    break;
                case "max":
                    if (region.limit === 0) {
                        continue;
                    }

                    break;
            }

            const d = 1 / region.limit;

            switch (region.mode) {
                case "sum":
                    dadd += d;
                    break;
                default:
                    dmin = Math.min(dmin, d);
                    dmax = Math.max(dmax, d);
            }

            let s = 0;

            switch (region.mode) {
                case "sum":
                    s = 0;
                    break;
                case "set":
                    s = 1;
                    break;
                case "min":
                    s = 2;
                    break;
                case "max":
                    s = 3;
                    break;
            }

            D[i] = d;
            S[i] = s << 2;
            K[(i << 1)] = m1 !== undefined ? m1 : 1;
            K[(i << 1) + 1] = m2;

            const b = region.bounds;

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

        this.lmax = Math.round(1 / Math.min(dmin, dmax));
        this.lmin = dadd === 0 ? Math.round(1 / dmax) : Math.floor(1 / (dmax + dadd));
        this.dirty = false;

        return true;
    }

    get uniformlyLimited() {
        return this.lmin === this.lmax;
    }

    // TODO: return limits for all four quadrants
    estimateRayLimitsUnsafe(rax, ray, rmin = 0, rmax = Infinity) {
        const { n, D, E, K, S } = this;

        rmax = Math.min(rmax, rmin + this.lmax);

        const xmin = rax - rmax;
        const xmax = rax + rmax;
        const ymin = ray - rmax;
        const ymax = ray + rmax;

        let dmin = Infinity;
        let dmax = 0;
        let dadd = 0;

        for (let i = 0, k = 0; i < n; i++) {
            const x1 = E[k++];
            const x2 = E[k++];
            const y1 = E[k++];
            const y2 = E[k++];

            if (x1 < xmax && x2 > xmin && y1 < ymax && y2 > ymin) {
                const d = D[i];

                switch (S[i] >> 2) {
                    case 0:
                        dadd += d;
                        break;
                    default:
                        dmin = Math.min(dmin, d);
                        dmax = Math.max(dmax, d);
                }
            }

            const i1 = i << 1;
            const m1 = K[i1];
            const m2 = K[i1 + 1];

            k += (m1 !== 1 ? m1 : 6) + m2;
        }

        const lmax = Math.min(rmin + Math.round(1 / Math.min(dmin, dmax)), rmax);
        const lmin = Math.min(rmin + (dadd === 0 ? Math.round(1 / dmax) : Math.floor(1 / (dmax + dadd))), lmax);

        return [lmin, lmax];
    }

    estimateRayLimits(rax, ray, rmin = 0, rmax = Infinity) {
        rax = LimitSystem.round(rax);
        ray = LimitSystem.round(ray);
        rmin = Math.max(rmin, 0);
        rmax = Math.max(rmax, 0);

        return this.estimateRayLimitsUnsafe(rax, ray, rmin, rmax);
    }

    // if rmax is passed, it must be equal to sqrt(rdx * rdx + rdy * rdy)
    castRayUnsafe(rax, ray, rdx, rdy, rdz = 0, rmin = 0, rmax) {
        if (rdx === 0 && rdy === 0) {
            rdx = rdy = 1;
            rmax = 0;
        }

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
                    S[i] = S[i] & ~3 | s;

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

            S[i] = S[i] & ~3 | s;
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

        let i0 = n;

        while (--i0 >= 0 && (S[i0] & 3) !== 0);

        let t0 = 0;
        let d0 = 0;

        for (let i = 0; i <= i0; i++) {
            const s = S[i];

            if ((s & 3) !== 0) {
                continue;
            }

            switch (s >> 2) {
                case 0:
                    d0 += D[i];
                    break;
                case 1:
                    d0 = D[i];
                    break;
                case 2:
                    d0 = Math.max(d0, D[i]);
                    break;
                case 3:
                    d0 = Math.min(d0, D[i]);
                    break;
            }
        }

        rmax = rmax ?? Math.sqrt(rdx * rdx + rdy * rdy);

        if (rmax === 0) {
            return rdz !== 0 ? Math.min((rmin + 1 / d0) / Math.abs(rdz), 1) : 1;
        }

        let w0 = 1 / rmax;
        const tmin = w0 * rmin;
        const dmax = w0 / (1 / 256 / rmax);
        const dmul = rdz !== 0 ? Math.sqrt((w0 * rdz) * (w0 * rdz) + 1) : 1;

        d0 *= dmul;

        if (c !== 0) {
            for (; ;) {
                const j = Ci[0];
                const t = Ct[j];
                const is = Ci[(j - 1 << 1) + 1];
                const i = is >> 2;
                const s = S[i] ^= is & 3;

                if ((s & 3) === 0) {
                    if (i0 < i) {
                        i0 = i;
                    }
                } else if (i0 === i) {
                    while (--i0 >= 0 && (S[i0] & 3) !== 0);
                }

                const dt = t - Math.max(t0, tmin);
                const w = w0 - dt * Math.min(d0, dmax);

                if (w <= 0) {
                    break;
                }

                t0 = t;
                w0 = w;
                d0 = 0;

                for (let i = 0; i <= i0; i++) {
                    const s = S[i];

                    if ((s & 3) !== 0) {
                        continue;
                    }

                    switch (s >> 2) {
                        case 0:
                            d0 += D[i];
                            break;
                        case 1:
                            d0 = D[i];
                            break;
                        case 2:
                            d0 = Math.max(d0, D[i]);
                            break;
                        case 3:
                            d0 = Math.min(d0, D[i]);
                            break;
                    }
                }

                d0 *= dmul;

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
                    break;
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

    castRay(rax, ray, rdx, rdy, rdz = 0, rmin = 0) {
        rax = LimitSystem.round(rax);
        ray = LimitSystem.round(ray);
        rdx = LimitSystem.round(rdx);
        rdy = LimitSystem.round(rdy);
        rdz = LimitSystem.round(rdz);
        rmin = Math.max(rmin, 0);

        return this.castRayUnsafe(rax, ray, rdx, rdy, rdz, rmin);
    }
}

class LimitSystemRegion {
    shape;
    _shape;
    mask;
    _mask;
    bounds;
    limit;
    mode;
    index;
    active;

    constructor({ shape, mask, limit, mode, index, active }) {
        this._update({ shape, mask, limit, mode, index, active });
    }

    _update(changes) {
        let { shape, mask, limit, mode, index, active } = changes;
        let changed = false;

        if ("shape" in changes) {
            shape = Region.from(shape);

            if (this.shape !== shape) {
                this.shape = shape;
                this._shape = this.constructor._processRegion(shape);
                changed = true;
            }
        }

        if ("mask" in changes) {
            mask = mask ? Region.from(mask) : null;

            if (this.mask !== mask) {
                this.mask = mask;
                this._mask = this.constructor._processRegion(mask);
                changed = true;
            }
        }

        if (shape !== undefined || mask !== undefined) {
            this.bounds = this.shape.bounds.clone();

            if (this.mask) {
                this.bounds.fit(this.mask.bounds);
            }

            this.bounds.ceil();
        }

        if ("limit" in changes) {
            limit = Math.round(Math.max(limit ?? Infinity, 0));

            if (this.limit !== limit) {
                this.limit = limit;
                changed = true;
            }
        }

        if ("mode" in changes) {
            mode = mode ?? "sum";

            if (this.mode !== mode) {
                this.mode = mode;
                changed = true;
            }
        }

        if ("index" in changes) {
            index = index?.map(x => Number(x)) ?? [];

            if (this.index?.length !== index.length || this.index.some((v, i) => index[i] !== v)) {
                this.index = index;
                changed = true;
            }
        }

        if ("active" in changes) {
            active = !!(active ?? true);

            if (this.active !== active) {
                this.active = active;
                changed = true;
            }
        }

        return changed;
    }

    static _processRegion(region) {
        if (!region) {
            return null;
        }

        const shape = region.shape;
        let data;

        if (shape.type === PIXI.SHAPES.CIRC || shape.type === PIXI.SHAPES.ELIP) {
            data = region.transform?.clone().invert() ?? new PIXI.Matrix();
            data.translate(-shape.x, -shape.y);

            if (shape.type === PIXI.SHAPES.CIRC) {
                data.scale(1 / shape.radius, 1 / shape.radius);
            } else {
                data.scale(1 / shape.width, 1 / shape.height);
            }
        } else {
            data = Array.from(region.contour);

            for (let i = 0; i < data.length; i++) {
                data[i] = LimitSystem.round(data[i]);
            }

            if (data.length < 3) {
                data.length = 0;
            }
        }

        return data;
    }
}
