import "./settings.js";
import "./core/index.js";
import "./modules/index.js";

import { Board } from "./core/board.js";
import { Mask } from "./core/mask.js";
import { MonoFilter } from "./core/filters/mono.js";

class PerfectVision {
    static Board = Board;
    static Mask = Mask;
    static MonoFilter = MonoFilter;

    static get debug() {
        return Board.debug || Mask.debug;
    }

    static set debug(value) {
        Board.debug = value;
        Mask.debug = value;
    }
}

PerfectVision.debug = false;

self.PerfectVision = PerfectVision;
