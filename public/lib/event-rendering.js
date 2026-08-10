function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function describeAgentEvent(event) {
  if (event.type === "composer_start") return `Input Composer refining with ${event.model}`;
  if (event.type === "composer_complete") return `Input Composer refined prompt: ${event.refinedPrompt}`;
  if (event.type === "start") return "Run started";
  if (event.type === "turn") return `Model turn ${event.turn}`;
  if (event.type === "response") return `Response ${event.id}`;
  if (event.type === "tool_start") return `Tool started: ${event.name}`;
  if (event.type === "tool_result") {
    return `Tool ${event.output?.ok === false ? "failed" : "completed"}: ${event.name}`;
  }
  if (event.type === "validation") {
    if (event.status === "passed") return `Validation passed: ${event.tool}`;
    if (event.status === "failed") return `Validation failed: ${event.tool}`;
    if (event.status === "pending") return "Validation pending";
    return "Validation required";
  }
  if (event.type === "mcp_call") return `MCP call: ${event.server}.${event.name}`;
  if (event.type === "approval_request") return `Approval requested: ${event.server}.${event.name}`;
  if (event.type === "approval_response") {
    return `Approval ${event.approved ? "granted" : "denied"}: ${event.server}.${event.name}`;
  }
  if (event.type === "final") return "Final answer received";
  return event.type;
}

function eventIcon(title) {
  const value = title.toLowerCase();
  if (value.includes("validation")) return "♢";
  if (value.includes("error") || value.includes("failed") || value.includes("denied")) return "!";
  if (value.includes("tool") || value.includes("command")) return "⌘";
  if (value.includes("approval")) return "✓";
  if (value.includes("response") || value.includes("answer")) return "↳";
  if (value.includes("prompt") || value.includes("message")) return "→";
  if (value.includes("model") || value.includes("provider")) return "◇";
  if (value.includes("socket") || value.includes("connected")) return "●";
  if (value.includes("config") || value.includes("workspace")) return "⚙";
  return "·";
}

function appendEvent(element, { title, detail, timestamp, className = "", open = false }) {
  const item = document.createElement("li");
  if (className) item.className = className;
  const disclosure = document.createElement("details");
  disclosure.open = open;
  const summary = document.createElement("summary");
  const icon = document.createElement("span");
  icon.className = "eventIcon";
  icon.textContent = eventIcon(title);
  icon.setAttribute("aria-hidden", "true");

  const heading = document.createElement("span");
  heading.className = "eventTitle";
  heading.textContent = title;

  const stamp = document.createElement("time");
  const eventDate = new Date(timestamp || Date.now());
  stamp.dateTime = eventDate.toISOString();
  stamp.textContent = eventDate.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const chevron = document.createElement("span");
  chevron.className = "eventChevron";
  chevron.textContent = "›";
  chevron.setAttribute("aria-hidden", "true");
  summary.append(icon, heading, stamp, chevron);

  const pre = document.createElement("pre");
  pre.textContent = formatJson({ type: title, ...(detail !== undefined ? { detail } : {}) });
  disclosure.append(summary, pre);
  item.append(disclosure);
  element.append(item);
  element.scrollTop = element.scrollHeight;
  return item;
}

function renderEventList(element, events) {
  element.replaceChildren();
  for (const event of events) appendEvent(element, event);
}

export { appendEvent, describeAgentEvent, eventIcon, formatJson, renderEventList };
