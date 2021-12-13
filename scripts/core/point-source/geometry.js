import { PointSourceMesh } from "./mesh.js";
import { TransformedShape } from "../../utils/transformed-shape.js";

export class PointSourceGeometry extends PIXI.Geometry {
    static EMPTY = new PointSourceGeometry(new TransformedShape(new PIXI.Polygon())).retain();

    constructor(fov, los, inset = 0) {
        super();

        this.fov = fov ?? null;
        this.los = los ?? null;
        this.inset = inset;
        this.bounds = null;
        this.segments = null;
        this.drawCalls = null;
        this.drawMode = PIXI.DRAW_MODES.TRIANGLES;

        this._calculateBounds();
        this._buildGeometry();
    }

    _calculateBounds() {
        const { fov, los } = this;

        if (fov && los) {
            this.bounds = fov.bounds.clone().fit(los.bounds);
        } else {
            this.bounds = (fov ?? los).bounds.clone();
        }
    }

    _buildGeometry() {
        const vertices = [];
        const indices = [];

        const fovBounds = this.fov?.bounds;
        const losBounds = this.los?.bounds;

        const fovPoints = fovBounds?.width > 0 && fovBounds.height > 0 ? this.fov.generateContour() : null;
        const losPoints = losBounds?.width > 0 && losBounds.height > 0 ? this.los.generateContour() : null;

        const s = this.segments = {};

        s.fov = this._addInterior(fovPoints, vertices, indices);
        s.los = this._addInterior(losPoints, vertices, indices);

        s.bounds = {};
        s.bounds.fov = this._addBounds(fovBounds, vertices, indices);

        s.edges = {};
        s.edges.fov = this._addEdges(fovPoints, vertices, indices);
        s.edges.los = this._addEdges(losPoints, vertices, indices);

        if (s.edges.fov || s.edges.los) {
            s.edges.start = (s.edges.fov ?? s.edges.los).start;
            s.edges.size = (s.edges.fov?.size ?? 0) + (s.edges.los?.size ?? 0);
        }

        s.bounds.los = this._addBounds(losBounds, vertices, indices);

        if (s.fov) {
            this.drawCalls = [
                s.fov,
                s.los,
                s.edges,
                { start: s.bounds.fov.start, size: s.bounds.fov.size + s.edges.size }
            ];
        } else if (s.los) {
            this.drawCalls = [
                s.los,
                s.fov,
                s.edges,
                { start: s.edges.start, size: s.edges.size + s.bounds.los.size }
            ];
        }

        if (s.fov && s.los) {
            this.drawCalls.fov = [
                s.fov,
                undefined,
                s.edges.fov,
                { start: s.bounds.fov.start, size: s.bounds.fov.size + s.edges.fov.size }
            ];
            this.drawCalls.los = [
                s.los,
                undefined,
                s.edges.los,
                { start: s.edges.los.start, size: s.edges.los.size + s.bounds.los.size }
            ];
        } else if (s.fov) {
            this.drawCalls.fov = this.drawCalls;
            this.drawCalls.los = undefined;
        } else if (s.los) {
            this.drawCalls.fov = undefined;
            this.drawCalls.los = this.drawCalls;
        }

        // TODO: different data type for aVertexDepth?
        const buffer = new PIXI.Buffer(new Float32Array(vertices), true, false);

        this.addAttribute("aVertexPosition", buffer, 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aVertexDepth", buffer, 1, false, PIXI.TYPES.FLOAT)
            .addIndex(new PIXI.Buffer(new (vertices.length > 0x3FFFC ? Uint32Array : Uint16Array)(indices), true, true));
    }

    _addInterior(points, vertices, indices) {
        if (!points) {
            return;
        }

        const m = points.length;

        if (m === 0) {
            return;
        }

        const start = indices.length;
        const first = vertices.length / 3;

        for (let i = 0; i < m; i += 2) {
            vertices.push(points[i], points[i + 1], +1);
        }

        const triangles = PIXI.utils.earcut(points);
        const size = triangles.length;

        for (let i = 0; i < size; i++) {
            indices.push(first + triangles[i]);
        }

        return { start, size };
    }

    _addEdges(points, vertices, indices) {
        if (!points) {
            return;
        }

        const m = points.length;

        if (m === 0) {
            return;
        }

        const r = this.inset;
        const a = Math.acos(1 - Math.min(0.25 / r, 1));

        const start = indices.length;
        const first = vertices.length / 3;
        let j = first;

        for (let i = 0, x0 = points[m - 4], y0 = points[m - 3], x1 = points[m - 2], y1 = points[m - 1],
            dx01 = x1 - x0, dy01 = y1 - y0, dd01 = Math.sqrt(dx01 * dx01 + dy01 * dy01), nx01 = -dy01 / dd01, ny01 = dx01 / dd01; i < m; i += 2) {
            const x2 = points[i];
            const y2 = points[i + 1];
            const dx12 = x2 - x1;
            const dy12 = y2 - y1;
            const dd12 = Math.sqrt(dx12 * dx12 + dy12 * dy12);
            const nx12 = -dy12 / dd12;
            const ny12 = dx12 / dd12;

            let k = j + 1;

            vertices.push(x1, y1, -1, x1 + nx01 * r, y1 + ny01 * r, +1);
            indices.push(j - 1, j, k++);

            if (nx01 * ny12 < ny01 * nx12) {
                let a1 = Math.atan2(ny01, nx01);
                let a2 = Math.atan2(ny12, nx12);

                if (a2 > a1) {
                    a2 -= Math.PI * 2;
                }

                const o = Math.max(Math.ceil((a1 - a2) / a), 1);

                indices.push(j, k - 1, k);

                for (let l = 1; l < o; l++) {
                    const t = (a1 * (o - l) + a2 * l) / o;

                    vertices.push(x1 + Math.cos(t) * r, y1 + Math.sin(t) * r, +1);
                    indices.push(j, k, ++k);
                }
            }

            vertices.push(x1 + nx12 * r, y1 + ny12 * r, +1);
            indices.push(k, j, ++k);

            j = k;
            x1 = x2;
            y1 = y2;
            nx01 = nx12;
            ny01 = ny12;
        }

        const end = indices.length;
        const last = j - 1;

        indices[end - 1] = first;
        indices[start] = last;

        return { start, size: end - start };
    }

    _addBounds(bounds, vertices, indices) {
        if (!bounds) {
            return;
        }

        const start = indices.length;
        const first = vertices.length / 3;
        const { x, y, width, height } = bounds;
        const x1 = x;
        const x2 = x1 + width;
        const y1 = y;
        const y2 = y1 + height;

        vertices.push(x1, y1, +1, x2, y1, +1, x2, y2, +1, x1, y2, +1);
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);

        return { start, size: 6 };
    }

    containsPoint(point) {
        if (!this.bounds.contains(point.x, point.y)) {
            return false;
        }

        if (this.fov && !this.fov.containsPoint(point)) {
            return false;
        }

        if (this.los && !this.los.containsPoint(point)) {
            return false;
        }

        return true;
    }

    createMesh(shader, state) {
        return new PointSourceMesh(this, shader, state);
    }

    retain() {
        this.refCount++;

        return this;
    }

    release() {
        this.refCount--;

        if (this.refCount === 0) {
            this.dispose();
        }

        return this;
    }

    destroy(options) {
        super.destroy(options);

        this.fov = null;
        this.los = null;
        this.bounds = null;
        this.segments = null;
        this.drawCalls = null;
        this.drawMode = null;
        this.inset = null;
    }
}
