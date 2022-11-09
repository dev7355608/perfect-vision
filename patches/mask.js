CachedContainer.prototype.dirty = undefined;

{
    const original = CachedContainer.prototype.render;

    CachedContainer.prototype.render = function (renderer) {
        if (this.dirty === false) {
            if (this.displayed) {
                Object.getPrototypeOf(CachedContainer).prototype.render.call(this, renderer);
            }

            return;
        }

        if (this.dirty === true) {
            this.dirty = false;
        }

        return original.call(this, renderer);
    };
}

{
    const original = CanvasOcclusionMask.prototype.updateOcclusion;

    CanvasOcclusionMask.prototype.updateOcclusion = function () {
        this.dirty = true;
        canvas.masks.depth.dirty = true;

        return original.apply(this, arguments);
    }
}

// {
//     const original = PrimaryCanvasGroup.prototype.sortChildren;

//     PrimaryCanvasGroup.prototype.sortChildren = function () {
//         canvas.masks.depth.dirty = true;

//         return original.apply(this, arguments);
//     }
// }

function setDirtyAll() {
    if (canvas.ready) {
        canvas.masks.depth.dirty = true;
        canvas.masks.occlusion.dirty = true;
        canvas.masks.vision.dirty = true;
    }
}

Hooks.on("canvasReady", setDirtyAll);
Hooks.on("canvasTearDown", setDirtyAll);
Hooks.on("canvasPan", setDirtyAll);

// Hooks.on("refreshTile", tile => {
//     if (tile.isRoof) {
//         canvas.masks.depth.dirty = true;
//     }
// });

Hooks.on("sightRefresh", () => {
    canvas.masks.vision.dirty = true;
});

