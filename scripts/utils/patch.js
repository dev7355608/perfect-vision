import { Logger } from "./logger.js";

const wrappers = {};

export function patch(target, type, func) {
    Logger.debug("Patching %s (%s)", target, type);

    let wrapper;

    if (type === "PRE") {
        wrapper = function (wrapped, ...args) {
            return wrapped(...func.apply(this, args));
        };
        wrapper.type = "WRAPPER";
    } else if (type === "POST") {
        wrapper = function (wrapped, ...args) {
            return func.call(this, wrapped(...args), ...args);
        };
        wrapper.type = "WRAPPER";
    } else {
        wrapper = func;
        wrapper.type = type;
    }

    if (wrapper.type === "OVERRIDE") {
        wrapper.priority = 0;
    } else if (wrapper.type === "MIXED") {
        wrapper.priority = 1;
    } else if (wrapper.type === "WRAPPER") {
        wrapper.priority = 2;
    }

    let list = wrappers[target];

    if (!list) {
        wrappers[target] = list = [];
    } else {
        libWrapper.unregister("perfect-vision", target);
    }

    list.push(wrapper);
    list.sort((a, b) => a.priority - b.priority);

    wrapper = list[0];

    for (let i = 1; i < list.length; i++) {
        const last = wrapper;
        const next = list[i];

        if (last.type !== "OVERRIDE") {
            wrapper = function (wrapped, ...args) {
                return next.call(this, (...args) => last.call(this, wrapped, ...args), ...args);
            };
        } else {
            console.assert(next.type !== "OVERRIDE", "OVERRIDE cannot be registered more than once!");

            wrapper = function (...args) {
                return next.call(this, last.bind(this), ...args);
            };
        }

        wrapper.type = last.type;
    }

    libWrapper.register("perfect-vision", target, wrapper, wrapper.type);
}
