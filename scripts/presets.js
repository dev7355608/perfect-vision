export const presets = {
    "fvtt": {
        dimVisionInDarkness: "dim",
        dimVisionInDimLight: "dim",
        brightVisionInDarkness: "bright",
        brightVisionInDimLight: "bright"
    },
    "dnd35e": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "dim",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "dim"
    },
    "dnd5e": {
        dimVisionInDarkness: "dim_mono",
        dimVisionInDimLight: "bright",
        brightVisionInDarkness: "bright",
        brightVisionInDimLight: "bright"
    },
    "pf1e": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "dim",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "dim"
    },
    "pf2e": {
        dimVisionInDarkness: "darkness",
        dimVisionInDimLight: "bright",
        brightVisionInDarkness: "bright_mono",
        brightVisionInDimLight: "bright"
    },
};

Hooks.once("init", () => {
    for (const [id, preset] of Object.entries(presets))
        preset._id = id;

    presets["default"] = presets[game.system.id === "dnd5e" ? "dnd5e" : (game.system.id === "pf1" ? "pf1e" : (game.system.id === "pf2e" ? "pf2e" : (game.system.id === "D35E" ? "dnd35e" : "fvtt")))];
});
