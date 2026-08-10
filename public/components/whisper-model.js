import BaseComponent from "./base-component.js";

class WhisperModel extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "whisper-model");
    this.setAttribute("role", "status");
    this.setAttribute("aria-label", "Whisper speech to text model");
    this.render();
  }

  render() {
    this.appendChildren(this, [
      this.createElement("div", { class: "whisper-case", children: [
        this.createElement("div", { class: "whisper-header", children: [
          this.createElement("span", { textContent: "SPEECH → TEXT" }),
          this.createElement("i", { class: "whisper-led", "aria-hidden": "true" }),
        ] }),
        this.createElement("svg", {
          class: "whisper-display",
          viewBox: "0 0 120 58",
          "aria-hidden": "true",
          focusable: "false",
          children: [
            this.createElement("path", { d: "M5 29h9l4-13 6 28 7-37 7 43 7-32 7 21 7-27 7 32 7-22 7 15 6-8h10", class: "whisper-wave" }),
            this.createElement("path", { d: "M84 17h29M84 29h29M84 41h22", class: "whisper-text-lines" }),
            this.createElement("line", { x1: "3", y1: "4", x2: "3", y2: "54", class: "whisper-scan-line" }),
          ],
        }),
        this.createElement("strong", { textContent: "WHISPER-1" }),
        this.createElement("small", { textContent: "TRANSCRIBER" }),
      ] }),
    ]);
  }
}

customElements.define("whisper-model", WhisperModel);
export default WhisperModel;
