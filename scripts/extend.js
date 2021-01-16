const extensions = new WeakMap();

export function extend(object) {
    if (!extensions.has(object))
        extensions.set(object, {});

    return extensions.get(object);
}
