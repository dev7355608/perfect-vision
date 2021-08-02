import { Board } from "../../core/board.js";

Hooks.once("init", () => {
    if (!game.modules.get("pushTokenBack")?.active) {
        return;
    }

    const oldPushToBack = self.pushToBack;

    self.pushToBack = function pushToBack() {
        oldPushToBack();

        if (pushTokenBack?.hoverToken?.hoveredTarget instanceof Token) {
            const layer = Board.get("primary").getLayer("tokens");
            const icon = pushTokenBack.hoverToken.hoveredTarget.icon;

            let position = 0;

            for (const child of layer.children) {
                if (child === icon) {
                    break;
                }

                position++;
            }

            if (position < layer.children.length) {
                layer.children.splice(position, 1);
                layer.children.unshift(icon);
            }
        }
    }
});
