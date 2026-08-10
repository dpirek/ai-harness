import BaseComponent from "./base-component.js";

class MidiKeyboard extends BaseComponent {
  constructor({ handlers = {} } = {}) {
    super();
    this.handlers = handlers;
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "midi-keyboard-unit");
    this.setAttribute("role", "button");
    this.setAttribute("aria-label", "MIDI keyboard input; activate to switch to microphone");
    this.tabIndex = 0;
    this.render();
    for (const [eventName, handler] of Object.entries(this.handlers)) {
      if (typeof handler === "function") this.addEventListener(eventName, handler);
    }
  }

  render() {
    const whiteKeys = Array.from({ length: 12 }, (_, index) => this.createElement("rect", {
      x: String(19 + (index * 12)),
      y: "101",
      width: "11",
      height: "58",
      rx: "1.5",
      class: "midi-white-key",
    }));
    const blackKeyOffsets = [1, 2, 4, 5, 6, 8, 9, 11];
    const blackKeys = blackKeyOffsets.map((offset) => this.createElement("rect", {
      x: String(15 + (offset * 12)),
      y: "101",
      width: "8",
      height: "35",
      rx: "1.5",
      class: "midi-black-key",
    }));

    this.append(this.createElement("svg", {
      class: "midi-keyboard-art",
      viewBox: "0 0 180 242",
      "aria-hidden": "true",
      focusable: "false",
      children: [
        this.createElement("rect", { x: "147", y: "118.5", width: "33", height: "5", class: "midi-signal-lead" }),
        this.createElement("g", { transform: "translate(90 121) rotate(90) scale(1.5 1) translate(-90 -121)", children: [
          this.createElement("rect", { x: "10", y: "69", width: "160", height: "101", rx: "8", class: "midi-case-shadow" }),
          this.createElement("rect", { x: "10", y: "64", width: "160", height: "101", rx: "8", class: "midi-case" }),
          this.createElement("rect", { x: "19", y: "74", width: "49", height: "19", rx: "3", class: "midi-display" }),
          this.createElement("text", { x: "27", y: "87", class: "midi-display-text", textContent: "MIDI" }),
          this.createElement("circle", { cx: "81", cy: "83", r: "5", class: "midi-dial" }),
          this.createElement("circle", { cx: "97", cy: "83", r: "5", class: "midi-dial" }),
          this.createElement("circle", { cx: "113", cy: "83", r: "5", class: "midi-dial" }),
          this.createElement("rect", { x: "126", y: "77", width: "13", height: "11", rx: "2", class: "midi-pad" }),
          this.createElement("rect", { x: "144", y: "77", width: "13", height: "11", rx: "2", class: "midi-pad" }),
          this.createElement("circle", { cx: "160", cy: "70", r: "3", class: "midi-led" }),
          ...whiteKeys,
          ...blackKeys,
        ] }),
      ],
    }));
  }
}

customElements.define("midi-keyboard", MidiKeyboard);
export default MidiKeyboard;
