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

export { OpenAIClient };
