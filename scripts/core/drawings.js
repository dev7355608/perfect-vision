export class Drawings {
    static getTransform(drawing, out) {
        const matrix = out ? out.identity() : new PIXI.Matrix();
        const { x, y, width, height, rotation } = drawing.data;

        matrix.translate(-width / 2, -height / 2);
        matrix.rotate(Math.toRadians(rotation || 0));
        matrix.translate(x + width / 2, y + height / 2);

        const graphicsData = drawing.shape?.geometry?.graphicsData;

        if (graphicsData?.length && graphicsData.matrix) {
            matrix.append(graphicsData[0].matrix);
        }

        return matrix;
    }

    static getLocalPosition(drawing, globalPosition, out) {
        return this.getTransform(drawing, tempMatrix).applyInverse(globalPosition, out);
    }

    static getGlobalPosition(drawing, localPosition, out) {
        return this.getTransform(drawing, tempMatrix).apply(localPosition, out);
    }

    static extractShapeAndOrigin(drawing, origin) {
        const { x, y, width, height, rotation } = drawing.data;

        if (width <= 0 || height <= 0) {
            return { shape: new PIXI.Polygon(), origin: null };
        }

        const graphicsData = drawing.shape?.geometry?.graphicsData;

        if (!graphicsData?.length) {
            return { shape: new PIXI.Polygon(), origin: null };
        }

        const data = graphicsData[0];

        if (!data.shape || data.shape.width <= 0 || data.shape.height <= 0 || data.shape.radius <= 0 || data.shape.points?.length <= 2) {
            return { shape: new PIXI.Polygon(), origin: null };
        }

        const matrix = tempMatrix.identity();

        matrix.translate(-width / 2, -height / 2);
        matrix.rotate(Math.toRadians(rotation || 0));
        matrix.translate(x + width / 2, y + height / 2);

        if (data.matrix) {
            matrix.append(data.matrix);
        }

        if (origin) {
            origin = new PIXI.Point(origin.x * width, origin.y * height);

            matrix.apply(origin, origin);
        } else {
            origin = null;
        }

        const shape = transformShape(data.shape, matrix);

        return { shape, origin };
    }
}

const tempMatrix = new PIXI.Matrix();
const tempGraphicsData = new PIXI.GraphicsData(new PIXI.Polygon());

function transformPoints(points, matrix) {
    const { a, b, c, d, tx, ty } = matrix;

    for (let i = 0; i < points.length / 2; i++) {
        const x = points[i * 2];
        const y = points[i * 2 + 1];

        points[i * 2] = a * x + c * y + tx;
        points[i * 2 + 1] = b * x + d * y + ty;
    }
}

function transformShape(shape, matrix) {
    let result;

    if (shape.type !== PIXI.SHAPES.POLY) {
        const { a, b, c, d, tx, ty } = matrix;

        const bc0 = Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4;

        if (bc0 || Math.abs(a) < 1e-4 && Math.abs(d) < 1e-4) {
            if (shape.type !== PIXI.SHAPES.CIRC) {
                result = shape.clone();
            } else {
                result = new PIXI.Ellipse(shape.x, shape.y, shape.radius, shape.radius);
            }

            const { x, y, width, height } = result;

            if (bc0) {
                result.x = x * a + tx;
                result.y = y * d + ty;
                result.width = width * a;
                result.height = height * d;
            } else {
                result.x = y * c + tx;
                result.y = x * b + ty;
                result.width = height * c;
                result.height = width * b;
            }
        } else if (Math.abs(a * b + c * d) < 1e-4) {
            if (shape.type === PIXI.SHAPES.CIRC) {
                result = new PIXI.Ellipse(shape.x, shape.y, shape.radius, shape.radius);
            } else if (shape.type === PIXI.SHAPES.ELIP && shape.width === shape.height) {
                result = shape.clone();
            }

            if (result) {
                const { x, y } = result;
                const radius = result.width;

                result.x = x * a + y * c + tx;
                result.y = x * b + y * d + ty;
                result.width = radius * Math.sqrt(a * a + c * c);
                result.height = radius * Math.sqrt(b * b + d * d);
            }
        }
    }

    if (!result) {
        result = buildPolygon(shape);

        transformPoints(result.points, matrix);
    } else if (result.type === PIXI.SHAPES.RECT || result.type === PIXI.SHAPES.RREC) {
        const x = result.width >= 0 ? result.x : result.x + result.width;
        const y = result.height >= 0 ? result.y : result.y + result.height;

        result.x = x;
        result.y = y;
        result.width = Math.abs(result.width);
        result.height = Math.abs(result.height);

        if (result.type === PIXI.SHAPES.RREC && result.radius <= 0) {
            result = new PIXI.Rectangle(result.x, result.y, result.width, result.height);
        }
    } else if (result.type === PIXI.SHAPES.ELIP) {
        result.width = Math.abs(result.width);
        result.height = Math.abs(result.height);

        if (result.width === result.height) {
            result = new PIXI.Circle(result.x, result.y, result.width);
        }
    } else if (result.type === PIXI.SHAPES.CIRC) {
        result.radius = Math.abs(result.radius);
    }

    return result;
}

function buildPolygon(shape) {
    const data = tempGraphicsData;

    data.shape = shape;
    data.type = shape.type;
    data.points = [];

    const command = PIXI.graphicsUtils.FILL_COMMANDS[data.type];

    command.build(data);

    const points = data.points;

    return new PIXI.Polygon(points);
}
