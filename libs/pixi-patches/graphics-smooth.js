import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.smooth.SmoothGraphicsGeometry.prototype.updateBuild (OVERRIDE)");

PIXI.smooth.SmoothGraphicsGeometry.prototype.updateBuild = function () {
    const { graphicsData, buildData } = this;
    const len = graphicsData.length;

    for (let i = this.shapeBuildIndex; i < len; i++) {
        const data = graphicsData[i];

        data.strokeStart = 0;
        data.strokeLen = 0;
        data.fillStart = 0;
        data.fillLen = 0;
        const { fillStyle, lineStyle, holes } = data;

        if (!fillStyle.visible && !lineStyle.visible) {
            continue;
        }

        const command = PIXI.smooth.FILL_COMMANDS[data.type];

        data.clearPath();

        command.path(data, buildData);
        if (data.matrix) {
            this.transformPoints(data.points, data.matrix);
        }

        data.clearBuild();
        if (data.points.length <= 2) {
            continue;
        }
        if (fillStyle.visible) {
            data.fillAA = data.fillStyle.smooth
                && !(data.lineStyle.visible
                    && data.lineStyle.alpha >= 0.99
                    && data.lineStyle.width >= 0.99);

            data.fillStart = buildData.joints.length;

            if (holes.length) {
                this.processHoles(holes);

                PIXI.smooth.FILL_COMMANDS[PIXI.SHAPES.POLY].fill(data, buildData);
            }
            else {
                command.fill(data, buildData);
            }

            data.fillLen = buildData.joints.length - data.fillStart;
        }
        if (lineStyle.visible) {
            data.strokeStart = buildData.joints.length;
            command.line(data, buildData);
            data.strokeLen = buildData.joints.length - data.strokeStart;
        }
    }
    this.shapeBuildIndex = len;
};
