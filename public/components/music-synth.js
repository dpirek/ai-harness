import BaseComponent from "./base-component.js";

const DEFAULT_FLOW_NODES = [
  { label: "PROMPT", accent: "prompt", glyph: "PR" },
  { label: "LLM", accent: "llm", glyph: "AI" },
  { label: "TOOL", accent: "tool", glyph: "TL" },
  { label: "LLM", accent: "llm", glyph: "AI" },
  { label: "OUTPUT", accent: "output", glyph: "OUT" },
];

const DEFAULT_MACROS = [
  { label: "CONTEXT", accent: "prompt" },
  { label: "DYNAMICS", accent: "llm" },
  { label: "ROUTING", accent: "tool" },
  { label: "RESPONSE", accent: "output" },
];

const DEFAULT_GRAPHS = [
  {
    label: "ENV 1",
    accent: "llm",
    type: "envelope",
    points: "5,14 22,14 40,14 58,72 76,100 94,112",
  },
  {
    label: "LFO 2",
    accent: "llm",
    type: "steps",
    points: "6,50 20,50 20,52 20,50 34,50 34,76 48,76 48,50 62,50 62,54 76,54 76,50 90,50 90,72 104,72 104,50 118,50 118,60 132,60 132,50 146,50",
  },
  {
    label: "NOTE",
    accent: "tool",
    type: "ramp",
    points: "8,108 42,76 74,46 106,14",
  },
  {
    label: "VELO",
    accent: "prompt",
    type: "steps",
    points: "8,96 24,96 24,78 40,78 40,62 56,62 56,46 72,46 72,34 88,34 88,22 104,22",
  },
];

class MusicSynth extends BaseComponent {
  constructor({
    title = "GRAPH SYNTH",
    subtitle = "AI WORKFLOW SYNTH",
    presetNumber = "001",
    presetName = "Default Harness",
    masterLevel = 72,
    bypassed = false,
    flowNodes = DEFAULT_FLOW_NODES,
    graphs = DEFAULT_GRAPHS,
    macros = DEFAULT_MACROS,
    handlers = {},
  } = {}) {
    super();
    this.props = {
      title,
      subtitle,
      presetNumber,
      presetName,
      masterLevel,
      bypassed,
      flowNodes,
      graphs,
      macros,
      handlers,
    };
  }

