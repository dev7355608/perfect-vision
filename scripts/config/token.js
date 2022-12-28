Hooks.on("renderTokenConfig", (sheet, html) => {
    const document = sheet.object;
    const sightRange = html[0].querySelector(`input[name="sight.range"]`);

    sightRange.placeholder = "0";
    sightRange.closest(".form-group").querySelector(".hint").innerHTML = "The distance a token can see with/without light.";
    sightRange.insertAdjacentHTML("beforebegin", `<label>In darkness</label>`);
    sightRange.insertAdjacentHTML("afterend", `\
        <label>In light</label>
        <input type="number" name="flags.perfect-vision.sight.range" min="0" step="any"
            placeholder="&#xF534;" class="perfect-vision--range"
            value="${foundry.utils.getProperty(document, "flags.perfect-vision.sight.range") ?? ""}">`);

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
