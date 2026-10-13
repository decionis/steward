import { PreviewExportApi } from "@/server/PreviewExportApi";

export const runtime = "nodejs";
export const maxDuration = 5;

export async function POST(request: Request) {
  return PreviewExportApi.post(request);
}
