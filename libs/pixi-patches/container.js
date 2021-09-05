import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.Container.prototype.renderAdvanced (OVERRIDE)");

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

    // add this object to the batch, only rendered if it has a texture.
    this._render(renderer);

    // now loop through the children and make sure they get rendered
    for (let i = 0, j = this.children.length; i < j; i++) {
        this.children[i].render(renderer);
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
