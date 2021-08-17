export class Drawings {
    static extractShape(drawing) {
        const graphicsData = drawing.shape?.geometry?.graphicsData;

        if (graphicsData?.length > 0) {
            const matrix = tempMatrix1.copyFrom(PIXI.Matrix.IDENTITY);

            matrix.translate(-drawing.data.width / 2, -drawing.data.height / 2);
            matrix.rotate(Math.toRadians(drawing.data.rotation || 0));
            matrix.translate(drawing.data.x + drawing.data.width / 2, drawing.data.y + drawing.data.height / 2);

            return graphicsDataToPolygon(graphicsData[0], matrix);
        }

        return new PIXI.Polygon();
    }
}

function transformPoints(points, matrix) {
    const { a, b, c, d, tx, ty } = matrix;

    for (let i = 0; i < points.length / 2; i++) {
        const x = points[i * 2];
        const y = points[i * 2 + 1];

        points[i * 2] = a * x + c * y + tx;
        points[i * 2 + 1] = b * x + d * y + ty;
    }
}

const tempMatrix1 = new PIXI.Matrix();
const tempMatrix2 = new PIXI.Matrix();
const tempData = new PIXI.GraphicsData(new PIXI.Polygon());

function graphicsDataToPolygon(data, matrix) {
    if (data.matrix) {
        matrix = tempMatrix2.copyFrom(matrix);
        matrix.append(data.matrix);
    }

    let shape;

    if (data.shape.type !== PIXI.SHAPES.POLY) {
        const { a, b, c, d, tx, ty } = matrix;

        const bc0 = Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4;

        if (bc0 || Math.abs(a) < 1e-4 && Math.abs(d) < 1e-4) {
            if (data.shape.type !== PIXI.SHAPES.CIRC) {
                shape = data.shape.clone();
            } else {
                shape = new PIXI.Ellipse(data.shape.x, data.shape.y, data.shape.radius, data.shape.radius);
            }

            const { x, y, width, height } = shape;

            if (bc0) {
                shape.x = x * a + tx;
                shape.y = y * d + ty;
                shape.width = Math.abs(width * a);
                shape.height = Math.abs(height * d);
            } else {
                shape.x = y * c + tx;
                shape.y = x * b + ty;
                shape.width = Math.abs(height * c);
                shape.height = Math.abs(width * b);
            }
        } else if (Math.abs(a * b + c * d) < 1e-4) {
            if (data.shape.type === PIXI.SHAPES.CIRC) {
                shape = new PIXI.Ellipse(data.shape.x, data.shape.y, data.shape.radius, data.shape.radius);
            } else if (data.shape.type === PIXI.SHAPES.ELIP && data.shape.width === data.shape.height) {
                shape = data.shape.clone();
            }

            if (shape) {
                const { x, y } = shape;
                const radius = shape.width;

                shape.x = x * a + y * c + tx;
                shape.y = x * b + y * d + ty;
                shape.width = Math.abs(radius * Math.sqrt(a * a + c * c));
                shape.height = Math.abs(radius * Math.sqrt(b * b + d * d));
            }
        }
    }

    if (!shape) {
        tempData.shape = data.shape;
        tempData.type = data.type;

        const command = PIXI.graphicsUtils.FILL_COMMANDS[data.type];

        command.build(tempData);

        const points = tempData.points;

        transformPoints(points, matrix);

        shape = new PIXI.Polygon(points);
    }

    if (shape.type === PIXI.SHAPES.ELIP && shape.width === shape.height) {
        shape = new PIXI.Circle(shape.x, shape.y, shape.width);
    }

    return shape;
}
