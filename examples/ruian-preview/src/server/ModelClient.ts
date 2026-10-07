export type ModelItem = Record<string, unknown>;
export interface ModelRequest {
  instructions: string;
  input: ModelItem[];
  tools: ModelItem[];
  toolName: string;
  signal: AbortSignal;
}
export interface ModelResponse {
  output: ModelItem[];
}
export interface ModelClient {
  respond(request: ModelRequest): Promise<ModelResponse>;
}

export class PreviewError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(code);
  }
}
