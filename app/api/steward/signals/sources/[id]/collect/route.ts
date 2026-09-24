import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sourceId } = await params;
    const context = new StewardCompositionRoot().createRequestContext(request);
    return NextResponse.json(await context.signals.collect(sourceId));
  } catch (error) {
    return StewardApiErrorMapper.toResponse(error);
  }
}
