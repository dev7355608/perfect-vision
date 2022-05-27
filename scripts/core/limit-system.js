import { Region } from "../utils/region.js";

export class LimitSystem {
    static instance = new LimitSystem();

    regions = {};
    dirty = false;
    n = 0;
    D = null;
    E = null;
    R = null;
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
        let r = 0;
        let m = 0;

        for (const region of regions) {
            if (!region.active) {
                continue;
            }

            let shape = false;
            let mask = false;

            for (const contour of region.contours) {
                if (contour.mask) {
                    mask = true;
                } else {
                    shape = true;
                }
            }

            if (!shape || !mask && region.mask) {
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

            for (const { points: p } of region.contours) {
                r++;
                m += 4 + (p.length || 6);
            }

            n++;
        }

        this.n = n;

        if (n === 0) {
            this.D = null;
            this.E = null;
            this.R = null;
            this.K = null;
            this.S = null;
            this.Ct = null;
            this.Ci = null;
            this.lmin = Infinity;
            this.lmax = Infinity;
            this.dirty = false;

            return true;
        }

        const D = this.D = new Float32Array(new ArrayBuffer(n * (4 + 4 + 1) + m * 4 + r * 4), 0, n);
        const E = this.E = new Float32Array(D.buffer, D.byteOffset + D.byteLength, m);
        const R = this.R = new Uint32Array(E.buffer, E.byteOffset + E.byteLength, n);
        const K = this.K = new Uint32Array(R.buffer, R.byteOffset + R.byteLength, r);
        const S = this.S = new Uint8Array(K.buffer, K.byteOffset + K.byteLength, n);
        this.Ct = this.Ct ?? new Float64Array(8);
        this.Ci = this.Ci ?? new Int32Array(this.Ct.buffer);

        let i = 0;
        let k = 0;
        let l = 0;
        let dmin = Infinity;
        let dmax = 0;
        let dadd = 0;

        for (const region of regions) {
            if (!region.active) {
                continue;
            }

            let shape = false;
            let mask = false;

            for (const contour of region.contours) {
                if (contour.mask) {
                    mask = true;
                } else {
                    shape = true;
                }
            }

            if (!shape || !mask && region.mask) {
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
            R[i] = 0;

            for (const { points: p, bounds: b, mask: j } of region.contours) {
                const m = p.length || 0;

                K[l++] = m + j;

                E[k++] = b.left;
                E[k++] = b.right;
                E[k++] = b.top;
                E[k++] = b.bottom;

                if (m !== 0) {
                    for (let h = 0; h < m;) {
                        E[k++] = p[h++];
                        E[k++] = p[h++];
                    }
                } else {
                    E[k++] = p.a;
                    E[k++] = p.b;
                    E[k++] = p.c;
                    E[k++] = p.d;
                    E[k++] = p.tx;
                    E[k++] = p.ty;
                }

                R[i] += 2;
                R[i] |= j;
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

    estimateRayLimits(xmin, ymin, xmax, ymax, rmin = 0, rmax = Infinity) {
        let { lmin, lmax } = this;

        if (lmin < lmax) {
            const { n, D, E, R, K, S } = this;

            let dmin = Infinity;
            let dmax = 0;
            let dadd = 0;

            for (let i = 0, k = 0, l = 0; i < n; i++) {
                for (const r = l + (R[i] >> 1); l < r; l++) {
                    const mj = K[l];

                    if ((mj & 1) === 0) {
                        const x1 = E[k++];
                        const x2 = E[k++];
                        const y1 = E[k++];
                        const y2 = E[k++];

                        if (x1 < xmax && x2 > xmin && y1 < ymax && y2 > ymin) {
                            const d = D[i];

                            if (S[i] >> 2 === 0) {
                                dadd += d;
                            } else {
                                dmin = Math.min(dmin, d);
                                dmax = Math.max(dmax, d);
                            }
                        }
                    } else {
                        k += 4;
                    }

                    k += (mj & ~1) || 6;
                }
            }

            lmax = Math.min(rmin + Math.round(1 / Math.min(dmin, dmax)), rmin + lmax, rmax);
            lmin = Math.min(rmin + (dadd === 0 ? Math.round(1 / dmax) : Math.floor(1 / (dmax + dadd))), lmax);
        } else {
            lmin = lmax = Math.min(rmin + lmax, rmax);
        }

        return [lmin, lmax];
    }

    castRay(rax, ray, rdx, rdy, rdz = 0, rmin = 0) {
        rax = Math.round(rax * 256) * (1 / 256);
        ray = Math.round(ray * 256) * (1 / 256);
        rdx = Math.round(rdx * 256) * (1 / 256);
        rdy = Math.round(rdy * 256) * (1 / 256);
        rdz = Math.round(rdz * 256) * (1 / 256);

        let rmax;

        if (rdx === 0 && rdy === 0) {
            rdx = rdy = 1;
            rmax = 0;
        }

        const { n, D, E, R, K, S } = this;
        let { Ct, Ci } = this;
        const rpx = 1 / rdx;
        const rpy = 1 / rdy;

        let c = 0;

        for (let i = 0, k = 0, l = 0; i < n; i++) {
            let s = (R[i] & 1) << 1 | 1;

            outer: for (const r = l + (R[i] >> 1); l < r; l++) {
                let m = K[l];
                const j = 1 << (m & 1);

                m = m & ~1;

                if (m > 16 || m === 0) {
                    const tx1 = (E[k++] - rax) * rpx;
                    const tx2 = (E[k++] - rax) * rpx;

                    let tmin = Math.min(tx1, tx2);
                    let tmax = Math.max(tx1, tx2);

                    const ty1 = (E[k++] - ray) * rpy;
                    const ty2 = (E[k++] - ray) * rpy;

                    tmin = Math.max(tmin, Math.min(ty1, ty2));
                    tmax = Math.min(tmax, Math.max(ty1, ty2));

                    if (tmin >= 1 || tmax <= Math.max(0, tmin)) {
                        k += m || 6;

                        continue outer;
                    }
                } else {
                    k += 4;
                }

                if (m !== 0) {
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
                const w = dt > 0 ? w0 - dt * Math.min(d0, 256) : w0;

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
}

class LimitSystemRegion {
    contours = [];
    shape;
    mask = null;
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
            if (typeof shape[Symbol.iterator] === "function") {
                shape = Array.from(shape);
            } else {
                shape = [shape];
            }

            for (let i = 0; i < shape.length; i++) {
                shape[i] = Region.from(shape[i]);
            }

            if (shape.length > 1) {
                shape = Array.from(new Set(shape));
            }

            if (this.shape?.length !== shape.length || this.shape.some(r => shape.indexOf(r) < 0)) {
                this.shape = shape;
                this._updateContours(false);
                changed = true;
            }
        }

        if ("mask" in changes) {
            if (mask && typeof mask[Symbol.iterator] === "function") {
                mask = Array.from(mask);
            } else if (mask) {
                mask = [mask];
            } else {
                mask = null;
            }

            if (mask) {
                for (let i = 0; i < mask.length; i++) {
                    mask[i] = Region.from(mask[i]);
                }

                if (mask.length > 1) {
                    mask = Array.from(new Set(mask));
                }
            }

            if (this.mask?.length !== mask?.length || this.shape?.some(r => shape.indexOf(r) < 0)) {
                this.mask = mask;
                this._updateContours(true);
                changed = true;
            }
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

    _updateContours(mask) {
        const regions = mask ? this.mask : this.shape;

        for (let i = this.contours.length - 1; i >= 0; i--) {
            if (this.contours[i].mask === mask) {
                this.contours[i] = this.contours[this.contours.length - 1];
                this.contours.length--;
            }
        }

        for (const region of regions) {
            const shape = region.shape;
            let points;

            if (shape.type === PIXI.SHAPES.CIRC || shape.type === PIXI.SHAPES.ELIP) {
                points = region.transform?.clone().invert() ?? new PIXI.Matrix();
                points.translate(-shape.x, -shape.y);

                if (shape.type === PIXI.SHAPES.CIRC) {
                    if (!(shape.radius > 0)) {
                        continue;
                    }

                    points.scale(1 / shape.radius, 1 / shape.radius);
                } else {
                    if (!(shape.width > 0 && shape.height > 0)) {
                        continue;
                    }

                    points.scale(1 / shape.width, 1 / shape.height);
                }
            } else {
                points = Array.from(region.contour);

                for (let i = 0; i < points.length; i++) {
                    points[i] = Math.round(points[i] * 256) * (1 / 256);
                }

                if (points.length < 6) {
                    continue;
                }
            }

            const bounds = region.bounds.clone();

            if (bounds.width > 0 && bounds.height > 0) {
                bounds.ceil(256, 0);
                this.contours.push({ points, bounds, mask });
            }
        }
    }
}
