import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("WallsLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        canvas.interface.addChild(this);

        return await wrapped(...args);
    });

    patch("WallsLayer.prototype._createBoundaries", "OVERRIDE", function () {
        // Boundaries are padded outwards by the grid size to allow lighting effects to be cleanly masked at the edges
        let { width, height, size } = canvas.dimensions;

        size = Math.ceil(size / 10);

        const coords = [-size, -size, width + size, -size, width + size, height + size, -size, height + size, -size, -size];

        // Register boundaries
        this.boundaries.clear();
        for (let i = 0; i < 4; i++) {
            const d = new WallDocument({
                _id: foundry.utils.randomID(),
                c: coords.slice(i * 2, (i * 2) + 4)
            }, { parent: canvas.scene });
            this.boundaries.add(new Wall(d));
        }
    });
});
