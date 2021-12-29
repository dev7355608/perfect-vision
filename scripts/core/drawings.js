import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("Drawing.prototype.destroy", "PRE", function () {
        if (this._pv_active) {
            canvas.lighting._pv_destroyArea(this);

            canvas.perception.schedule({ lighting: { refresh: true } });
        }

        return arguments;
    });
});

const fovOnlyUpdateKeys = ["type", "points", "bezierFactor"];
const fovAndLosUpdateKeys = ["x", "y", "width", "height", "rotation"];

Hooks.on("updateDrawing", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView) {
        return;
    }

    let refresh = "flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change;

    if (!document.object._pv_active && !refresh) {
        return;
    }

    if (fovAndLosUpdateKeys.some(key => key in change)) {
        document.object._pv_flags_updateFOV = true;
        document.object._pv_flags_updateLOS = true;

        refresh = true;
    } else if (fovOnlyUpdateKeys.some(key => key in change)) {
        document.object._pv_flags_updateFOV = true;

        refresh = true;
    } else if (!refresh && "z" in change) {
        refresh = true;
    }

    if (refresh) {
        canvas.perception.schedule({ lighting: { refresh: true } });
    }
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
