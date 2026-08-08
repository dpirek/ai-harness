import BaseComponent from "./base-component.js";

class ColumnResizeHandle extends BaseComponent {
  connectedCallback() {
    this.setAttribute("role", "separator");
    this.setAttribute("aria-label", this.getAttribute("label") || "Resize column");
    this.setAttribute("aria-orientation", "vertical");
    this.tabIndex = 0;
    this.removeAttribute("label");
  }
}

customElements.define("column-resize-handle", ColumnResizeHandle);
