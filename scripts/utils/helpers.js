export function hasChanged(object, ...keys) {
    outer: for (const key of keys) {
        if (!key) {
            continue;
        }

        for (const part of key.split(".")) {
            object = object || {};

            if (part in object) {
                object = object[part];
            } else if (`-=${part}` in object) {
                return true;
            } else {
                continue outer;
            }
        }

        return true;
    }

    return false;
}
