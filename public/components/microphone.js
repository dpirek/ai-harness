import BaseComponent from "./base-component.js";

class Microphone extends BaseComponent {
  constructor({ title = "Microphone", subtitle = "Capture", handlers = {} } = {}) {
    super();
    this.props = { title, subtitle, handlers };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "microphone-unit");
    this.setAttribute("role", "button");
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.subtitle}`);
    this.tabIndex = 0;
    this.render();
    for (const [eventName, handler] of Object.entries(this.props.handlers)) {
      if (typeof handler === "function") this.addEventListener(eventName, handler);
    }
  }

  gradient(id, stops) {
    return this.createElement("linearGradient", {
      id,
      x1: "0",
      y1: "0",
      x2: "1",
      y2: "0",
      children: stops.map(([offset, color]) => this.createElement("stop", {
        offset,
        "stop-color": color,
      })),
    });
  }

  render() {
    const grilleLines = [];
    for (let y = 28; y <= 91; y += 7) {
      grilleLines.push(this.createElement("path", {
        d: `M43 ${y}h54`,
        class: "microphone-grille-line",
      }));
    }
    for (let x = 47; x <= 93; x += 8) {
      grilleLines.push(this.createElement("path", {
        d: `M${x} 20l-10 76M${x + 6} 20l10 76`,
        class: "microphone-grille-line microphone-grille-diagonal",
      }));
    }

    this.append(this.createElement("svg", {
      class: "microphone-art",
      viewBox: "0 0 140 242",
      "aria-hidden": "true",
      focusable: "false",
      children: [
        this.createElement("defs", { children: [
          this.gradient("mic-metal", [["0", "#25282a"], [".18", "#d9dcdb"], [".42", "#575c5e"], [".62", "#f0f1ed"], [".82", "#4b5052"], ["1", "#17191a"]]),
          this.gradient("mic-dark-metal", [["0", "#101213"], [".48", "#777d7e"], [".58", "#25292a"], ["1", "#090a0b"]]),
        ] }),
        this.createElement("ellipse", { cx: "70", cy: "225", rx: "55", ry: "12", class: "microphone-shadow" }),
        this.createElement("rect", { x: "94", y: "118.5", width: "46", height: "5", class: "microphone-signal-lead" }),
        this.createElement("ellipse", { cx: "70", cy: "214", rx: "50", ry: "16", class: "microphone-base" }),
        this.createElement("rect", { x: "65", y: "151", width: "10", height: "59", rx: "5", class: "microphone-stem" }),
        this.createElement("ellipse", { cx: "70", cy: "207", rx: "13", ry: "7", class: "microphone-collar" }),
        this.createElement("path", { d: "M35 92v34c0 28 16 43 35 43s35-15 35-43V92", class: "microphone-yoke" }),
        this.createElement("circle", { cx: "35", cy: "99", r: "6", class: "microphone-pivot" }),
        this.createElement("circle", { cx: "105", cy: "99", r: "6", class: "microphone-pivot" }),
        this.createElement("path", { d: "M42 83v30c0 24 12 37 28 37s28-13 28-37V83Z", class: "microphone-body" }),
        this.createElement("path", { d: "M42 83h56v25H42Z", class: "microphone-band" }),
        this.createElement("path", { d: "M43 34a27 27 0 0 1 54 0v57H43Z", class: "microphone-grille" }),
        ...grilleLines,
        this.createElement("rect", { x: "39", y: "86", width: "62", height: "12", rx: "4", class: "microphone-ring" }),
        this.createElement("path", { d: "M45 104h50", class: "microphone-ring-detail" }),
        this.createElement("circle", { cx: "70", cy: "217", r: "3", class: "microphone-led" }),
      ],
    }));
  }
}

customElements.define("rig-microphone", Microphone);
export default Microphone;
