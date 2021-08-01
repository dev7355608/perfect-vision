import { Board } from "../../../core/board.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    let counter = 0;
    const ids = new WeakMap();

    patch("Canvas.layers.specials.prototype.addChild", "POST", function (result, ...objects) {
        const board = Board.get("primary");

        for (const object of objects) {
            if (object instanceof PIXI.Sprite) {
                const id = `specials.${counter++}`;

                ids.set(object, id);

                board.place(id, object, "effects");
            }
        }

        return result;
    });

    patch("Canvas.layers.specials.prototype.removeChild", "PRE", function (...objects) {
        const board = Board.get("primary");

        for (const object of objects) {
            if (ids.has(object)) {
                board.unplace(ids.get(object));
            }
        }

        return objects;
    });
});
