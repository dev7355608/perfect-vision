export class GeometrySegment {
    geometry;
    drawMode;
    size;
    start;
    instanceCount;

    constructor(geometry, drawMode = PIXI.DRAW_MODES.TRIANGLES, size = 0, start = 0, instanceCount = 1) {
        this.geometry = geometry;
        this.drawMode = drawMode;
        this.size = size;
        this.start = start;
        this.instanceCount = instanceCount;
    }

    retain() {
        this.geometry.refCount++;
    }

    release() {
        this.geometry.refCount--;

        if (this.geometry.refCount === 0) {
            this.geometry.dispose();
        }
    }

    draw(renderer, shader) {
        renderer.geometry.bind(this.geometry, shader);
        renderer.geometry.draw(this.drawMode, this.size, this.start, this.instanceCount);
    }
}
