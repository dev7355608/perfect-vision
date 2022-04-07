const tempPoints = [new PIXI.Point(), new PIXI.Point(), new PIXI.Point(), new PIXI.Point()];

PIXI.Rectangle.prototype.intersects = function (other, transform) {
    if (!transform) {
        const x0 = this.x < other.x ? other.x : this.x;
        const x1 = this.right > other.right ? other.right : this.right;

        if (x1 <= x0) {
            return false;
        }

        const y0 = this.y < other.y ? other.y : this.y;
        const y1 = this.bottom > other.bottom ? other.bottom : this.bottom;

        return y1 > y0;
    }

    const x0 = this.left;
    const x1 = this.right;
    const y0 = this.top;
    const y1 = this.bottom;

    if (x1 <= x0 || y1 <= y0) {
        return false;
    }

    const lt = tempPoints[0].set(other.left, other.top);
    const lb = tempPoints[1].set(other.left, other.bottom);
    const rt = tempPoints[2].set(other.right, other.top);
    const rb = tempPoints[3].set(other.right, other.bottom);

    if (rt.x <= lt.x || lb.y <= lt.y) {
        return false;
    }

    const s = Math.sign((transform.a * transform.d) - (transform.b * transform.c));

    if (s === 0) {
        return false;
    }

    transform.apply(lt, lt);
    transform.apply(lb, lb);
    transform.apply(rt, rt);
    transform.apply(rb, rb);

    if (Math.max(lt.x, lb.x, rt.x, rb.x) <= x0
        || Math.min(lt.x, lb.x, rt.x, rb.x) >= x1
        || Math.max(lt.y, lb.y, rt.y, rb.y) <= y0
        || Math.min(lt.y, lb.y, rt.y, rb.y) >= y1) {
        return false;
    }

    const nx = s * (lb.y - lt.y);
    const ny = s * (lt.x - lb.x);
    const n00 = (nx * x0) + (ny * y0);
    const n10 = (nx * x1) + (ny * y0);
    const n01 = (nx * x0) + (ny * y1);
    const n11 = (nx * x1) + (ny * y1);

    if (Math.max(n00, n10, n01, n11) <= (nx * lt.x) + (ny * lt.y)
        || Math.min(n00, n10, n01, n11) >= (nx * rb.x) + (ny * rb.y)) {
        return false;
    }

    const mx = s * (lt.y - rt.y);
    const my = s * (rt.x - lt.x);
    const m00 = (mx * x0) + (my * y0);
    const m10 = (mx * x1) + (my * y0);
    const m01 = (mx * x0) + (my * y1);
    const m11 = (mx * x1) + (my * y1);

    if (Math.max(m00, m10, m01, m11) <= (mx * lt.x) + (my * lt.y)
        || Math.min(m00, m10, m01, m11) >= (mx * rb.x) + (my * rb.y)) {
        return false;
    }

    return true;
};

PIXI.DisplayObject.prototype.cullable = false;
PIXI.DisplayObject.prototype.cullArea = null;

PIXI.Container.prototype.render = function (renderer) {
    // if the object is not visible or the alpha is 0 then no need to render this element
    if (!this.visible || this.worldAlpha <= 0 || !this.renderable) {
        return;
    }

    // do a quick check to see if this element has a mask or a filter.
    if (this._mask || (this.filters && this.filters.length)) {
        this.renderAdvanced(renderer);
    }
    else if (this.cullable) {
        this._renderWithCulling(renderer);
    }
    else {
        this._render(renderer);

        for (let i = 0, j = this.children.length; i < j; ++i) {
            this.children[i].render(renderer);
        }
    }
};

PIXI.Container.prototype.renderAdvanced = function (renderer) {
    const filters = this.filters;
    const mask = this._mask;

    // push filter first as we need to ensure the stencil buffer is correct for any masking
    if (filters) {
        if (!this._enabledFilters) {
            this._enabledFilters = [];
        }

        this._enabledFilters.length = 0;

        for (let i = 0; i < filters.length; i++) {
            if (filters[i].enabled) {
                this._enabledFilters.push(filters[i]);
            }
        }
    }

    const flush = (filters && this._enabledFilters && this._enabledFilters.length)
        || (mask && (!mask.isMaskData
            || (mask.enabled && (mask.autoDetect || mask.type !== PIXI.MASK_TYPES.NONE))));

    if (flush) {
        renderer.batch.flush();
    }

    if (filters && this._enabledFilters && this._enabledFilters.length) {
        renderer.filter.push(this, this._enabledFilters);
    }

    if (mask) {
        renderer.mask.push(this, this._mask);
    }

    if (this.cullable) {
        this._renderWithCulling(renderer);
    }
    else {
        this._render(renderer);

        for (let i = 0, j = this.children.length; i < j; ++i) {
            this.children[i].render(renderer);
        }
    }

    if (flush) {
        renderer.batch.flush();
    }

    if (mask) {
        renderer.mask.pop(this);
    }

    if (filters && this._enabledFilters && this._enabledFilters.length) {
        renderer.filter.pop();
    }
};

PIXI.Container.prototype._renderWithCulling = function (renderer) {
    const sourceFrame = renderer.renderTexture.sourceFrame;

    // If the source frame is empty, stop rendering.
    if (!(sourceFrame.width > 0 && sourceFrame.height > 0)) {
        return;
    }

    // Render the content of the container only if its bounds intersect with the source frame.
    // All filters are on the stack at this point, and the filter source frame is bound:
    // therefore, even if the bounds to non intersect the filter frame, the filter
    // is still applied and any filter padding that is in the frame is rendered correctly.

    let bounds;
    let transform;

    // If cullArea is set, we use this rectangle instead of the bounds of the object. The cullArea
    // rectangle must completely contain the container and its children including filter padding.
    if (this.cullArea) {
        bounds = this.cullArea;
        transform = this.worldTransform;
    }
    // If the container doesn't override _render, we can skip the bounds calculation and intersection test.
    else if (this._render !== PIXI.Container.prototype._render) {
        bounds = this.getBounds(true);
    }

    // Render the container if the source frame intersects the bounds.
    if (bounds && sourceFrame.intersects(bounds, transform)) {
        this._render(renderer);
    }
    // If the bounds are defined by cullArea and do not intersect with the source frame, stop rendering.
    else if (this.cullArea) {
        return;
    }

    // Unless cullArea is set, we cannot skip the children if the bounds of the container do not intersect
    // the source frame, because the children might have filters with nonzero padding, which may intersect
    // with the source frame while the bounds do not: filter padding is not included in the bounds.

    // If cullArea is not set, render the children with culling temporarily enabled so that they are not rendered
    // if they are out of frame; otherwise, render the children normally.
    for (let i = 0, j = this.children.length; i < j; ++i) {
        const child = this.children[i];
        const childCullable = child.cullable;

        child.cullable = childCullable || !this.cullArea;
        child.render(renderer);
        child.cullable = childCullable;
    }
};
