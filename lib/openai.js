class OpenAIClient {
  // fetchImpl is injectable so tests can mock API responses without network
  // access or an external dependency.
  constructor({ apiKey, baseUrl = "https://api.openai.com/v1", fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  // Sends one Responses API request and normalizes API/JSON failures into
  // regular Error objects for the CLI to display.
  async createResponse(body) {
    const response = await this.fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`OpenAI returned invalid JSON (HTTP ${response.status}): ${text}`);
    }

    if (!response.ok) {
      const message = data.error?.message || JSON.stringify(data);
      throw new Error(`OpenAI API error (HTTP ${response.status}): ${message}`);
    }
    return data;
  }
}

function inputText(input = []) {
  return input
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "input_text")
    .map((content) => content.text)
    .join("\n");
}

function toolMessages(input = []) {
  return input
    .filter((item) => item.type === "function_call_output")
    .map((item) => ({
      role: "tool",
      content: item.output,
      tool_name: item.call_id,
    }));
}

function ollamaToolDefinition(tool) {
  if (tool.type === "mcp") return null;
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function stringifyToolArguments(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value || {});
}

function ollamaToolsUnsupported(status, data, raw) {
  const message = String(data?.error || raw || "");
  return status === 400 && /does not support tools/i.test(message);
}

class OllamaClient {
  constructor({ baseUrl = "http://localhost:11434", fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.messages = [];
  }

  async createResponse(body) {
    const text = inputText(body.input);
    if (!body.previous_response_id) {
      this.messages = [{ role: "system", content: body.instructions }];
    }
    this.messages.push(...toolMessages(body.input));
    if (text) this.messages.push({ role: "user", content: text });

    const tools = (body.tools || []).map(ollamaToolDefinition).filter(Boolean);
    const requestBody = {
      model: body.model,
      messages: this.messages,
      stream: false,
    };
    if (tools.length > 0) requestBody.tools = tools;

    let response = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    let raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${raw}`);
    }
    if (!response.ok && tools.length > 0 && ollamaToolsUnsupported(response.status, data, raw)) {
      response = await this.fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...requestBody, tools: undefined }),
      });
      raw = await response.text();
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Ollama returned invalid JSON (HTTP ${response.status}): ${raw}`);
      }
    }
    if (!response.ok) {
      throw new Error(`Ollama API error (HTTP ${response.status}): ${data.error || raw}`);
    }

    const message = data.message || {};
    this.messages.push({
      role: "assistant",
      content: message.content || "",
      tool_calls: message.tool_calls,
    });

    const id = `ollama_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toolCalls = (message.tool_calls || []).map((call, index) => ({
      type: "function_call",
      name: call.function?.name || call.name,
      call_id: call.id || `call_${index + 1}`,
      arguments: stringifyToolArguments(call.function?.arguments || call.arguments),
    }));

    if (toolCalls.length > 0) return { id, output: toolCalls };
    return {
      id,
      output_text: message.content || "",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: message.content || "" }],
      }],
    };
  }
}

function createModelClient({
  provider = process.env.AI_PROVIDER || "openai",
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl,
  fetchImpl = fetch,
} = {}) {
  if (provider === "ollama") {
    return new OllamaClient({
      baseUrl: baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      fetchImpl,
    });
  }
  return new OpenAIClient({
    apiKey,
    baseUrl: baseUrl || process.env.OPENAI_BASE_URL,
    fetchImpl,
  });
}

export { OpenAIClient, OllamaClient, createModelClient };
