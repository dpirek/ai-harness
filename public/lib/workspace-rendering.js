const FILE_ICONS = {
  js: "JS", mjs: "JS", cjs: "JS", json: "{}", html: "‹›", css: "#",
  md: "ⓘ", png: "▧", jpg: "▧", jpeg: "▧", svg: "◇",
};

function renderWorkspaceNodes(nodes, parent, { onOpenFile, onSelectFolder }) {
  for (const node of nodes) {
    if (node.type === "directory") {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.setAttribute("aria-expanded", "false");
      details.addEventListener("toggle", () => summary.setAttribute("aria-expanded", String(details.open)));
      const chevron = document.createElement("span"); chevron.className = "treeChevron"; chevron.textContent = "›";
      const icon = document.createElement("span"); icon.className = "treeIcon"; icon.textContent = "▱";
      const name = document.createElement("span"); name.className = "workspaceFileName"; name.textContent = node.name;
      const select = document.createElement("button"); select.type = "button"; select.className = "selectFolderButton";
      select.textContent = "✓"; select.title = `Use ${node.name} as workspace`; select.setAttribute("aria-label", select.title);
      select.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation(); onSelectFolder(node.path);
      });
      summary.append(chevron, icon, name, select);
      const children = document.createElement("div"); children.className = "workspaceChildren";
      renderWorkspaceNodes(node.children || [], children, { onOpenFile, onSelectFolder });
      details.append(summary, children); parent.append(details);
      continue;
    }

    const file = document.createElement("div"); file.className = "workspaceFile";
    const spacer = document.createElement("span"); spacer.className = "treeChevron";
    const extension = node.name.split(".").pop().toLowerCase();
    const icon = document.createElement("span"); icon.className = `treeIcon treeIcon-${extension}`;
    icon.textContent = FILE_ICONS[extension] || "·";
    const name = document.createElement("span"); name.className = "workspaceFileName"; name.textContent = node.name;
    file.tabIndex = 0; file.setAttribute("role", "button"); file.setAttribute("aria-label", `Edit ${node.name}`);
    file.addEventListener("click", () => onOpenFile(node));
    file.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); onOpenFile(node);
    });
    file.append(spacer, icon, name); parent.append(file);
  }
}

function renderWorkspacePicker(element, rootPath, nodes, { onChoose, onConfirm }) {
  element.replaceChildren();
  const renderNodes = (items, parent) => {
    for (const node of items.filter((item) => item.type === "directory")) {
      const details = document.createElement("details");
      const summary = document.createElement("summary"); summary.className = "workspacePickerOption";
      summary.dataset.path = node.path; summary.setAttribute("aria-expanded", "false");
      summary.innerHTML = '<span class="workspacePickerChevron" aria-hidden="true">›</span><span aria-hidden="true">▱</span><span></span>';
      summary.lastElementChild.textContent = node.name;
      summary.addEventListener("click", () => onChoose(node.path));
      summary.addEventListener("dblclick", () => { onChoose(node.path); onConfirm(); });
      details.addEventListener("toggle", () => summary.setAttribute("aria-expanded", String(details.open)));
      const children = document.createElement("div"); children.className = "workspacePickerChildren";
      renderNodes(node.children || [], children);
      details.append(summary, children); parent.append(details);
    }
  };
  const root = document.createElement("button"); root.type = "button"; root.className = "workspacePickerOption";
  root.dataset.path = rootPath; root.textContent = `▱  ${rootPath.split("/").pop() || rootPath}`;
  root.addEventListener("click", () => onChoose(rootPath));
  element.append(root); renderNodes(nodes, element);
}

export { renderWorkspaceNodes, renderWorkspacePicker };
