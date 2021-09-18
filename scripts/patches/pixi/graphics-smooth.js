import { Logger } from "../../utils/logger.js";

Logger.debug("Patching PIXI.smooth.SmoothGraphicsGeometry.prototype.updateBuild (OVERRIDE)");

PIXI.smooth.SmoothGraphicsGeometry.prototype.updateBuild = function () {
    const FILL_COMMANDS = PIXI.smooth.FILL_COMMANDS;
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

        const command = FILL_COMMANDS[data.type];

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

                FILL_COMMANDS[PIXI.SHAPES.POLY].fill(data, buildData);
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

Logger.debug("Patching PIXI.smooth.CircleBuilder.prototype.path (OVERRIDE)");

PIXI.smooth.CircleBuilder.prototype.path = function (graphicsData, _target) {
    // need to convert points to a nice regular data
    const circleData = graphicsData.shape;
    const points = graphicsData.points;
    const x = circleData.x;
    const y = circleData.y;
    let width;
    let height;

    if (graphicsData.type === PIXI.SHAPES.CIRC) {
        width = circleData.radius;
        height = circleData.radius;
    } else {
        const ellipseData = graphicsData.shape;

        width = ellipseData.width;
        height = ellipseData.height;
    }

    if (width <= 0 || height <= 0) {
        return;
    }

    let totalSegs = Math.floor(30 * Math.sqrt(circleData.radius))
        || Math.floor(15 * Math.sqrt(width + height));

    totalSegs /= 2.3;
    if (totalSegs < 3) {
        totalSegs = 3;
    }

    const seg = (Math.PI * 2) / totalSegs;

    for (let i = 0; i < totalSegs - 0.5; i++) {
        points.push(
            x + (Math.sin(-seg * i) * width),
            y + (Math.cos(-seg * i) * height)
        );
    }
};

Logger.debug("Patching PIXI.smooth.CircleBuilder.prototype.fill (OVERRIDE)");

PIXI.smooth.CircleBuilder.prototype.fill = function (graphicsData, target) {
    const JOINT_TYPE = PIXI.smooth.JOINT_TYPE;
    const { verts, joints } = target;
    const { points, triangles } = graphicsData;

    let vertPos = 1;
    const center = 0;

    const circle = graphicsData.shape;
    const matrix = graphicsData.matrix;
    const x = circle.x;
    const y = circle.y;
    const cx = matrix ? (matrix.a * x) + (matrix.c * y) + matrix.tx : x;
    const cy = matrix ? (matrix.b * x) + (matrix.d * y) + matrix.ty : y;

    if (!graphicsData.fillAA) {
        verts.push(cx, cy);
        joints.push(JOINT_TYPE.FILL);

        for (let i = 0; i < points.length; i += 2) {
            verts.push(points[i], points[i + 1]);
            joints.push(JOINT_TYPE.FILL);
            if (i > 2) {
                triangles.push(vertPos++, center, vertPos);
            }
        }
        triangles.push(vertPos, center, 1);

        return;
    }

    const rad = circle.radius;

    for (let i = 0; i < points.length; i += 2) {
        // const prev = i;
        const cur = i;
        const next = i + 2 < points.length ? i + 2 : 0;

        verts.push(cx);
        verts.push(cy);
        verts.push(points[cur]);
        verts.push(points[cur + 1]);
        verts.push(points[next]);
        verts.push(points[next + 1]);

        verts.push(0);
        verts.push(0);
        verts.push((points[cur] - cx) / rad);
        verts.push((points[cur + 1] - cy) / rad);
        verts.push((points[next] - cx) / rad);
        verts.push((points[next + 1] - cy) / rad);

        joints.push(JOINT_TYPE.FILL_EXPAND + 2);
        joints.push(JOINT_TYPE.NONE);
        joints.push(JOINT_TYPE.NONE);
        joints.push(JOINT_TYPE.NONE);
        joints.push(JOINT_TYPE.NONE);
        joints.push(JOINT_TYPE.NONE);
    }
};

Logger.debug("Patching PIXI.smooth.CircleBuilder.prototype.line (OVERRIDE)");

PIXI.smooth.CircleBuilder.prototype.line = function (graphicsData, target) {
    const JOINT_TYPE = PIXI.smooth.JOINT_TYPE;
    const { verts, joints } = target;
    const { points } = graphicsData;
    const joint = graphicsData.goodJointType();
    const len = points.length;

    verts.push(points[len - 2], points[len - 1]);
    joints.push(JOINT_TYPE.NONE);
    for (let i = 0; i < len; i += 2) {
        verts.push(points[i], points[i + 1]);
        joints.push(joint);
    }
    verts.push(points[0], points[1]);
    joints.push(JOINT_TYPE.NONE);
    verts.push(points[2], points[3]);
    joints.push(JOINT_TYPE.NONE);
};
