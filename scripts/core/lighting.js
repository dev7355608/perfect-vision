export class Lighting {
    static findArea(point) {
        let result = canvas.lighting;

        if (canvas.lighting._pv_areas) {
            for (const area of canvas.lighting._pv_areas) {
                if (area.skipRender) {
                    continue;
                }

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
