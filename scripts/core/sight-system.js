const clipper = new ClipperLib.Clipper();

export class SightSystem extends PIXI.utils.EventEmitter {
    static get instance() {
        if (!this._instance) {
            this._instance = new SightSystem();
        }

        return this._instance;
    }

    _worker;
    _nextId = 0;
    _visionId = 0;
    _vision;
    _exploredId = 0;
    _explored;

    constructor() {
        super();

        this._worker = new Worker("modules/perfect-vision/scripts/core/sight-system-worker.js");
        this._worker.onmessage = this._onMessage.bind(this);
        this._vision = this._explored = new SightPolygons([]);
    }

    get vision() {
        return this._vision;
    }

    get explored() {
        return this._explored;
    }

    get destroyed() {
        return !this._worker;
    }

    destroy() {
        this._worker.terminate();
        this._worker = null;
    }

    reset() {
        this._vision = this._explored = new SightPolygons([]);
        this._visionId = this._exploredId = ++this._nextId;
        this._worker.postMessage({ type: "reset", id: this._visionId });
        this.emit("vision");
        this.emit("explored");
    }

    updateVision(fov, los, explored = false) {
        this._vision = null;
        this._worker.postMessage({ type: "update", id: ++this._nextId, fov, los, explored });
    }

    testVisibility(polygon, tolerance) {
        return this._vision?.testVisibility(polygon, tolerance);
    }

    _onMessage(event) {
        const { type, id, paths } = event.data;

        switch (type) {
            case "vision":
                const updateVision = this._visionId < id && !!paths;

                if (updateVision) {
                    this._visionId = id;
                    this._vision = new SightPolygons(paths);
                    this.emit("vision");
                }

                break;
            case "explored":
                const updateExplored = this._exploredId < id && !!paths;

                if (updateExplored) {
                    this._exploredId = id;
                    this._explored = new SightPolygons(paths);
                    this.emit("explored");
                }

                break;
        }
    }
}

class SightPolygon extends PIXI.Polygon {
    _path;
    _bounds;
    _area;

    constructor(path) {
        const n = path.length;
        const points = new Array(n << 1);

        for (let i = 0; i < n; i++) {
            const point = path[i];

            points[(i << 1)] = point.X / 256;
            points[(i << 1) + 1] = point.Y / 256;
        }

        super(points);

        this._path = path;
    }

    get bounds() {
        if (this._bounds) {
            return this._bounds;
        }

        const points = this.points;
        const m = points.length;

        let minX = points[0];
        let minY = points[1];
        let maxX = minX;
        let maxY = minY;

        for (let j = 2; j < m; j += 2) {
            const x = points[j];
            const y = points[j + 1];

            if (minX > x) {
                minX = x;
            } else if (maxX < x) {
                maxX = x;
            }

            if (minY > y) {
                minY = y;
            } else if (maxY < y) {
                maxY = y;
            }
        }

        return this._bounds = new NormalizedRectangle(minX, minY, maxX - minX, maxY - minY);
    }

    get area() {
        if (this._area === undefined) {
            this._area = ClipperLib.Clipper.Area(this._path) / (256 * 256);
        }

        return this._area;
    }

    get orientation() {
        return this.area >= 0;
    }

    get winding() {
        return this.orientation ? +1 : - 1;
    }

    contains(x, y) {
        return this.bounds.contains(x, y) && super.contains(x, y);
    }

    test(x, y, radius) {
        const c = this.contains(x, y);

        if (radius > 0) {
            const r2 = radius * radius;
            const points = this.points;
            const m = points.length;

            for (let i = 0, x1 = points[m - 2], y1 = points[m - 1]; i < m; i += 2) {
                const x2 = points[i];
                const y2 = points[i + 1];

                const dx = x - x1;
                const dy = y - y1;
                const nx = x2 - x1;
                const ny = y2 - y1;
                const t = Math.min(Math.max((dx * nx + dy * ny) / (nx * nx + ny * ny), 0), 1);
                const x3 = t * nx - dx;
                const y3 = t * ny - dy;

                if (x3 * x3 + y3 * y3 < r2) {
                    return c ? 1 : 2;
                }

                x1 = x2;
                y1 = y2;
            }
        }

        return c ? 0 : 3;
    }
}

class SightPolygons {
    _polygons;
    _paths;
    _quadtree;

    constructor(paths) {
        this._polygons = paths.map(p => new SightPolygon(p));
        this._paths = paths;
    }

