import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: accountId } = await params;
    const context = await new StewardCompositionRoot().createRequestContext(
      request,
    );
    return NextResponse.json(await context.accounts.requireAccount(accountId));
  } catch (error) {
    return StewardApiErrorMapper.toResponse(error);
  }
}
