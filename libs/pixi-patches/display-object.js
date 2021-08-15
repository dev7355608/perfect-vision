import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.DisplayObject.prototype.destroyed");

Object.defineProperty(PIXI.DisplayObject.prototype, "destroyed", {
    get() {
        return this._destroyed;
    }
});
