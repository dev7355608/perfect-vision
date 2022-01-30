const tempRect = new PIXI.Rectangle();

export class PointSourceContainer extends PIXI.Container {
    _framebuffer = null;
    _sourceFrame = new PIXI.Rectangle();
    _viewportFrame = new PIXI.Rectangle();
    _viewportTexture = null;

    render(renderer) {
        const gl = renderer.gl;

        renderer.batch.flush();

        // TODO: setting depthRange & depthFunc is probably unnecessary
        gl.depthRange(0, 1);

        super.render(renderer);

        renderer.batch.flush();

        gl.depthFunc(gl.LESS);

        this._framebuffer = null;

        if (this._viewportTexture) {
            renderer.filter.texturePool.returnTexture(this._viewportTexture);

            this._viewportTexture = null;
        }
    }

    _render(renderer) {
        this._framebuffer = renderer.framebuffer.current;
        this._sourceFrame.copyFrom(renderer.renderTexture.sourceFrame);
        this._viewportFrame.copyFrom(renderer.renderTexture.viewportFrame);

        if (!this._framebuffer) {
            this._viewportFrame.y = renderer.view.height - (this._viewportFrame.y + this._viewportFrame.height);
        }
    }

    _getViewportTexture(renderer, bounds) {
        renderer.batch.flush();

        const framebuffer = this._framebuffer;
        const sourceFrame = this._sourceFrame;
        const viewportFrame = this._viewportFrame;

        if (bounds) {
            bounds = tempRect.copyFrom(bounds).fit(sourceFrame);
            bounds.x = bounds.x / sourceFrame.width * viewportFrame.width;
            bounds.y = bounds.y / sourceFrame.height * viewportFrame.height;
            bounds.width = Math.max(bounds.width, 0) / sourceFrame.width * viewportFrame.width;
            bounds.height = Math.max(bounds.height, 0) / sourceFrame.height * viewportFrame.height;
            bounds.ceil();
        } else {
            bounds = tempRect.copyFrom(viewportFrame);
        }

        if (!(bounds.width > 0 && bounds.height > 0)) {
            return PIXI.Texture.EMPTY;
        }

        let sx0 = bounds.x;
        let sy0 = bounds.y;
        let sx1 = sx0 + bounds.width;
        let sy1 = sy0 + bounds.height;

        if (!framebuffer) {
            sy0 = renderer.view.height - 1 - sy0;
            sy1 = sy0 - bounds.height;
        }

        let dx0 = bounds.x - viewportFrame.x;
        let dy0 = bounds.y - viewportFrame.y;
        let dx1 = dx0 + bounds.width;
        let dy1 = dy0 + bounds.height;

        let viewportTexture = this._viewportTexture;

        if (!viewportTexture) {
            viewportTexture = this._viewportTexture =
                renderer.filter.texturePool.getOptimalTexture(viewportFrame.width, viewportFrame.height);
        }

        const gl = renderer.gl;
        const framebufferSystem = renderer.framebuffer;
        const currentFramebuffer = framebufferSystem.current;

        framebufferSystem.bind(viewportTexture.framebuffer, framebufferSystem.viewport);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer?.glFramebuffers[framebufferSystem.CONTEXT_UID].framebuffer);
        gl.blitFramebuffer(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, gl.COLOR_BUFFER_BIT, gl.NEAREST);

        framebufferSystem.bind(currentFramebuffer, framebufferSystem.viewport);

        return viewportTexture;
    }
}
