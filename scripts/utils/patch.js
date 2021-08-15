import { Logger } from "./logger.js";

const wrappers = {};

export function patch(target, type, func) {
    Logger.debug("Patching %s (%s)", target, type);

    let wrapper;

    if (type === "PRE") {
        wrapper = function (wrapped, ...args) {
            return wrapped(...func.apply(this, args));
        };
        wrapper._pv_type = "WRAPPER";
    } else if (type === "POST") {
        wrapper = function (wrapped, ...args) {
            return func.call(this, wrapped(...args), ...args);
        };
        wrapper._pv_type = "WRAPPER";
    } else {
        wrapper = func;
        wrapper._pv_type = type;
    }

    if (wrapper._pv_type === "OVERRIDE") {
        wrapper._pv_priority = 0;
    } else if (wrapper._pv_type === "MIXED") {
        wrapper._pv_priority = 1;
    } else if (wrapper._pv_type === "WRAPPER") {
        wrapper._pv_priority = 2;
    }

    let list = wrappers[target];

    if (!list) {
        wrappers[target] = list = [];
    } else {
        libWrapper.unregister("perfect-vision", target);
    }

    list.push(wrapper);
    list.sort((a, b) => a._pv_priority - b._pv_priority);

    wrapper = list[0];

    for (let i = 1; i < list.length; i++) {
        const last = wrapper;
        const next = list[i];

        if (last._pv_type !== "OVERRIDE") {
            wrapper = function (wrapped, ...args) {
                return next.call(this, (...args) => last.call(this, wrapped, ...args), ...args);
            };
        } else {
            console.assert(next._pv_type !== "OVERRIDE", "OVERRIDE cannot be registered more than once!");

            wrapper = function (...args) {
                return next.call(this, last.bind(this), ...args);
            };
        }

        wrapper._pv_type = last._pv_type;
    }

    libWrapper.register("perfect-vision", target, wrapper, wrapper._pv_type);
}
