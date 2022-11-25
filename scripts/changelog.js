Hooks.once("ready", () => {
    if (!game.user.isGM) {
        return;
    }

    game.settings.register(
        "perfect-vision",
        "changelog",
        {
            scope: "client",
            config: false,
            type: Number,
            default: 0
        }
    );

    new ChangelogBuilder()
        .addEntry({
            version: "4.0.0",
            title: "V10 Update",
            body: `\
                - **Lighting Drawings:** The UI has been overhauled, and the *Constrained By Walls* option was removed,
                  because it didn't really fit in that well. Perfect Vision makes *Global Illumination* completely
                  configurable. All settings you know from light sources are exposed including a new light setting:
                  *Animation Resolution*. This setting allows you to control the scale of the light animation.
                  Lighting drawings are compatible with the elevation changes introduced V10.
                - **Vision Limitation:** Built on what was formerly known as *Sight Limit* this feature allows
                  you to control the maximum range tokens can see based on vision/detection modes.
                  Furthermore, vision limitation is compatible with elevation and 3D-capable, and even roof/level
                  tiles are capable of defining these limitations now.`
        })
        .addEntry({
            version: "4.1.0",
            title: "",
            body: `\
                - Simplified the *Vision Limitation* config. Removed *Sound/Move/Other Limit*:
                  these limits didn't really serve any purpose. *Basic Sight* limit was also removed:
                  *Basic Sight* is now restricted by *Sight Limit*, which was renamed to *Vision Limit*.
                - Added the option to restrict the vision range of a token in illuminated areas.`
        })
        .build()
        ?.render(true);
});

class ChangelogBuilder {
    #entries = [];

    addEntry({ version, title = "", body }) {
        this.#entries.push({ version, title, body });

        return this;
    }

    build() {
        const converter = new showdown.Converter();
        const curr = game.settings.get("perfect-vision", "changelog");
        const next = this.#entries.length;
        let content = "";

        if (curr >= next) {
            return;
        }

        for (let [index, { version, title, body }] of this.#entries.entries()) {
            let entry = `<strong>v${version}</strong>${title ? ": " + title : ""}`;;

            if (index < curr) {
                entry = `<summary>${entry}</summary>`;
            } else {
                entry = `<h3>${entry}</h3>`;
            }

            let indentation = 0;

            while (body[indentation] === " ") indentation++;

            if (indentation) {
                body = body.replace(new RegExp(`^ {0,${indentation}}`, "gm"), "");
            }

            entry += converter.makeHtml(body);

            if (index < curr) {
                entry = `<details>${entry}</details><hr>`;
            } else if (index === curr) {
                entry += `<hr><hr>`;
            }

            content = entry + content;
        }

        return new Dialog({
            title: "Perfect Vision: Changelog",
            content,
            buttons: {
                view_documentation: {
                    icon: `<i class="fas fa-book"></i>`,
                    label: "View documentation",
                    callback: () => window.open("https://github.com/dev7355608/perfect-vision/blob/main/README.md")
                },
                dont_show_again: {
                    icon: `<i class="fas fa-times"></i>`,
                    label: "Don't show again",
                    callback: () => game.settings.set("perfect-vision", "changelog", next)
                }
            },
            default: "dont_show_again"
        });
    }
}