  connectedCallback() {
    if (this.childElementCount) return;
    this.classList.add("unit", "synth");
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.presetName}`);
    if (typeof this.props.handlers.click === "function") {
      this.setAttribute("role", "button");
      this.tabIndex = 0;
    }
    this.render();
    this.setPreset(this.props.presetNumber, this.props.presetName);
    this.setMasterLevel(this.props.masterLevel);
    this.setBypassed(this.props.bypassed, false);
    for (const [eventName, handler] of Object.entries(this.props.handlers)) {
      if (["prevPreset", "nextPreset", "toggleBypass"].includes(eventName)) continue;
      if (typeof handler === "function") {
        this.addEventListener(eventName, (event) => {
          if (event.target.closest?.(".synth-button")) return;
          handler(event);
        });
      }
    }
    this.bindAction("prev", "prevPreset");
    this.bindAction("next", "nextPreset");
    this.bindAction("bypass", "toggleBypass");
  }

  bindAction(action, handlerName) {
    const button = this.querySelector(`[data-synth-action="${action}"]`);
    const handler = this.props.handlers[handlerName];
    if (typeof handler !== "function" || !button) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
    });
  }

  renderFlowNode({ label, accent, glyph }) {
    return this.createElement("div", { class: `synth-flow-node synth-${accent}`, children: [
      this.createElement("div", { class: "synth-flow-icon", children: [
        this.createElement("span", { textContent: glyph }),
      ] }),
      this.createElement("strong", { textContent: label }),
    ] });
  }

  renderMacro({ label, accent }) {
    return this.createElement("div", { class: `synth-macro synth-${accent}`, children: [
      this.createElement("div", { class: "synth-knob", children: [
        this.createElement("i", { class: "synth-knob-cap", "aria-hidden": "true" }),
      ] }),
      this.createElement("small", { textContent: label }),
    ] });
  }

  renderGraph({ label, accent, type, points }) {
    const graphId = `graph-grid-${label.toLowerCase().replace(/\s+/g, "-")}`;
    const svgChildren = [];
    if (type === "steps") {
      svgChildren.push(this.createElement("polyline", {
        class: "synth-graph-line",
        points,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }));
      const dots = points
        .split(" ")
        .map((point) => point.split(","))
        .filter(([x, y], index) => index % 2 === 0 && x && y)
        .map(([x, y]) => this.createElement("circle", {
          class: "synth-graph-dot",
          cx: x,
          cy: y,
          r: "2.4",
        }));
      svgChildren.push(...dots);
    } else {
      svgChildren.push(this.createElement("polyline", {
        class: "synth-graph-line",
        points,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }));
    }

    if (type === "envelope" || type === "ramp") {
      svgChildren.push(this.createElement("polyline", {
        class: "synth-graph-fill-edge",
        points: `${points} 106,112 8,112`,
        fill: "rgba(63, 142, 224, 0.18)",
        stroke: "none",
      }));
    }

    return this.createElement("div", { class: `synth-graph synth-${accent}`, children: [
      this.createElement("div", { class: "synth-graph-head", children: [
        this.createElement("span", { textContent: label }),
      ] }),
      this.createElement("div", { class: `synth-graph-screen synth-graph-${type}`, children: [
        this.createElement("svg", {
          class: "synth-graph-svg",
          viewBox: "0 0 112 120",
          preserveAspectRatio: "none",
          children: [
            this.createElement("defs", {
              children: [
                this.createElement("pattern", {
                  id: graphId,
                  width: "16",
                  height: "16",
                  patternUnits: "userSpaceOnUse",
                  children: [
                    this.createElement("path", {
                      d: "M 16 0 L 0 0 0 16",
                      fill: "none",
                      stroke: "rgba(255,255,255,0.05)",
                      "stroke-width": "1",
                    }),
                  ],
                }),
              ],
            }),
            this.createElement("rect", {
              x: "0",
              y: "0",
              width: "112",
              height: "120",
              fill: `url(#${graphId})`,
            }),
            ...svgChildren,
          ],
        }),
      ] }),
    ] });
  }

  render() {
    const flowSequence = [];
    // this.props.flowNodes.forEach((node, index) => {
    //   if (index > 0) flowSequence.push(this.createElement("i", { class: "synth-flow-connector", "aria-hidden": "true" }));
    //   flowSequence.push(this.renderFlowNode(node));
    // });

    this.appendChildren(this, [
      this.createElement("div", { class: "synth-main", children: [
        this.createElement("div", { class: "synth-brand", children: [
          this.createElement("strong", { textContent: this.props.title }),
          this.createElement("small", { textContent: this.props.subtitle }),
        ] }),
        this.createElement("section", { class: "synth-flow-panel", children: [
          this.createElement("header", { children: [
            this.createElement("span", { textContent: "SIGNAL FLOW" }),
            this.createElement("i", { class: "synth-flow-rule", "aria-hidden": "true" }),
          ] }),
          //this.createElement("div", { class: "synth-flow-sequence", children: flowSequence }),
          this.createElement("div", { class: "synth-graph-row", children: this.props.graphs.map((graph) => this.renderGraph(graph)) }),
          this.createElement("div", { class: "synth-macro-row", children: this.props.macros.map((macro) => this.renderMacro(macro)) }),
        ] }),
      ] }),
    ]);
  }

  setPreset(number, name) {
    this.props.presetNumber = String(number || "001").trim() || "001";
    this.props.presetName = String(name || "Default Harness").trim() || "Default Harness";
    const numberNode = this.querySelector(".synth-preset-number");
    const nameNode = this.querySelector(".synth-preset-name");
    if (numberNode) numberNode.textContent = this.props.presetNumber;
    if (nameNode) nameNode.textContent = this.props.presetName;
    this.setAttribute("aria-label", `${this.props.title}: ${this.props.presetName}`);
  }

  setModel(model) {
    this.props.model = String(model || "").trim();
    this.title = this.props.model ? `Current model: ${this.props.model}` : this.props.title;
  }

  setMasterLevel(level) {
    const value = Math.max(0, Math.min(100, Number(level) || 0));
    this.props.masterLevel = value;
    const litBars = Math.max(1, Math.round((value / 100) * 12));
    this.querySelectorAll(".synth-master-meter-bar").forEach((bar, index) => {
      bar.classList.toggle("is-lit", index >= (12 - litBars));
    });
  }

  setBypassed(bypassed, emit = true) {
    const value = bypassed === true;
    this.props.bypassed = value;
    this.classList.toggle("synth-bypassed", value);
    const button = this.querySelector(".synth-bypass-button");
    button?.setAttribute("aria-pressed", String(value));
    if (emit) {
      this.dispatchEvent(new CustomEvent("synth-bypass-toggle", {
        bubbles: true,
        detail: { bypassed: value },
      }));
    }
  }
}

customElements.define("music-synth", MusicSynth);
export default MusicSynth;
