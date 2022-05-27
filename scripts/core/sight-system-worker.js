importScripts("../../libs/clipper.js");

const COMMIT_THRESHOLD = 10;

const clipper = new ClipperLib.Clipper();

let ticker = 0;
let vision = null;
let commit = null;
let pendingFirst = null;
let pendingLast = null;
let explored = null;

function tick() {
    if (vision && vision.created + 50 <= performance.now()) {
        vision.tick();

        if (vision.done) {
            postMessage({
                type: "vision",
                id: vision.id,
                paths: vision.result
            });

            vision = null;
        }
    } else {
        if (!commit && pendingFirst) {
            let incomplete;

            while (pendingFirst) {
                incomplete = pendingFirst.id !== explored.id + 1;

                if (!incomplete && !pendingFirst.explored) {
                    pendingFirst = pendingFirst.next;
                    explored.id++;
                } else {
                    break;
                }
            }

            if (!pendingFirst) {
                pendingLast = null;
            }

            let pendingCurrent = pendingFirst;
            let threshold = COMMIT_THRESHOLD;

            while (pendingCurrent) {
                if (pendingCurrent.explored) {
                    if (!pendingCurrent.done) {
                        pendingCurrent.tick();

                        break;
                    }

                    if (!incomplete && --threshold === 0) {
                        const id = pendingCurrent.id;
                        const pending = [];

                        for (let k = COMMIT_THRESHOLD; k;) {
                            if (pendingCurrent.explored) {
                                pending.push(pendingFirst.result);

                                k--;
                            }

                            pendingFirst = pendingFirst.next;
                        }

                        if (!pendingFirst) {
                            pendingLast = null;
                        }

                        commit = new CommitPendingTask({ id, explored: explored.result, pending });

                        break;
                    }
                }

                if (pendingCurrent.next) {
                    if (pendingCurrent.next.id !== pendingCurrent.id + 1) {
                        incomplete = true;
                    }
                }

                pendingCurrent = pendingCurrent.next;
            }
        }

        if (commit) {
            commit.tick();

            if (commit.done) {
                explored = commit;

                postMessage({
                    type: "explored",
                    id: explored.id,
                    paths: explored.result
                });

                commit = null;
            }
        } else if (!vision) {
            ticker = 0;

            return;
        }
    }

    ticker = setTimeout(tick, 0);
}

onmessage = function (event) {
    if (event.data.type === "update") {
        const pending = new ComputeVisionTask(event.data);

        if (!vision || vision.id < pending.id) {
            vision = pending;
        }

        if (pendingLast) {
            if (pendingLast.id < pending.id) {
                pendingLast.next = pending;
                pendingLast = pending;
            } else if (pendingFirst.id > pending.id) {
                pending.next = pendingFirst;
                pendingFirst = pending;
            } else {
                let pendingCurrent = pendingFirst;

                while (pendingCurrent.next.id < pending.id) {
                    pendingCurrent = pendingCurrent.next;
                }

                pending.next = pendingCurrent.next;
                pendingCurrent.next = pending;
            }
        } else {
            pendingFirst = pendingLast = pending;
        }

        if (!explored) {
            explored = new CommitPendingTask({ id: 0 })
            explored.tick();
        }

        if (!ticker) {
            ticker = setTimeout(tick, 0);
        }
    } else {
        let { id, explored } = event.data;

        if (vision && vision.id < id) {
            vision = null;
        }

        if (commit && commit.id < id) {
            commit = null;
        }

        while (pendingFirst) {
            if (pendingFirst.id < id) {
                pendingFirst = pendingFirst.next;
            } else {
                break;
            }
        }

        pendingLast = pendingFirst;

        if (pendingLast) {
            while (pendingLast.next) {
                pendingLast = pendingLast.next;
            }
        }

        if (!explored || explored.id < id) {
            explored = new CommitPendingTask({ id, explored });
            explored.tick();
        }

        if (!vision && !pendingFirst && !commit) {
            if (ticker) {
                ticker = 0;

                clearTimeout(ticker);
            }
        }
    }
};

class Task {
    result;
    _ticker;

    get done() {
        return this.result !== undefined;
    }

    tick() {
        if (!this._ticker) {
            this._ticker = this._run();
        }

        return this._ticker.next().done;
    }
}

class ComputeVisionTask extends Task {
    constructor({ id, fov, los, explored = false }) {
        super();

        this.id = id;
        this.fov = fov;
        this.los = los;
        this.explored = explored;
        this.next = null;
        this.created = performance.now();
    }

    * _processStack(stack) {
        let subjPaths;
        let clipPaths = [];
        let clipType = ClipperLib.ClipType.ctUnion;

        for (let i = 0; i < stack.length; i++) {
            const polygon = stack[i];
            const paths = [];

            for (const contour of polygon.contours) {
                const m = contour.length;
                const path = new Array(m >> 1);

                for (let j = 0; j < m; j += 2) {
                    path[j >> 1] = new ClipperLib.IntPoint(Math.round(contour[j] * 256), Math.round(contour[j + 1] * 256));
                }

                paths.push(path);
            }

            const ct = polygon.hole ? ClipperLib.ClipType.ctDifference : ClipperLib.ClipType.ctUnion;

            if (ct !== clipType) {
                if (clipPaths.length === 0) {
                    continue;
                }

                if (subjPaths) {
                    yield;

                    clipper.AddPaths(subjPaths, ClipperLib.PolyType.ptSubject, true);
                    clipper.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
                    clipper.Execute(clipType, subjPaths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
                    clipper.Clear();

                    clipPaths.length = 0;
                } else {
                    subjPaths = clipPaths;
                    clipPaths = [];
                }

                clipType = ct;
            }

            for (const path of paths) {
                clipPaths.push(path);
            }
        }

        if (subjPaths) {
            yield;

            clipper.AddPaths(subjPaths, ClipperLib.PolyType.ptSubject, true);
            clipper.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
            clipper.Execute(clipType, clipPaths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
            clipper.Clear();
        }

        return clipPaths;
    }

    * _run() {
        const fovPaths = yield* this._processStack(this.fov);
        const losPaths = yield* this._processStack(this.los);

        yield;

        const visionPaths = [];

        clipper.AddPaths(fovPaths, ClipperLib.PolyType.ptClip, true);
        clipper.AddPaths(losPaths, ClipperLib.PolyType.ptSubject, true);
        clipper.Execute(ClipperLib.ClipType.ctIntersection, visionPaths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
        clipper.Clear();

        this.result = visionPaths;
    }
}

class CommitPendingTask extends Task {
    constructor({ id, explored = [], pending = [] }) {
        super();

        this.id = id;
        this.explored = explored;
        this.pending = pending;
    }

    * _run() {
        const exploredPaths = this.explored;

        for (const pendingPaths of this.pending) {
            yield;

            clipper.AddPaths(exploredPaths, ClipperLib.PolyType.ptSubject, true);
            clipper.AddPaths(pendingPaths, ClipperLib.PolyType.ptClip, true);
            clipper.Execute(ClipperLib.ClipType.ctUnion, exploredPaths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
            clipper.Clear();
        }

        this.result = exploredPaths;
    }
}
