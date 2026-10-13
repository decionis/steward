import {
  ModelClient,
  ModelRequest,
  ModelResponse,
  PreviewError,
} from "./ModelClient";

export class AzureModelClient implements ModelClient {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly transport: typeof fetch = fetch,
  ) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.(openai|cognitiveservices|services\.ai)\.azure\.com$/i.test(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname) ||
      (url.port && url.port !== "443")
    ) {
      throw new PreviewError("MODEL_NOT_CONFIGURED");
    }
    if (!apiKey || !model) throw new PreviewError("MODEL_NOT_CONFIGURED");
  }

  static fromEnvironment(): AzureModelClient {
    if (process.env.PREVIEW_LLM_ENABLED !== "1")
      throw new PreviewError("PREVIEW_PAUSED");
    return new AzureModelClient(
      process.env.AZURE_OPENAI_ENDPOINT ?? "",
      process.env.AZURE_OPENAI_API_KEY ?? "",
      process.env.PREVIEW_MODEL ?? "",
    );
  }

  async respond(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.transport(
      new URL("/openai/v1/responses", this.endpoint),
      {
        method: "POST",
        headers: { "api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 1500,
          include: ["reasoning.encrypted_content"],
          instructions: request.instructions,
          input: request.input,
          tools: request.tools,
          tool_choice: { type: "function", name: request.toolName },
          parallel_tool_calls: false,
        }),
        signal: request.signal,
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new PreviewError("MODEL_UNAVAILABLE");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new PreviewError("INVALID_MODEL_RESPONSE");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 100_000) {
        await reader.cancel();
        throw new PreviewError("INVALID_MODEL_RESPONSE");
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      status?: string;
      output?: unknown;
    };
    if (
      data.status !== "completed" ||
      !Array.isArray(data.output) ||
      data.output.length > 8 ||
      data.output.some((item) => !item || typeof item !== "object")
    )
      throw new PreviewError("INVALID_MODEL_RESPONSE");
    return { output: data.output };
  }
}
