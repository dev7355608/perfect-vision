export class Shape {
    /**
     * The resolution (precision).
     * @type {number}
     * @readonly
     */
    static RESOLUTION = 256;

    /**
     * Create from PIXI shape.
     * @param {PIXI.Rectangle|PIXI.RoundedRectangle|PIXI.Circle|PIXI.Ellipse|PIXI.Polygon} shape - The shape.
     * @param {PIXI.Matrix} [transform] - The transform.
     * @returns {Shape}
     */
    static from(shape, transform) {
        if (shape instanceof Shape) {
            if (transform && shape.transform) {
                transform = transform.clone().append(shape.transform);
            } else {
                transform = transform ?? shape.transform;
            }

            if (!transform) {
                return shape;
            }

            shape = shape.shape;
        }

        return new this(shape, transform);
    }

    /**
     * Create from Clipper path.
     * @param {{X: number, Y: number}[]} path - The Clipper path.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {Shape}
     */
    static fromClipper(path, resolution = Shape.RESOLUTION) {
        return this.from(this.createPolygonFromClipper(path, resolution));
    }

    /**
     * The shape.
     * @type {PIXI.Rectangle|PIXI.RoundedRectangle|PIXI.Circle|PIXI.Ellipse|PIXI.Polygon}
     * @readonly
     */
    shape;

    /**
     * The transform.
     * @type {PIXI.Matrix}
     * @readonly
     */
    transform;

    /**
     * The bounds.
     * @type {PIXI.Rectangle}
     */
    #bounds;

    /**
     * The contour.
     * @type {number[]}
     */
    #contour;

    /**
     * The area.
     * @type {number}
     */
    #area;

    /**
     * Not simple (`0`), weakly simple (`1`), or strictly simple (`2`).
     * @type {0|1|2}
     */
    #simple;

    /**
     * @param {PIXI.Rectangle|PIXI.RoundedRectangle|PIXI.Circle|PIXI.Ellipse|PIXI.Polygon} shape - The shape.
     * @param {PIXI.Matrix} [transform] - The transform.
     */
    constructor(shape, transform) {
        const originalShape = shape;

        {
            const type = shape.type;

            if (type === PIXI.SHAPES.RECT || type === PIXI.SHAPES.RREC) {
                if (shape.width < 0 || shape.height < 0) {
                    shape = new PIXI.Rectangle(shape.x, shape.y, Math.max(shape.width, 0), Math.max(shape.height, 0));
                }
            } else if (type === PIXI.SHAPES.ELIP) {
                if (shape.width < 0 || shape.height < 0) {
                    shape = new PIXI.Ellipse(shape.x, shape.y, Math.max(shape.width, 0), Math.max(shape.height, 0));
                }
            } else if (type === PIXI.SHAPES.CIRC) {
                if (shape.radius < 0) {
                    shape = new PIXI.Circle(shape.x, shape.y, 0);
                }
            }
        }

        {
            const type = shape.type;

            if (transform && type !== PIXI.SHAPES.POLY) {
                const { a, b, c, d, tx, ty } = transform;
                const bc0 = Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4;

                if (bc0 || Math.abs(a) < 1e-4 && Math.abs(d) < 1e-4) {
                    if (type === PIXI.SHAPES.RECT) {
                        shape = new PIXI.Rectangle(shape.x, shape.y, shape.width, shape.height);
                        transform = null;
                    } else if (type === PIXI.SHAPES.RREC) {
                        if (bc0 && a === d || !bc0 && b === c) {
                            shape = new PIXI.RoundedRectangle(shape.x, shape.y, shape.width, shape.height, shape.radius);
                            transform = null;
                        }
                    } else if (type === PIXI.SHAPES.CIRC) {
                        shape = new PIXI.Ellipse(shape.x, shape.y, shape.radius, shape.radius);
                        transform = null;
                    } else if (type === PIXI.SHAPES.ELIP) {
                        shape = new PIXI.Ellipse(shape.x, shape.y, shape.width, shape.height);
                        transform = null;
                    }

                    if (!transform) {
                        const { x, y, width, height } = shape;

                        if (bc0) {
                            shape.x = x * a + tx;
                            shape.y = y * d + ty;
                            shape.width = width * a;
                            shape.height = height * d;
                        } else {
                            shape.x = y * c + tx;
                            shape.y = x * b + ty;
                            shape.width = height * c;
                            shape.height = width * b;
                        }

                        if (shape.type === PIXI.SHAPES.RECT || shape.type === PIXI.SHAPES.RREC) {
                            const x = shape.width >= 0 ? shape.x : shape.x + shape.width;
                            const y = shape.height >= 0 ? shape.y : shape.y + shape.height;

                            shape.x = x;
                            shape.y = y;
                        }

                        shape.width = Math.abs(shape.width);
                        shape.height = Math.abs(shape.height);
                    }
                } else if (Math.abs(a * b + c * d) < 1e-4) {
                    if (type === PIXI.SHAPES.CIRC) {
                        const radius = shape.radius;

                        shape = new PIXI.Ellipse(shape.x, shape.y, radius, radius);
                        transform = null;
                    } else if (type === PIXI.SHAPES.ELIP) {
                        if (shape.width === shape.height) {
                            const radius = shape.width;

                            shape = new PIXI.Ellipse(shape.x, shape.y, radius, radius);
                            transform = null;
                        }
                    } else if (type === PIXI.SHAPES.RREC) {
                        const { width, height } = shape;

                        if (shape.radius >= Math.max(width, height) / 2) {
                            const radius = Math.min(width, height) / 2;

                            shape = new PIXI.Ellipse(shape.x + width / 2, shape.y + height / 2, radius, radius);
                            transform = null;
                        }
                    }

                    if (!transform) {
                        const { x, y } = shape;
                        const radius = shape.width;

                        shape.x = x * a + y * c + tx;
                        shape.y = x * b + y * d + ty;
                        shape.width = radius * Math.sqrt(a * a + c * c);
                        shape.height = radius * Math.sqrt(b * b + d * d);
                    }
                }
            }
        }

        {
            const type = shape.type;

            if (type === PIXI.SHAPES.RREC) {
                const { width, height } = shape;
                const radius = Math.min(shape.radius, Math.min(width, height) / 2);

                if (radius <= 0) {
                    shape = new PIXI.Rectangle(shape.x, shape.y, width, height);
                } else if (radius === Math.max(width, height) / 2) {
                    shape = new PIXI.Circle(shape.x + width / 2, shape.y + height / 2, radius);
                } else if (radius !== shape.radius) {
                    shape = new PIXI.RoundedRectangle(shape.x, shape.y, width, height, radius);
                }

                this.#simple = 2;
            } else if (type === PIXI.SHAPES.ELIP) {
                const { width, height } = shape;

                if (width === height) {
                    shape = new PIXI.Circle(shape.x, shape.y, width);
                }

                this.#simple = 2;
            } else if (type === PIXI.SHAPES.POLY) {
                shape = new PIXI.Polygon(Array.from(shape.points));

                if (transform) {
                    const points = shape.points;
                    const m = points.length;
                    const { a, b, c, d, tx, ty } = transform;

                    for (let i = 0; i < m; i += 2) {
                        const x = points[i];
                        const y = points[i + 1];

                        points[i] = a * x + c * y + tx;
                        points[i + 1] = b * x + d * y + ty;
                    }

                    transform = null;
                }
            } else if (type === PIXI.SHAPES.RECT) {
                if (transform) {
                    const x1 = shape.x;
                    const y1 = shape.y
                    const x2 = x1 + shape.width;
                    const y2 = y1 + shape.height;

                    shape = new PIXI.Polygon(x1, y1, x2, y1, x2, y2, x1, y2);

                    const points = shape.points;
                    const { a, b, c, d, tx, ty } = transform;

                    for (let i = 0; i < 8; i += 2) {
                        const x = points[i];
                        const y = points[i + 1];

                        points[i] = a * x + c * y + tx;
                        points[i + 1] = b * x + d * y + ty;
                    }

                    transform = null;
                } else {
                    this.#simple = 2;
                }
            } else {
                this.#simple = 2;
            }
        }

        if (shape.type === PIXI.SHAPES.POLY) {
            const points = shape.points;

            Shape.roundPolygon(points);
            Shape.dedupePolygon(points);
            Shape.cleanPolygon(points);

            let m = points.length;
            let area = 0;

            for (let i = 0, x1 = points[m - 2], y1 = points[m - 1]; i < m; i += 2) {
                const x2 = points[i];
                const y2 = points[i + 1];

                area += (x2 - x1) * (y2 + y1);

                x1 = x2;
                y1 = y2;
            }

            this.#area = Math.abs(area) / 2;

            if (area === 0) {
                points.length = 0;
            } else if (area > 0) {
                const n = m / 2;

                for (let i = n + n % 2; i < m; i += 2) {
                    const j1 = m - i - 2;
                    const j2 = m - i - 1;
                    const j3 = i;
                    const j4 = i + 1;

                    [points[j1], points[j3]] = [points[j3], points[j1]];
                    [points[j2], points[j4]] = [points[j4], points[j2]];
                }
            }
        }

        if (shape === originalShape) {
            const type = shape.type;

            if (type === PIXI.SHAPES.RECT) {
                shape = new PIXI.Rectangle(shape.x, shape.y, shape.width, shape.height);
            } else if (type === PIXI.SHAPES.RREC) {
                shape = new PIXI.RoundedRectangle(shape.x, shape.y, shape.width, shape.height, shape.radius);
            } else if (type === PIXI.SHAPES.CIRC) {
                shape = new PIXI.Circle(shape.x, shape.y, shape.radius);
            } else { // PIXI.SHAPES.ELIP
                shape = new PIXI.Ellipse(shape.x, shape.y, shape.width, shape.height);
            }
        }

        this.shape = shape;
        this.transform = transform ? transform.clone() : null;
    }

    /**
     * Convert to Clipper path.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {{X: number, Y: number}[]}
     */
    toClipper(resolution = Shape.RESOLUTION) {
        return Shape.createClipperPathFromPolygon(this.contour, resolution);
    }

    /**
     * The bounds.
     * @type {PIXI.Rectangle}
     * @readonly
     */
    get bounds() {
        let bounds = this.#bounds;

        if (!bounds) {
            bounds = this.#bounds = this.#computeBounds();
        }

        return bounds;
    }

    /**
     * The contour.
     * @type {number[]}
     * @readonly
     */
    get contour() {
        let contour = this.#contour;

        if (!contour) {
            contour = this.#contour = this.#generateContour();
        }

        return contour;
    }

    /**
     * The area.
     * @type {number}
     * @readonly
     */
    get area() {
        this.contour;

        return this.#area;
    }

    /**
     * Is weakly simple?
     * @type {boolean}
     * @readonly
     */
    get weaklySimple() {
        if (this.#simple === undefined) {
            this.#simple = Shape.#isSimplePolygon(this.contour);
        }

        return this.#simple >= 1;
    }

    /**
     * Is strictly simple?
     * @type {boolean}
     * @readonly
     */
    get strictlySimple() {
        if (this.#simple === undefined) {
            this.#simple = Shape.#isSimplePolygon(this.contour);
        }

        return this.#simple === 2;
    }

    /**
     * Test whether the point is contained this shape.
     * @param {{x: number, y: number}} point - The point.
     * @returns {boolean} True if and only if the point is contained.
     */
    containsPoint(point) {
        const shape = this.shape;
        let transform;
        let { x, y } = point;

        if (shape.type === PIXI.SHAPES.POLY) {
            if (!this.bounds.contains(x, y)) {
                return false;
            }
        } else if (transform = this.transform) {
            const { a, b, c, d, tx, ty } = transform;
            const id = a * d - b * c;
            const x2 = x - tx;
            const y2 = y - ty;

            x = (d * x2 - c * y2) / id;
            y = (a * y2 - b * x2) / id;
        }

        return shape.contains(x, y);
    }

    /**
     * Test whether the circle is contained this shape.
     * @param {{x: number, y: number}} point - The center point of the circle.
     * @param {number} [radius=0] - The radius of the circle.
     * @returns {boolean} True if and only if the circle is contained.
     */
    containsCircle(point, radius) {
        if (!(radius > 0)) {
            return this.containsPoint(point);
        }

        const shape = this.shape;
        const type = shape.type;
        let { x, y } = point;
        const radius2 = radius * radius;

        if (this.transform || type === PIXI.SHAPES.POLY || type === PIXI.SHAPES.ELIP || type === PIXI.SHAPES.RREC) {
            const bounds = this.bounds;
            const xmin = bounds.x;
            const ymin = bounds.y;
            const xmax = xmin + bounds.width;
            const ymax = ymin + bounds.height;

            if (x < xmin + radius || x > xmax - radius || y < ymin + radius || y > ymax - radius) {
                return false;
            }

            if (type === PIXI.SHAPES.POLY) {
                if (!shape.contains(x, y)) {
                    return false;
                }
            } else {
                if (!this.containsPoint(point)) {
                    return false;
                }
            }

            const points = shape.points ?? this.contour;
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

                if (x3 * x3 + y3 * y3 < radius2) {
                    return false;
                }

                x1 = x2;
                y1 = y2;
            }

            return true;
        }

        if (type === PIXI.SHAPES.RECT) {
            const xmin = shape.x;
            const ymin = shape.y;
            const xmax = xmin + shape.width;
            const ymax = ymin + shape.height;

            return x >= xmin + radius && x <= xmax - radius && y >= ymin + radius && y <= ymax - radius;
        } else { // type === PIXI.SHAPES.CIRC
            const dx = x - shape.x;
            const dy = y - shape.y;
            const r = shape.radius;

            if (r < radius) {
                return false;
            }

            return dx * dx + dy * dy <= radius2 + (r - 2 * radius) * r;
        }
    }

    /**
     * Test whether the circle intersects this shape.
     * @param {{x: number, y: number}} point - The center point of the circle.
     * @param {number} [radius=0] - The radius of the circle.
     * @returns {boolean} True if and only if the circle intersects.
     */
    intersectsCircle(point, radius) {
        if (!(radius > 0)) {
            return this.containsPoint(point);
        }

        const shape = this.shape;
        const type = shape.type;
        let { x, y } = point;
        const radius2 = radius * radius;

        if (this.transform || type === PIXI.SHAPES.POLY || type === PIXI.SHAPES.ELIP || type === PIXI.SHAPES.RREC) {
            const bounds = this.bounds;
            const xmin = bounds.x;
            const ymin = bounds.y;
            const xmax = xmin + bounds.width;
            const ymax = ymin + bounds.height;

            if (x <= xmin - radius || x >= xmax + radius || y <= ymin - radius || y >= ymax + radius) {
                return false;
            }

            if (type === PIXI.SHAPES.POLY) {
                if (bounds.contains(x, y) && shape.contains(x, y)) {
                    return true;
                }
            } else {
                if (this.containsPoint(point)) {
                    return true;
                }
            }

            const points = shape.points ?? this.contour;
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

                if (x3 * x3 + y3 * y3 < radius2) {
                    return true;
                }

                x1 = x2;
                y1 = y2;
            }

            return false;
        }

        if (type === PIXI.SHAPES.RECT) {
            const xmin = shape.x;
            const ymin = shape.y;
            const xmax = xmin + shape.width;
            const ymax = ymin + shape.height;

            if (x <= xmin - radius || x >= xmax + radius || y <= ymin - radius || y >= ymax + radius) {
                return false;
            }

            let x1;
            let y1;

            if (x < xmin) {
                if (y < ymin) {
                    x1 = xmin;
                    y1 = ymin;
                } else if (y > ymax) {
                    x1 = xmin;
                    y1 = ymax;
                } else {
                    return true;
                }
            } else if (x > xmax) {
                if (y < ymin) {
                    x1 = xmax;
                    y1 = ymin;
                } else if (y > ymax) {
                    x1 = xmax;
                    y1 = ymax;
                } else {
                    return true;
                }
            } else {
                return true;
            }

            const dx = x - x1;
            const dy = y - y1;

            return dx * dx + dy * dy < radius2;
        } else { // type === PIXI.SHAPES.CIRC
            const dx = x - shape.x;
            const dy = y - shape.y;
            const r = shape.radius;

            return dx * dx + dy * dy < radius2 + (r + 2 * radius) * r;
        }
    }

    /**
     * Test whether the line segment is contained this shape.
     * @param {{x: number, y: number}} point1 - The first point of the line segment.
     * @param {{x: number, y: number}} point2 - The second point of the line segment.
     * @returns {boolean} True if and only if the line segment is contained.
     */
    containsLineSegment(point1, point2) {
        const shape = this.shape;

        if (!(this.containsPoint(point1) && this.containsPoint(point2))) {
            return false;
        }

        if (shape.type !== PIXI.SHAPES.POLY) {
            return true;
        }

        const ax = point1.x;
        const ay = point1.y;
        const bx = point2.x;
        const by = point2.y;
        const points = shape.points;
        const m = points.length;

        for (let i = 0, x1 = points[m - 2], y1 = points[m - 1], d1 = (ay - y1) * (bx - x1) - (ax - x1) * (by - y1); i < m; i += 2) {
            const x2 = points[i];
            const y2 = points[i + 1];
            const d2 = (ay - y2) * (bx - x2) - (ax - x2) * (by - y2);

            if ((d1 !== 0 || d2 !== 0) && d1 * d2 <= 0) {
                const d3 = (y1 - ay) * (x2 - ax) - (x1 - ax) * (y2 - ay);
                const d4 = (y1 - by) * (x2 - bx) - (x1 - bx) * (y2 - by);

                if (d3 * d4 <= 0) {
                    return false;
                }
            }

            x1 = x2;
            y1 = y2;
            d1 = d2;
        }

        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;

        return shape.contains(mx, my);
    }

    /**
     * Test whether the line segment intersects this shape.
     * @param {{x: number, y: number}} point1 - The first point of the line segment.
     * @param {{x: number, y: number}} point2 - The second point of the line segment.
     * @returns {boolean} True if and only if the line segment intersects.
     */
    intersectsLineSegment(point1, point2) {
        const { left, right, top, bottom } = this.bounds;
        const ax = point1.x;
        const ay = point1.y;
        const bx = point2.x;
        const by = point2.y;

        const dx = 1 / (bx - ax);
        const tx1 = (left - ax) * dx;
        const tx2 = (right - ax) * dx;

        let tmin = Math.min(tx1, tx2);
        let tmax = Math.max(tx1, tx2);

        const dy = 1 / (by - ay);
        const ty1 = (top - ay) * dy;
        const ty2 = (bottom - ay) * dy;

        tmin = Math.max(tmin, Math.min(ty1, ty2));
        tmax = Math.min(tmax, Math.max(ty1, ty2));

        if (tmin >= 1 || tmax <= Math.max(0, tmin)) {
            return false;
        }

        if (this.containsPoint(point1) || this.containsPoint(point2)) {
            return true;
        }

        const points = this.contour;
        const m = points.length;

        for (let i = 0, x1 = points[m - 2], y1 = points[m - 1], d1 = (ay - y1) * (bx - x1) - (ax - x1) * (by - y1); i < m; i += 2) {
            const x2 = points[i];
            const y2 = points[i + 1];
            const d2 = (ay - y2) * (bx - x2) - (ax - x2) * (by - y2);

            if ((d1 !== 0 || d2 !== 0) && d1 * d2 <= 0) {
                const d3 = (y1 - ay) * (x2 - ax) - (x1 - ax) * (y2 - ay);
                const d4 = (y1 - by) * (x2 - bx) - (x1 - bx) * (y2 - by);

                if (d3 * d4 <= 0) {
                    return true;
                }
            }

            x1 = x2;
            y1 = y2;
            d1 = d2;
        }

        return false;
    }

    /**
     * Compute the bounds.
     * @returns {PIXI.Rectangle} The computed bounds.
     */
    #computeBounds() {
        const shape = this.shape;
        const type = shape.type;
        const transform = this.transform;
        const bounds = new PIXI.Rectangle();

        if (type === PIXI.SHAPES.POLY) {
            const points = shape.points;
            const m = points.length;

            if (m >= 6) {
                let minX = points[0];
                let minY = points[1];
                let maxX = minX;
                let maxY = minY;

                for (let i = 2; i < m; i += 2) {
                    const x = points[i];
                    const y = points[i + 1];

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

                bounds.x = minX;
                bounds.y = minY;
                bounds.width = maxX - minX;
                bounds.height = maxY - minY;
            }
        } else {
            if (!transform) {
                if (type === PIXI.SHAPES.RECT) {
                    bounds.copyFrom(shape);
                } else if (type === PIXI.SHAPES.RREC) {
                    bounds.x = shape.x;
                    bounds.y = shape.y;
                    bounds.width = shape.width;
                    bounds.height = shape.height;
                } else if (type === PIXI.SHAPES.CIRC) {
                    const radius = shape.radius;

                    bounds.x = shape.x - radius;
                    bounds.y = shape.y - radius;
                    bounds.width = radius * 2;
                    bounds.height = radius * 2;
                } else { // type === PIXI.SHAPES.ELIP
                    const { width, height } = shape;

                    bounds.x = shape.x - width;
                    bounds.y = shape.y - height;
                    bounds.width = width * 2;
                    bounds.height = height * 2;
                }
            } else {
                const { a, b, c, d, tx, ty } = transform;

                if (shape.type === PIXI.SHAPES.RREC) {
                    const radius = shape.radius;

                    const s = Math.atan2(c, a);
                    const t = Math.atan2(d, b);
                    const w = Math.abs(a * Math.cos(s) + c * Math.sin(s)) * radius;
                    const h = Math.abs(b * Math.cos(t) + d * Math.sin(t)) * radius;

                    const x1 = shape.x + radius;
                    const y1 = shape.y + radius;
                    const x2 = x1 + shape.width - radius * 2;
                    const y2 = y1 + shape.height - radius * 2;

                    const ltx = a * x1 + c * y1;
                    const lty = b * x1 + d * y1;
                    const lbx = a * x1 + c * y2;
                    const lby = b * x1 + d * y2;
                    const rtx = a * x2 + c * y1;
                    const rty = b * x2 + d * y1;
                    const rbx = a * x2 + c * y2;
                    const rby = b * x2 + d * y2;

                    const minX = Math.min(ltx, lbx, rtx, rbx) - w;
                    const minY = Math.min(lty, lby, rty, rby) - h;
                    const maxX = Math.max(ltx, lbx, rtx, rbx) + w;
                    const maxY = Math.max(lty, lby, rty, rby) + h;

                    bounds.x = minX + tx;
                    bounds.y = minY + ty;
                    bounds.width = maxX - minX;
                    bounds.height = maxY - minY;
                } else { // shape.type === PIXI.SHAPES.CIRC || type === PIXI.SHAPES.ELIP
                    const { x, y } = shape;
                    let rx, ry;

                    if (type === PIXI.SHAPES.CIRC) {
                        rx = ry = shape.radius;
                    } else {
                        rx = shape.width;
                        ry = shape.height;
                    }

                    const s = Math.atan2(c * ry, a * rx);
                    const t = Math.atan2(d * ry, b * rx);
                    const w = Math.abs(a * rx * Math.cos(s) + c * ry * Math.sin(s));
                    const h = Math.abs(b * rx * Math.cos(t) + d * ry * Math.sin(t));

                    bounds.x = a * x + c * y + tx - w;
                    bounds.y = b * x + d * y + ty - h;
                    bounds.width = w * 2;
                    bounds.height = h * 2;
                }
            }
        }

        const resolution = Shape.RESOLUTION;

        bounds.x = Math.floor(bounds.x * resolution) / resolution;
        bounds.y = Math.floor(bounds.y * resolution) / resolution;
        bounds.width = Math.ceil((bounds.x + bounds.width) * resolution) / resolution - bounds.x;
        bounds.height = Math.ceil((bounds.y + bounds.height) * resolution) / resolution - bounds.y;

        return bounds;
    }

    /**
     * Generate the contour.
     * @returns {number[]} The generated contour.
     */
    #generateContour() {
        const shape = this.shape;
        const type = shape.type;

        if (type === PIXI.SHAPES.RECT) {
            const resolution = Shape.RESOLUTION;
            const x0 = Math.round(shape.x * resolution) / resolution;
            const y0 = Math.round(shape.y * resolution) / resolution;
            const w = Math.round((shape.x + shape.width) * resolution) / resolution - x0;
            const h = Math.round((shape.y + shape.height) * resolution) / resolution - y0;
            const x1 = x0 + w;
            const y1 = y0 + h;

            let points;

            if (w > 0 && h > 0) {
                points = new Array(8);
                points[0] = points[6] = x0;
                points[1] = points[3] = y0;
                points[2] = points[4] = x1;
                points[5] = points[7] = y1;
            } else {
                points = [];
            }

            this.#area = w * h;

            return points;
        }

        if (type === PIXI.SHAPES.POLY) {
            return shape.points;
        }

        const transform = this.transform;

        let x, y;
        let dx, dy;
        let rx, ry;

        if (shape.type === PIXI.SHAPES.RREC) {
            const w = shape.width / 2;
            const h = shape.height / 2;

            x = shape.x + w;
            y = shape.y + h;
            rx = ry = shape.radius;
            dx = w - rx;
            dy = h - ry;
        } else {
            x = shape.x;
            y = shape.y;

            if (shape.type === PIXI.SHAPES.CIRC) {
                rx = ry = shape.radius;
            } else {
                rx = shape.width;
                ry = shape.height;
            }

            dx = 0;
            dy = 0;
        }

        let sx = rx;
        let sy = ry;

        if (transform) {
            const { a, b, c, d } = transform;

            sx *= Math.sqrt(a * a + c * c);
            sy *= Math.sqrt(b * b + d * d);
        }

        if (!(sx >= 0 && sy >= 0 && dx >= 0 && dy >= 0)) {
            this.#area = 0;

            return [];
        }

        const n = Math.ceil(Math.sqrt((sx + sy) / 2));
        let m = n * 8 + (dx ? 4 : 0) + (dy ? 4 : 0);
        const points = new Array(m);

        if (m === 0) {
            this.#area = 0;

            return points;
        }

        if (n === 0) {
            if (dx > 0 && dy > 0) {
                points.length = 8;
                points[0] = points[6] = x + dx;
                points[1] = points[3] = y + dy;
                points[2] = points[4] = x - dx;
                points[5] = points[7] = y - dy;

                this.#area = dx * dy * 4;
            } else {
                points.length = 0;

                this.#area = 0;
            }

            return points;
        }

        let j1 = 0;
        let j2 = n * 4 + (dx ? 2 : 0) + 2;
        let j3 = j2;
        let j4 = m;

        {
            const x0 = dx + rx;
            const y0 = dy;
            const x1 = x + x0;
            const x2 = x - x0;
            const y1 = y + y0;

            points[j1++] = x1;
            points[j1++] = y1;
            points[--j2] = y1;
            points[--j2] = x2;

            if (dy) {
                const y2 = y - y0;

                points[j3++] = x2;
                points[j3++] = y2;
                points[--j4] = y2;
                points[--j4] = x1;
            }
        }

        for (let i = 1; i < n; i++) {
            const a = Math.PI / 2 * (i / n);
            const x0 = dx + Math.cos(a) * rx;
            const y0 = dy + Math.sin(a) * ry;
            const x1 = x + x0;
            const x2 = x - x0;
            const y1 = y + y0;
            const y2 = y - y0;

            points[j1++] = x1;
            points[j1++] = y1;
            points[--j2] = y1;
            points[--j2] = x2;
            points[j3++] = x2;
            points[j3++] = y2;
            points[--j4] = y2;
            points[--j4] = x1;
        }

        {
            const x0 = dx;
            const y0 = dy + ry;
            const x1 = x + x0;
            const x2 = x - x0;
            const y1 = y + y0;
            const y2 = y - y0;

            points[j1++] = x1;
            points[j1++] = y1;
            points[--j4] = y2;
            points[--j4] = x1;

            if (dx) {
                points[j1++] = x2;
                points[j1++] = y1;
                points[--j4] = y2;
                points[--j4] = x2;
            }
        }

        if (transform) {
            const { a, b, c, d, tx, ty } = transform;

            for (let i = 0; i < m; i += 2) {
                const x = points[i];
                const y = points[i + 1];

                points[i] = a * x + c * y + tx;
                points[i + 1] = b * x + d * y + ty;
            }
        }

        Shape.roundPolygon(points);
        Shape.dedupePolygon(points);
        Shape.cleanPolygon(points);

        m = points.length;

        if (m === 0) {
            return points;
        }

        let area = 0;

        for (let i = 0, x1 = points[m - 2], y1 = points[m - 1]; i < m; i += 2) {
            const x2 = points[i];
            const y2 = points[i + 1];

            area += (x2 - x1) * (y2 + y1);

            x1 = x2;
            y1 = y2;
        }

        this.#area = Math.abs(area) / 2;

        if (area === 0) {
            points.length = 0;
        } else if (area > 0) {
            const n = m / 2;

            for (let i = n + n % 2; i < m; i += 2) {
                const j1 = m - i - 2;
                const j2 = m - i - 1;
                const j3 = i;
                const j4 = i + 1;

                [points[j1], points[j3]] = [points[j3], points[j1]];
                [points[j2], points[j4]] = [points[j4], points[j2]];
            }
        }

        return points;
    }

    /**
     * Create polygon from Clipper path.
     * @param {{X: number, Y: number}[]} path - The Clipper path.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {Shape}
     */
    static createPolygonFromClipper(path, resolution = Shape.RESOLUTION) {
        const n = path.length;
        const points = new Array(n << 1);

        resolution = 1 / resolution;

        for (let i = 0; i < n; i++) {
            const point = path[i];

            points[(i << 1)] = point.X * resolution;
            points[(i << 1) + 1] = point.Y * resolution;
        }

        return new PIXI.Polygon(points);
    }

    /**
     * Create polygon from Clipper path.
     * @param {{X: number, Y: number}[]} path - The Clipper path.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {Shape}
     */
    static createClipperPathFromPolygon(path, resolution = Shape.RESOLUTION) {
        const n = path.length;
        const points = new Array(n << 1);

        resolution = 1 / resolution;

        for (let i = 0; i < n; i++) {
            const point = path[i];

            points[(i << 1)] = point.X * resolution;
            points[(i << 1) + 1] = point.Y * resolution;
        }

        return new PIXI.Polygon(points);
    }
    /**
     * Create Clipper path from polygon.
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {{X: number, Y: number}[]}
     */
    static createClipperPathFromPolygon(polygon, resolution = Shape.RESOLUTION) {
        const points = polygon.points ?? polygon;
        const m = points.length;
        const path = new Array(m >> 1);

        for (let i = 0; i < m; i += 2) {
            path[i >> 1] = {
                X: Math.round(points[i] * resolution),
                Y: Math.round(points[i + 1] * resolution)
            };
        }

        return path;
    }
    /**
     * Round the points of the polygon (in-place).
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {PIXI.Polygon|number[]} The input polygon or points.
     */
    static roundPolygon(points, resolution = Shape.RESOLUTION) {
        const polygon = points;

        points = polygon.points ?? points;

        const m = points.length;

        for (let i = 0; i < m; i++) {
            points[i] = Math.round(points[i] * resolution) / resolution;
        }

        return polygon;
    }

    /**
     * Dedupe the points of the polygon (in-place).
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @returns {PIXI.Polygon|number[]} The input polygon or points.
     */
    static dedupePolygon(points) {
        const polygon = points;

        points = polygon.points ?? points;

        while (points.length !== 0 && points[0] === points[points.length - 2] && points[1] === points[points.length - 1]) {
            points.length -= 2;
        }

        let k = 0;

        for (let i = 0, k = 0; i + 2 < points.length; i += 2) {
            const x = points[i];
            const y = points[i + 1];

            if (x === points[i + 2] && y === points[i + 3]) {
                k += 2;
            } else if (k !== 0) {
                points[i - k] = x;
                points[i - k + 1] = y;
            }
        }

        points.length -= k;

        return polygon;
    }

    /**
     * Clean the points of the polygon (in-place).
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @param {number} [resolution=Shape.RESOLUTION] - The resolution.
     * @returns {PIXI.Polygon|number[]} The input polygon or points.
     */
    static cleanPolygon(points, resolution = Shape.RESOLUTION) {
        const polygon = points;

        points = polygon.points ?? points;

        const m = points.length;

        if (m < 6) {
            points.length = 0;

            return points;
        }

        let path = new Array(m / 2);

        for (let j = 0; j < m; j += 2) {
            const x = Math.round(points[j] * resolution);
            const y = Math.round(points[j + 1] * resolution);

            path[j >> 1] = new ClipperLib.IntPoint(x, y);
        }

        path = ClipperLib.Clipper.CleanPolygon(path);

        const n = path.length;

        points.length = n << 1;

        for (let i = 0; i < n; i++) {
            const point = path[i];

            points[(i << 1)] = point.X / resolution;
            points[(i << 1) + 1] = point.Y / resolution;
        }

        return polygon;
    }

    /**
     * Smooth the points of the polygon (in-place).
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @param {number} [factor=0.5] - The smoothing factor.
     * @returns {PIXI.Polygon|number[]} The input polygon or points.
     */
    static smoothPolygon(points, factor = 0.5) {
        const polygon = points;

        points = polygon.points ?? points;

        if (points.length >= 6 && factor !== 0) {
            const first = points.slice(0, 2);
            const last = points.slice(-2);
            const path = points.concat(points.slice(0, 4));

            let previous = first;
            let current = path.slice(2, 4);
            let cp0 = getBezierControlPoints(factor, last, previous, current).next_cp0;

            points.length = 0;
            points.push(first[0], first[1]);

            for (let i = 4; i < path.length; i += 2) {
                const next = [path[i], path[i + 1]];
                const bp = getBezierControlPoints(factor, previous, current, next);
                const cp1 = bp.cp1;

                PIXI.graphicsUtils.BezierUtils.curveTo(cp0.x, cp0.y, cp1.x, cp1.y, current[0], current[1], points);

                previous = current;
                current = next;
                cp0 = bp.next_cp0;
            }

            points.length -= 2;
        }

        return polygon;
    }

    /**
     * Is the polygon weakly simple?
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @returns {boolean} True if and only if the polygon is weakly simple.
     */
    static isWeaklySimplePolygon(points) {
        return this.#isSimplePolygon(points) >= 1;
    }

    /**
     * Is the polygon strictly simple?
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @returns {boolean} True if and only if the polygon is strictly simple.
     */
    static isStrictlySimplePolygon(points) {
        return this.#isSimplePolygon(points) === 2;
    }

    /**
     * Determine whether the polygon is not simple (`0`), weakly simple (`1`), or strictly simple (`2`).
     * @param {PIXI.Polygon|number[]} points - The polygon or points.
     * @returns {0|1|2} Not simple (`0`), weakly simple (`1`), or strictly simple (`2`).
     */
    static #isSimplePolygon(points) {
        points = points instanceof Array ? points : points.points;

        const m = points.length;

        for (let i = 2; i < m; i += 2) {
            const x1 = points[i - 2];
            const y1 = points[i - 1];
            const x2 = points[i];
            const y2 = points[i + 1];

            for (let j = i + 2; j < (i > 2 ? m : m - 2); j += 2) {
                const x3 = points[j];
                const y3 = points[j + 1];
                const x4 = points[(j + 2) % m];
                const y4 = points[(j + 3) % m];

                const d1 = (y1 - y3) * (x2 - x3) - (x1 - x3) * (y2 - y3);
                const d2 = (y1 - y4) * (x2 - x4) - (x1 - x4) * (y2 - y4);

                if (d1 * d2 < 0) {
                    const d3 = (y3 - y1) * (x4 - x1) - (x3 - x1) * (y4 - y1);
                    const d4 = (y3 - y2) * (x4 - x2) - (x3 - x2) * (y4 - y2);

                    if (d3 * d4 < 0) {
                        return 0;
                    }
                }
            }
        }

        for (let i = 0; i < m; i += 2) {
            const x1 = points[i];
            const y1 = points[i + 1];

            for (let j = i + 2; j < m; j += 2) {
                const x2 = points[j];
                const y2 = points[j + 1];

                if (x1 === x2 && y1 === y2) {
                    return 1;
                }
            }
        }

        for (let i = 0; i < m; i += 2) {
            const x0 = points[i];
            const y0 = points[i + 1];

            for (let j = 0; j < m; j += 2) {
                if (i === j || i === (j + 2) % m) {
                    continue;
                }

                const x1 = points[j];
                const y1 = points[j + 1];
                const x2 = points[(j + 2) % m];
                const y2 = points[(j + 3) % m];

                const d1 = (y0 - y1) * (x2 - x1) - (x0 - x1) * (y2 - y1);

                if (d1 === 0) {
                    const d2 = (x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1);

                    if (d2 >= 0) {
                        const d3 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);

                        if (d2 <= d3) {
                            return 1;
                        }
                    }
                }
            }
        }

        return 2;
    }
}

function getBezierControlPoints(factor, previous, point, next) {
    const vector = { x: next[0] - previous[0], y: next[1] - previous[1] };
    const preDist = Math.hypot(previous[0] - point[0], previous[1] - point[1]);
    const postDist = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const dist = preDist + postDist;
    const cp0d = dist === 0 ? 0 : factor * (preDist / dist);
    const cp1d = dist === 0 ? 0 : factor * (postDist / dist);

    return {
        cp1: {
            x: point[0] - (vector.x * cp0d),
            y: point[1] - (vector.y * cp0d)
        },
        next_cp0: {
            x: point[0] + (vector.x * cp1d),
            y: point[1] + (vector.y * cp1d)
        }
    };
}
