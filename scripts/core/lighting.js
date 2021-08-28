export class Lighting {
    static findArea(point) {
        let result = canvas.lighting;

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            for (const area of areas) {
                if (area._pv_los && !area._pv_los.containsPoint(point)) {
                    continue;
                }

                if (area._pv_fov.containsPoint(point)) {
                    result = area;
                }
            }
        }

        return result;
    }
}
