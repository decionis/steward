import { PreviewApi } from "@/server/PreviewApi";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  return PreviewApi.post(request);
}
