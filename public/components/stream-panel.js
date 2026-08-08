import BaseComponent from "./base-component.js";

class StreamPanel extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.render();
  }

  render() {
    this.setAttribute("role", "complementary");
    this.setAttribute("aria-label", "Live interaction stream");
    this.innerHTML = `
      <div class="streamHeader">
        <div><h2>Stream</h2><span>Live interactions</span></div>
        <button id="clearEventsButton" type="button">Clear</button>
      </div>
      <ol id="eventList" class="eventList"></ol>`;
    this.querySelector("#clearEventsButton").addEventListener("click", () => this.emit("clear-stream"));
  }
}

customElements.define("stream-panel", StreamPanel);

export default StreamPanel;