    get(rect) {
        if (rect && this._polygons.length) {
            let quadtree = this._quadtree;

            if (!quadtree) {
                const polygons = this._polygons;
                const n = polygons.length;
                const { x, y, width, height } = polygons[0].bounds;

                let minX = x;
                let minY = y;
                let maxX = x + width;
                let maxY = y + height;

                for (let i = 1; i < n; i++) {
                    const { x, y, width, height } = polygons[i].bounds;

                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x + width);
                    maxY = Math.max(maxY, y + height);
                }

                quadtree = this._quadtree = new Quadtree(new NormalizedRectangle(minX, minY, maxX - minX, maxY - minY));

                for (let i = 0; i < n; i++) {
                    const polygon = polygons[i];

                    polygon.r = polygon.bounds;
                    polygon.t = polygon;

                    quadtree.insert(polygon);
                }
            }

            return Array.from(quadtree.getObjects(rect).values());
        }

        return this._polygons;
    }

    testVisibility(polygon, tolerance = 0) {
        const { x, y } = polygon.origin;
        const radius = polygon.radius ?? 0;
        const bounds = radius > 0 ? new NormalizedRectangle(x - radius, y - radius, radius * 2, radius * 2) : undefined;
        const polygons = this.get(bounds);

        let p = 0;
        let c = 0;
        let r = radius;

        for (const polygon of polygons) {
            const t = polygon.test(x, y, r);
            const w = polygon.winding;

            switch (t) {
                case 0:
                    p += w;
                    c += w;
                    break;
                case 1:
                    p += w;
                case 2:
                    r = 0;
            }
        }

        if (p !== 0) {
            return true;
        }

        if (r > 0 && c === 0) {
            return false;
        }

        if (!(radius > 0)) {
            return false;
        }

        let path;
        const points = polygon.points;

        if (!points) {
            const n = Math.ceil(Math.sqrt(radius));

            path = new Array(n * 4);

            let i1 = 0;
            let i2 = n * 2 + 1;
            let i3 = i2;
            let i4 = n * 4;

            {
                const x1 = Math.round((x + radius) * 256);
                const x2 = Math.round((x - radius) * 256);
                const y1 = Math.round(y * 256);

                path[i1++] = new ClipperLib.IntPoint(x1, y1);
                path[--i2] = new ClipperLib.IntPoint(x2, y1);
            }

            while (i1 < n) {
                const a = Math.PI / 2 * (i1 / n);
                const dx = Math.cos(a) * radius;
                const dy = Math.sin(a) * radius;
                const x1 = Math.round((x + dx) * 256);
                const x2 = Math.round((x - dx) * 256);
                const y1 = Math.round((y + dy) * 256);
                const y2 = Math.round((y - dy) * 256);

                path[i1++] = new ClipperLib.IntPoint(x1, y1);
                path[--i2] = new ClipperLib.IntPoint(x2, y1);
                path[i3++] = new ClipperLib.IntPoint(x2, y2);
                path[--i4] = new ClipperLib.IntPoint(x1, y2);
            }

            {
                const x1 = Math.round(x * 256);
                const y1 = Math.round((y + radius) * 256);
                const y2 = Math.round((y - radius) * 256);

                path[i1++] = new ClipperLib.IntPoint(x1, y1);
                path[--i4] = new ClipperLib.IntPoint(x1, y2);
            }
        } else {
            const m = points.length;

            if (m < 6) {
                return false;
            }

            path = new Array(m / 2);

            for (let j = 0; j < m; j += 2) {
                const x = Math.round(points[j] * 256);
                const y = Math.round(points[j + 1] * 256);

                path[j >> 1] = new ClipperLib.IntPoint(x, y);
            }
        }

        const paths = polygons.map(p => p._path);

        clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
        clipper.AddPath(path, ClipperLib.PolyType.ptClip, true);
        clipper.Execute(ClipperLib.ClipType.ctIntersection, paths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
        clipper.Clear();

        let area = 0;

        for (let i = 0, n = paths.length; i < n; i++) {
            area += ClipperLib.Clipper.Area(ClipperLib.Clipper.CleanPolygon(paths[i], Math.SQRT2 * 256));
        }

        return area > tolerance * (256 * 256);
    }

    toString() {
        let string = "";

        for (const path of this._paths) {
            if (string) {
                string += ",";
            }

            const n = path.length;

            for (let i = 0; i < n; i++) {
                const point = path[i];

                string += vlq.encode(point.X);
                string += vlq.encode(point.Y);
            }
        }

        return string;
    }

    static fromString(string) {
        const paths = [];

        for (const points of string.split(",").map(vlq.decode)) {
            const m = points.length;
            const path = new Array(m / 2);

            for (let j = 0; j < m; j += 2) {
                path[j >> 1] = new ClipperLib.IntPoint(points[j], points[j + 1]);
            }

            paths.push(path);
        }

        return new SightPolygons(paths);
    }
}
