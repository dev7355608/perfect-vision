import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("WallsLayer.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        canvas.interface.addChild(this);

        return await wrapped(...args);
    });
});
