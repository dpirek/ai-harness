import BaseComponent from "./base-component.js";

class GuitarEffect extends BaseComponent {
  constructor({ color = "#555", icon = "#wave", title = "Effect", subtitle = "Module", handlers = {} } = {}) {
    super();
    this.props = { color, icon, title, subtitle, handlers };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "pedal");
    this.style.setProperty("--pedal", this.props.color);
    this.setAttribute("role", "button");
    this.tabIndex = 0;
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.subtitle}`);
    this.render();
    for (const [eventName, handler] of Object.entries(this.props.handlers)) {
      if (typeof handler === "function") this.addEventListener(eventName, handler);
    }
  }

  render() {
    this.appendChildren(this, [
      this.createElement("div", { class: "led" }),
      this.createElement("div", { class: "knobs", children: [
        this.createElement("i", { class: "knob" }),
        this.createElement("i", { class: "knob" }),
        this.createElement("i", { class: "knob" }),
      ] }),
      this.createElement("svg", {
        "aria-hidden": "true",
        focusable: "false",
        viewBox: "0 0 64 64",
        children: [this.createElement("use", { href: this.props.icon })],
      }),
      this.createElement("b", { textContent: this.props.title }),
      this.createElement("span", { textContent: this.props.subtitle }),
    ]);
  }
}

customElements.define("guitar-effect", GuitarEffect);
export default GuitarEffect;
