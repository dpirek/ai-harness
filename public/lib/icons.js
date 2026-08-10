const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function workspaceExplorerIcon(className = "workspaceExplorerIcon") {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const folder = document.createElementNS(SVG_NAMESPACE, "path");
  folder.setAttribute("d", "M3.5 6.5h6l2 2h9v9.25a1.75 1.75 0 0 1-1.75 1.75H5.25a1.75 1.75 0 0 1-1.75-1.75V6.5Z");
  folder.setAttribute("stroke", "currentColor");
  folder.setAttribute("stroke-width", "1.8");
  folder.setAttribute("stroke-linejoin", "round");

  const divider = document.createElementNS(SVG_NAMESPACE, "path");
  divider.setAttribute("d", "M3.5 10.5h17M7 13.5h6M7 16.5h9");
  divider.setAttribute("stroke", "currentColor");
  divider.setAttribute("stroke-width", "1.6");
  divider.setAttribute("stroke-linecap", "round");

  svg.append(folder, divider);
  return svg;
}
