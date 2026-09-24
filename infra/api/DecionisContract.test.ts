/**
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { DecionisStewardGateway } from "./DecionisStewardGateway";
import { JsonHttpClient, type FetchClient } from "./JsonHttpClient";

/**
 * The contract pin.
 *
 * `infra/api/samples/` holds response bodies in the shape the Decionis
 * platform agreed to send for the context-engineering fields
 * (docs/ContextEngineeringUpstreamRequest.md): `contextClass` on evidence,
 * `arbitration` on opportunities, completed items in the opportunity list.
 * Each sample is driven through the real `JsonHttpClient` and
 * `DecionisStewardGateway`, so what is asserted is the whole live path from
 * bytes on the wire to a `domain/` type, not the schema in isolation.
 *
 * Provenance: **constructed from the agreed contract, not captured.** The
 * platform had not shipped the fields when these were written. When it has,
 * replace each file with a capture from a staging tenant and keep this test
 * green; that is the moment the contract is pinned to reality. A capture must
 * follow the demo fixture conventions (NATO organisations, `Example` people,
 * `CRM-DEMO-` references) or be rewritten to them before commit, because
 * these files are published, and the provenance test below enforces it.
 */

interface Signal {
  id: string;
  contextClass?: string;
}
interface Opportunity {
  id: string;
  status: string;
  disposition: string;
  arbitration?: { governingEvidenceIds: string[] };
}
interface AccountBody {
  evidence: Signal[];
}
interface ListBody {
  opportunities: Opportunity[];
}

function sample<T = unknown>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`./samples/${name}.json`, import.meta.url), "utf8"),
  ) as T;
}

const ROUTES: Record<string, string> = {
  "/v1/cdi/portfolio": "PortfolioResponse",
  "/v1/cdi/accounts/acct-kilo": "AccountResponse",
  "/v1/cdi/opportunities": "OpportunityListResponse",
  "/v1/cdi/opportunities/opp-kilo-limit/reviews": "ReviewResponse",
};

/** A gateway whose upstream serves the samples, with optional per-path overrides. */
function gatewayServing(overrides: Record<string, unknown> = {}) {
  const fetchClient: FetchClient = (input) => {
    const { pathname } = new URL(String(input));
    const name = ROUTES[pathname];
    if (!name) return Promise.resolve(new Response("{}", { status: 404 }));
    const body = pathname in overrides ? overrides[pathname] : sample(name);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const client = new JsonHttpClient({
    baseUrl: "https://api.decionis.example",
    bearerToken: "test-token",
    orgId: "org-kilo",
    timeoutMs: 8_000,
    fetchClient,
  });
  return new DecionisStewardGateway(client, "org-kilo");
}

describe("CDI contract — the agreed responses parse through the live path", () => {
  it("account: every signal carries a context class", async () => {
    const account = await gatewayServing().getAccount("acct-kilo");

    expect(account.evidence.length).toBeGreaterThan(0);
    for (const signal of account.evidence) {
      expect(signal.contextClass, `${signal.id} has no class`).toBeDefined();
    }
    expect(account.timeline.some((event) => event.kind === "OUTCOME")).toBe(
      true,
    );
  });

  it("opportunities: every open item carries an arbitration, and completed items are returned", async () => {
    const opportunities = await gatewayServing().listOpportunities();

    const open = opportunities.filter((item) => item.status === "OPEN");
    expect(open.length).toBeGreaterThan(0);
    for (const item of open) {
      expect(item.arbitration, `${item.id} has no arbitration`).toBeDefined();
      expect(item.arbitration?.policyReference).toBe("customer_ops.v4");
    }
    expect(opportunities.some((item) => item.status === "COMPLETED")).toBe(
      true,
    );
    expect(opportunities.some((item) => item.kind === "NO_ACTION")).toBe(true);
  });

  it("portfolio: parses as a live snapshot", async () => {
    const portfolio = await gatewayServing().getPortfolio();

    expect(portfolio.dataStatus).toBe("LIVE");
    expect(portfolio.accounts).toHaveLength(portfolio.summary.totalAccounts);
  });

  it("review: returns the re-evaluated opportunity with its disposition", async () => {
    const result = await gatewayServing().reviewOpportunity("opp-kilo-limit", {
      decision: "HOLD",
    });

    expect(result.opportunity.status).toBe("HELD");
    expect(result.opportunity.disposition).toBe("REVIEW");
    expect(result.reviewId).toMatch(/^review_/);
  });
});

describe("CDI contract — what a platform mistake looks like at the boundary", () => {
  // Steward validates every response and fails loudly rather than rendering
  // a guess. These are the two mistakes most likely while the platform
  // rolls the fields out, recorded so the failure is recognisable.

  it("a context class outside the five fails the whole account response", async () => {
    const body = sample<AccountBody>("AccountResponse");
    const [first] = body.evidence;
    if (!first) throw new Error("sample has no evidence");
    first.contextClass = "ENVIRONMENTAL";

    await expect(
      gatewayServing({ "/v1/cdi/accounts/acct-kilo": body }).getAccount(
        "acct-kilo",
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("an arbitration that rests on no evidence fails the opportunity list", async () => {
    const body = sample<ListBody>("OpportunityListResponse");
    const open = body.opportunities.find((item) => item.arbitration);
    if (!open?.arbitration) throw new Error("sample has no arbitration");
    open.arbitration.governingEvidenceIds = [];

    await expect(
      gatewayServing({ "/v1/cdi/opportunities": body }).listOpportunities(),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("a response without the new fields still parses, so a partial rollout cannot break live mode", async () => {
    const body = sample<AccountBody>("AccountResponse");
    for (const signal of body.evidence) delete signal.contextClass;
    const list = sample<ListBody>("OpportunityListResponse");
    for (const item of list.opportunities) delete item.arbitration;

    const gateway = gatewayServing({
      "/v1/cdi/accounts/acct-kilo": body,
      "/v1/cdi/opportunities": list,
    });
    const account = await gateway.getAccount("acct-kilo");
    const opportunities = await gateway.listOpportunities();

    expect(account.evidence.every((signal) => !signal.contextClass)).toBe(true);
    expect(opportunities.every((item) => !item.arbitration)).toBe(true);
  });
});

describe("CDI contract — sample provenance", () => {
  // Same guards as the demo fixtures: these files are published, so "no real
  // customer data" is a property the build checks.
  const NATO =
    /^(Alfa|Bravo|Charlie|Delta|Echo|Foxtrot|Golf|Hotel|India|Juliett|Kilo|Lima|Mike|November|Oscar|Papa|Quebec|Romeo|Sierra|Tango|Uniform|Victor|Whiskey|Xray|Yankee|Zulu) /;
  const serialized = Object.values(ROUTES)
    .map((name) =>
      readFileSync(new URL(`./samples/${name}.json`, import.meta.url), "utf8"),
    )
    .join("\n");

  it("names organisations from the NATO alphabet and people with the Example surname", () => {
    const portfolio = sample<{ accounts: { name: string; owner: string }[] }>(
      "PortfolioResponse",
    );
    for (const account of portfolio.accounts) {
      expect(account.name).toMatch(NATO);
      expect(account.owner).toMatch(/^[A-Z][a-z]+ Example$/);
    }
  });

  it("contains no email address, phone number, or URL", () => {
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/\+\d[\d\s().-]{7,}/);
  });
});
