export const ViewportTextureMixin = Base => class extends Base {
    _render(renderer) {
        renderer.batch.flush();

        const shader = this.shader;

        if ("viewportTexture" in shader) {
            shader.viewportTexture = this.#getViewportTexture(renderer);

            super._render(renderer);

            shader.viewportTexture = PIXI.Texture.EMPTY;
        } else {
            super._render(renderer);
        }
    }

    #getViewportTexture(renderer) {
        for (let container = this.parent; container; container = container.parent) {
            if ("_getViewportTexture" in container) {
                return container._getViewportTexture(renderer, this);
            }
        }

        return PIXI.Texture.EMPTY;
    }
}

const tempRect = new PIXI.Rectangle();

export const ViewportTextureContainerMixin = Base => class extends Base {
    #framebuffer = null;
    #sourceFrame = new PIXI.Rectangle();
    #viewportFrame = new PIXI.Rectangle();
    #viewportTexture = null;

    render(renderer) {
        super.render(renderer);

        renderer.batch.flush();

        this.#framebuffer = null;

        if (this.#viewportTexture) {
            renderer.filter.texturePool.returnTexture(this.#viewportTexture);

            this.#viewportTexture.filterFrame = null;
            this.#viewportTexture = null;
        }
    }

    _render(renderer) {
        this.#framebuffer = renderer.framebuffer.current;
        this.#sourceFrame.copyFrom(renderer.renderTexture.sourceFrame);
        this.#viewportFrame.copyFrom(renderer.renderTexture.viewportFrame);

        if (!this.#framebuffer) {
            this.#viewportFrame.y = renderer.view.height - (this.#viewportFrame.y + this.#viewportFrame.height);
        }
    }

    _getViewportTexture(renderer, object, skipUpdate) {
        if (skipUpdate) {
            return this.#viewportTexture;
        }

        renderer.batch.flush();

        const framebuffer = this.#framebuffer;
        const sourceFrame = this.#sourceFrame;
        const viewportFrame = this.#viewportFrame;
        let bounds;

        if (object) {
            bounds = tempRect.copyFrom(object.getBounds(true)).fit(sourceFrame);
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

        let viewportTexture = this.#viewportTexture;

        if (!viewportTexture) {
            viewportTexture = this.#viewportTexture =
                renderer.filter.texturePool.getOptimalTexture(viewportFrame.width, viewportFrame.height);
            viewportTexture.filterFrame = viewportFrame;
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

export const ViewportTextureContainer = ViewportTextureContainerMixin(PIXI.Container);
