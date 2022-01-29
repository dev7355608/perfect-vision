export class PointSourceContainer extends PIXI.Container {
    render(renderer) {
        const gl = renderer.gl;

        renderer.batch.flush();

        // TODO: setting depthRange & depthFunc is probably unnecessary
        gl.depthRange(0, 1);

        super.render(renderer);

        renderer.batch.flush();

        gl.depthFunc(gl.LESS);
    }
}
