import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = new StewardCompositionRoot().createRequestContext(request);
    return NextResponse.json({ sources: context.signals.listSources() });
  } catch (error) {
    return StewardApiErrorMapper.toResponse(error);
  }
}
