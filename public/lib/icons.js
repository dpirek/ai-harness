const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const SVG_CONFIGS = {
  wave: {
    viewBox: "0 0 48 36",
    nodes: [
      ["path", {
        d: "M1 18h5l3-9 4 21 4-29 4 34 4-25 4 15 4-20 4 23 3-10h5",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "3",
        "stroke-linejoin": "round",
      }],
    ],
  },
  tools: {
    viewBox: "0 0 64 64",
    nodes: [
      ["path", {
        d: "M54 9a14 14 0 0 0-17 17L10 53a5 5 0 0 0 7 7l27-27A14 14 0 0 0 60 16l-9 9-8-2-2-8z",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }],
      ["circle", { cx: "16", cy: "54", r: "2.5", fill: "currentColor" }],
    ],
  },
  clip: {
    viewBox: "0 0 64 64",
    nodes: [
      ["path", {
        d: "M21 11h22v8H21zm-7 5h36v42H14zM22 31l5 5 11-12M22 47h20",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "4",
      }],
    ],
  },
  server_rig: {
    viewBox: "0 0 64 64",
    nodes: [
      ["path", {
        d: "M8 5v54M56 5v54M5 9h6M53 9h6M5 55h6M53 55h6",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "4",
        "stroke-linecap": "round",
      }],
      ["rect", { x: "12", y: "9", width: "40", height: "13", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "3" }],
      ["rect", { x: "12", y: "26", width: "40", height: "13", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "3" }],
      ["rect", { x: "12", y: "43", width: "40", height: "13", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "3" }],
      ["path", {
        d: "M18 15.5h17M18 32.5h17M18 49.5h17",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "3",
        "stroke-linecap": "round",
      }],
      ["circle", { cx: "45", cy: "15.5", r: "2.2", fill: "currentColor" }],
      ["circle", { cx: "45", cy: "32.5", r: "2.2", fill: "currentColor" }],
      ["circle", { cx: "45", cy: "49.5", r: "2.2", fill: "currentColor" }],
    ],
  },
  live_log: {
    viewBox: "0 0 24 24",
    nodes: [
      ["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "2" }],
      ["path", {
        d: "m7 9 3 3-3 3m6 0h4",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }],
    ],
  },
};

function createSvgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  return node;
}

function createConfiguredIcon(name, className) {
  const config = SVG_CONFIGS[name];
  if (!config) return null;
  const svg = createSvgNode("svg", {
    viewBox: config.viewBox,
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  if (className) svg.setAttribute("class", className);
  config.nodes.forEach(([tag, attrs]) => svg.append(createSvgNode(tag, attrs)));
  return svg;
}

export function workspaceExplorerIcon(className = "workspaceExplorerIcon") {
  const svg = createSvgNode("svg", {
    class: className,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  });

  const folder = createSvgNode("path", {
    d: "M3.5 6.5h6l2 2h9v9.25a1.75 1.75 0 0 1-1.75 1.75H5.25a1.75 1.75 0 0 1-1.75-1.75V6.5Z",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linejoin": "round",
  });

  const divider = createSvgNode("path", {
    d: "M3.5 10.5h17M7 13.5h6M7 16.5h9",
    stroke: "currentColor",
    "stroke-width": "1.6",
    "stroke-linecap": "round",
  });

  svg.append(folder, divider);
  return svg;
}

export function harnessWaveIcon(className = "") {
  return createConfiguredIcon("wave", className);
}

export function liveLogIcon(className = "header-log-icon") {
  return createConfiguredIcon("live_log", className);
}

export function harnessEffectIcon(name, className = "") {
  const normalizedName = name.startsWith("#") ? name.slice(1).replace(/-/g, "_") : name.replace(/-/g, "_");
  return createConfiguredIcon(normalizedName, className);
}
