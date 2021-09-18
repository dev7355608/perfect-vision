import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("Drawing.prototype.destroy", "PRE", function () {
        const refresh = this._pv_active;

        canvas.lighting._pv_destroyArea(this);

        if (refresh) {
            canvas.perception.schedule({ lighting: { refresh: true } });
        }

        return arguments;
    });
});

Hooks.on("updateDrawing", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView || !document.object._pv_active && !("flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change)) {
        return;
    }

    // TODO: only flag for update if relevant properties changed
    document.object._pv_flags_updateFOV = true;
    document.object._pv_flags_updateLOS = true;

    canvas.perception.schedule({ lighting: { refresh: true } });
});

const tempMatrix = new PIXI.Matrix();

Drawing.prototype._pv_getShape = function () {
    return this.shape?.geometry?.graphicsData?.[0]?.shape;
};

Drawing.prototype._pv_getTransform = function (out) {
    const matrix = out ? out.identity() : new PIXI.Matrix();
    const { x, y, width, height, rotation } = this.data;

    matrix.translate(-width / 2, -height / 2);
    matrix.rotate(Math.toRadians(rotation || 0));
    matrix.translate(x + width / 2, y + height / 2);

    const graphicsData = this.shape?.geometry?.graphicsData;

    if (graphicsData?.length && graphicsData.matrix) {
        matrix.append(graphicsData[0].matrix);
    }

    return matrix;
};

Drawing.prototype._pv_getLocalPosition = function (globalPosition, out) {
    return this._pv_getTransform(tempMatrix).applyInverse(globalPosition, out);
};

Drawing.prototype._pv_getGlobalPosition = function (localPosition, out) {
    return this._pv_getTransform(tempMatrix).apply(localPosition, out);
};

