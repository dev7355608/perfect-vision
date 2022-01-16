export class Region {
    static from(shape, transform) {
        if (shape instanceof Region) {
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

    shape;
    transform;
    _bounds = null;
    _contour = null;

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
            } else if (type === PIXI.SHAPES.ELIP) {
                const { width, height } = shape;

                if (width === height) {
                    shape = new PIXI.Circle(shape.x, shape.y, width);
                }
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
                }
            }
        }

        if (shape.type === PIXI.SHAPES.POLY) {
            const points = shape.points;
            let m = points.length;
            let k = 0;
            let area = 0;

            for (let i = 0, x1 = points[m - 2], y1 = points[m - 1]; i < m; i += 2) {
                const x2 = points[i];
                const y2 = points[i + 1];
                const dx = x2 - x1;
                const dy = y2 - y1;

                if (dx * dx + dy * dy === 0) {
                    k += 2;

                    continue;
                }

                if (k !== 0) {
                    points[i - k] = x2;
                    points[i - k + 1] = y2;
                }

                area += dx * (y2 + y1);

                x1 = x2;
                y1 = y2;
            }

            m = points.length = Math.max(m - k, 2);

            if (area > 0) {
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

    get bounds() {
        let bounds = this._bounds;

        if (!bounds) {
            bounds = this._bounds = this._computeBounds();
        }

        return bounds;
    }

    get contour() {
        let contour = this._contour;

        if (!contour) {
            contour = this._contour = this._generateContour();
        }

        return contour;
    }

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

    _computeBounds() {
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

        return bounds;
    }

    _generateContour() {
        const shape = this.shape;
        const type = shape.type;

        if (type === PIXI.SHAPES.RECT) {
            const x0 = shape.x;
            const y0 = shape.y;
            const w = shape.width;
            const h = shape.height;
            const x1 = x0 + w;
            const y1 = y0 + h;

            let points;

            if (w > 0 && h > 0) {
                points = new Array(8);
                points[0] = x0;
                points[1] = y0;
                points[2] = x1;
                points[3] = y0;
                points[4] = x1;
                points[5] = y1;
                points[6] = x0;
                points[7] = y1;
            } else if (w > 0) {
                points = new Array(4);
                points[0] = x0;
                points[1] = y0;
                points[2] = x1;
                points[3] = y0;
            } else if (h > 0) {
                points = new Array(4);
                points[0] = x0;
                points[1] = y0;
                points[2] = x0;
                points[3] = y1;
            } else {
                points = new Array(2);
                points[0] = x0;
                points[1] = y0;
            }

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

        const da = 2 * Math.acos(1 - Math.min(0.5 / Math.max(sx, sy), 1));
        const n = Math.max(Math.ceil(Math.PI / 2 / da), 1);
        const m = n * 8 + (dx ? 4 : 0) + (dy ? 4 : 0);
        const points = new Array(m);

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

        let k = 0;
        let area = 0;

        for (let i = 0, x1 = points[m - 2], y1 = points[m - 1]; i < m; i += 2) {
            const x2 = points[i];
            const y2 = points[i + 1];
            const dx = x2 - x1;
            const dy = y2 - y1;

            if (dx * dx + dy * dy === 0) {
                k += 2;

                continue;
            }

            if (k !== 0) {
                points[i - k] = x2;
                points[i - k + 1] = y2;
            }

            area += dx * (y2 + y1);

            x1 = x2;
            y1 = y2;
        }

        if (k < m) {
            points.length -= k;
        } else {
            points[0] = x;
            points[1] = y;
            points.length = 2;
        }

        if (area > 0) {
            const n = points.length / 2;

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
}
