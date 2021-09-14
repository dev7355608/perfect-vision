const tempMatrix = new PIXI.Matrix();

export class Drawings {
    static getShape(drawing) {
        return drawing.shape?.geometry?.graphicsData?.[0]?.shape;
    }

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
}
