import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("WallsLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        canvas.interface.addChild(this);

        return await wrapped(...args);
    });

    patch("Wall.prototype.identifyInteriorState", "OVERRIDE", function () {
        this.roof = null;

        for (const roof of canvas.foreground.roofs) {
            if (roof.document.getFlag("betterroofs", "brMode") === 3) {
                continue;
            }

            const isInterior = roof.containsPixel(this.data.c[0], this.data.c[1]) && roof.containsPixel(this.data.c[2], this.data.c[3]);

            if (isInterior) {
                this.roof = roof;
            }
        }
    });
});
