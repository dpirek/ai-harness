import BaseComponent from "./base-component.js";

class CassettePlayer extends BaseComponent {
  constructor({
    title = "Cassette Player",
    subtitle = "Response Renderer",
    step = "response",
    tokenCount = 0,
    fileToolsEnabled = true,
    handlers = {},
  } = {}) {
    super();
    this.props = { title, subtitle, step, tokenCount, fileToolsEnabled, handlers };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "cassette-player-unit");
    this.setAttribute("role", "button");
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.subtitle}`);
    this.dataset.step = this.props.step;
    this.tabIndex = 0;
    this.render();
    this.setTokenCount(this.props.tokenCount);
    this.setFileToolsEnabled(this.props.fileToolsEnabled, false);
    this.querySelector(".cassette-file-toggle")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setFileToolsEnabled(!this.props.fileToolsEnabled);
    });
    this.querySelector(".cassette-file-toggle")?.addEventListener("keydown", (event) => event.stopPropagation());
    for (const [eventName, handler] of Object.entries(this.props.handlers)) {
      if (typeof handler === "function") this.addEventListener(eventName, handler);
    }
  }

  reel(cx) {
    const side = Number(cx) < 56 ? "left" : "right";
    return this.createElement("g", { class: `cassette-reel cassette-reel-${side}`, children: [
      this.createElement("circle", { cx, cy: "33", r: "14", class: "cassette-reel-shadow" }),
      this.createElement("circle", { cx, cy: "33", r: "11", class: "cassette-reel-ring" }),
      this.createElement("circle", { cx, cy: "33", r: "8", class: "cassette-reel-inner" }),
      this.createElement("circle", { cx, cy: "33", r: "4", class: "cassette-reel-hub" }),
      this.createElement("path", {
        d: `M${cx} 22v7M${cx} 37v7M${cx - 11} 33h7M${cx + 4} 33h7`,
        class: "cassette-reel-spokes",
      }),
      this.createElement("circle", { cx: String(Number(cx) + 6), cy: "27", r: "2.2", class: "cassette-reel-marker" }),
    ] });
  }

  meter(label) {
    return this.createElement("div", { class: "cassette-vu", children: [
      this.createElement("span", { textContent: "VU" }),
      this.createElement("i", { children: [this.createElement("em", { "aria-hidden": "true" })] }),
      this.createElement("small", { textContent: label }),
    ] });
  }

  render() {
    this.appendChildren(this, [
      this.createElement("div", { class: "cassette-player-heading", children: [
        this.createElement("div", { children: [
          this.createElement("i", { textContent: "W", "aria-hidden": "true" }),
          this.createElement("strong", { textContent: "CASSETTE" }),
        ] }),
        this.createElement("span", { class: "cassette-preset", textContent: "DEFAULT" }),
        this.createElement("span", { class: "cassette-token-counter", children: [
          this.createElement("small", { textContent: "TOK" }),
          this.createElement("strong", { textContent: this.formatTokenCount() }),
        ] }),
        this.createElement("span", { class: "cassette-player-mark", textContent: "↻", "aria-hidden": "true" }),
      ] }),
      this.createElement("div", { class: "cassette-console", children: [
        this.createElement("div", { class: "cassette-bay", children: [
          this.createElement("svg", {
            class: "cassette-player-art",
            viewBox: "0 0 112 72",
            "aria-hidden": "true",
            focusable: "false",
            children: [
              this.createElement("rect", { x: "3", y: "5", width: "106", height: "62", rx: "6", class: "cassette-shell" }),
              this.createElement("path", { d: "M8 13h96M8 59h96", class: "cassette-shell-seam" }),
              this.createElement("rect", { x: "10", y: "13", width: "92", height: "42", rx: "4", class: "cassette-window" }),
              this.createElement("path", { d: "M20 18h72l-5 29H25z", class: "cassette-window-glass" }),
              this.createElement("text", { x: "56", y: "20", class: "cassette-brand", textContent: "HARNESS MASTER" }),
              this.createElement("path", { d: "M28 55h56l8 12H20z", class: "cassette-lower-panel" }),
              this.reel("36"),
              this.reel("76"),
              this.createElement("path", { d: "M47 33h18", class: "cassette-tape" }),
              this.createElement("circle", { cx: "20", cy: "55", r: "3", class: "cassette-tape-guide" }),
              this.createElement("circle", { cx: "92", cy: "55", r: "3", class: "cassette-tape-guide" }),
              this.createElement("rect", { x: "25", y: "48", width: "62", height: "9", rx: "1", class: "cassette-label-strip" }),
              this.createElement("text", { x: "31", y: "54.5", class: "cassette-label-text", textContent: "A  RESPONSE MASTER" }),
              this.createElement("path", { d: "M76 49h10v7H76z", class: "cassette-label-accent" }),
              this.createElement("circle", { cx: "9", cy: "11", r: "2", class: "cassette-screw" }),
              this.createElement("circle", { cx: "103", cy: "11", r: "2", class: "cassette-screw" }),
              this.createElement("circle", { cx: "9", cy: "61", r: "2", class: "cassette-screw" }),
              this.createElement("circle", { cx: "103", cy: "61", r: "2", class: "cassette-screw" }),
              this.createElement("circle", { cx: "56", cy: "61", r: "2", class: "cassette-screw" }),
            ],
          }),
          this.createElement("div", { class: "cassette-playback", children: [
            this.createElement("b", { textContent: "A" }),
            this.createElement("i", { "aria-hidden": "true" }),
            this.createElement("b", { textContent: "60" }),
          ] }),
        ] }),
        this.createElement("div", { class: "cassette-vu-bank", children: [
          this.meter("IN"),
          this.meter("OUT"),
        ] }),
      ] }),
      this.createElement("div", { class: "cassette-transport", children: [
        this.createElement("i", { class: "cassette-control-rewind", textContent: "◀◀", title: "Rewind", "aria-label": "Rewind" }),
        this.createElement("i", { class: "cassette-control-play", textContent: "▶", title: "Play", "aria-label": "Play" }),
        this.createElement("i", { class: "cassette-control-stop", textContent: "■", title: "Stop", "aria-label": "Stop" }),
        this.createElement("i", { class: "cassette-control-forward", textContent: "▶▶", title: "Fast forward", "aria-label": "Fast forward" }),
        this.createElement("i", { class: "cassette-control-record", textContent: "●", title: "Record", "aria-label": "Record" }),
      ] }),
      this.createElement("button", { class: "cassette-file-toggle", type: "button", "aria-label": "Toggle file access tools", children: [
        this.createElement("small", { textContent: "FILES" }),
        this.createElement("strong", { textContent: "ON" }),
      ] }),
    ]);
  }

  formatTokenCount() {
    return Math.max(0, Number(this.props.tokenCount) || 0).toLocaleString();
  }

  setTokenCount(tokenCount) {
    this.props.tokenCount = Math.max(0, Number(tokenCount) || 0);
    const display = this.querySelector(".cassette-token-counter strong");
    if (display) display.textContent = this.formatTokenCount();
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.subtitle}; ${this.formatTokenCount()} output tokens`);
  }

  setFileToolsEnabled(fileToolsEnabled, emit = true) {
    const value = fileToolsEnabled === true;
    this.props.fileToolsEnabled = value;
    this.classList.toggle("cassette-file-tools-disabled", !value);
    const button = this.querySelector(".cassette-file-toggle");
    button?.setAttribute("aria-pressed", String(value));
    const state = button?.querySelector("strong");
    if (state) state.textContent = value ? "ON" : "OFF";
    if (emit) {
      this.dispatchEvent(new CustomEvent("file-tools-toggle", {
        bubbles: true,
        detail: { enabled: value },
      }));
    }
  }
}

customElements.define("cassette-player", CassettePlayer);
export default CassettePlayer;
