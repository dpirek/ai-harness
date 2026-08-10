import BaseComponent from "./base-component.js";

class RigIO extends BaseComponent {
  constructor({
    title = "INPUT",
    tokenCount = 0,
    direction = "input",
    color = "#e84431",
    signalLevel = 0,
    handlers = {},
  } = {}) {
    super();
    this.props = { title, tokenCount, direction, color, signalLevel, handlers };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "io", "signal-level", `io-${this.props.direction}`);
    this.style.setProperty("--io-accent", this.props.color);
    this.style.setProperty("--signal-level", `${Math.max(0, Math.min(100, this.props.signalLevel))}%`);
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.tokenCount} tokens`);
    if (typeof this.props.handlers.click === "function") {
      this.setAttribute("role", "button");
      this.tabIndex = 0;
    }
    this.render();
    for (const [eventName, handler] of Object.entries(this.props.handlers)) {
      if (typeof handler === "function") this.addEventListener(eventName, handler);
    }
  }

  render() {
    this.appendChildren(this, [
      this.createElement("strong", { textContent: this.props.title }),
      this.createElement("small", { class: "token-count", textContent: this.formatTokenCount() }),
      this.createElement("div", {
        class: "signal-meter",
        role: "meter",
        "aria-label": `${this.props.title} signal level`,
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(Math.max(0, Math.min(100, this.props.signalLevel))),
        children: [this.createElement("span", { class: "signal-fill", "aria-hidden": "true" })],
      }),
      this.createElement("span", { class: "signal-caption", textContent: "SIGNAL" }),
    ]);
  }

  formatTokenCount() {
    return `${this.props.tokenCount.toLocaleString()} TOKENS`;
  }

  setTokenCount(tokenCount, relativeMaximum = tokenCount) {
    this.props.tokenCount = Math.max(0, Number(tokenCount) || 0);
    const maximum = Math.max(1, Number(relativeMaximum) || 0);
    const signalLevel = Math.min(100, (this.props.tokenCount / maximum) * 100);
    this.style.setProperty("--signal-level", `${signalLevel}%`);
    this.querySelector(".token-count").textContent = this.formatTokenCount();
    const meter = this.querySelector(".signal-meter");
    meter.setAttribute("aria-valuenow", String(Math.round(signalLevel)));
    meter.setAttribute("aria-valuetext", `${this.props.tokenCount.toLocaleString()} tokens`);
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.tokenCount} tokens`);
  }
}

customElements.define("rig-io", RigIO);
export default RigIO;
