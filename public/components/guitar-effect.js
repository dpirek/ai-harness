import BaseComponent from "./base-component.js";

class GuitarEffect extends BaseComponent {
  constructor({ color = "#555", icon = "#wave", title = "Effect", subtitle = "Module", step = "effect", enabled = true, handlers = {} } = {}) {
    super();
    this.props = { color, icon, title, subtitle, step, enabled, handlers };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "pedal");
    this.style.setProperty("--pedal", this.props.color);
    this.setAttribute("role", "button");
    this.tabIndex = 0;
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.subtitle}`);
    this.dataset.step = this.props.step;
    this.render();
    this.setEnabled(this.props.enabled, false);
    this.querySelector(".pedal-footswitch")?.addEventListener("keydown", (event) => event.stopPropagation());
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
      this.createElement("button", {
        class: "pedal-footswitch",
        type: "button",
        title: `Toggle ${this.props.title} ${this.props.subtitle}`,
        "aria-label": `Toggle ${this.props.title} ${this.props.subtitle}`,
        addEventListener: {
          name: "click",
          handler: (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.setEnabled(!this.enabled);
          },
        },
        children: [this.createElement("i", { "aria-hidden": "true" })],
      }),
    ]);
  }

  get enabled() {
    return this.getAttribute("aria-disabled") !== "true";
  }

  setEnabled(enabled, emit = true) {
    const value = enabled !== false;
    this.classList.toggle("effect-disabled", !value);
    this.setAttribute("aria-disabled", String(!value));
    const footswitch = this.querySelector(".pedal-footswitch");
    footswitch?.setAttribute("aria-pressed", String(value));
    if (emit) {
      this.dispatchEvent(new CustomEvent("effect-toggle", {
        bubbles: true,
        detail: { step: this.props.step, enabled: value },
      }));
    }
  }
}

customElements.define("guitar-effect", GuitarEffect);
export default GuitarEffect;
