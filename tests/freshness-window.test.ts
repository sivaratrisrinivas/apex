import { describe, expect, test } from "bun:test";

import { createApp, type EnrichmentRunCompletion } from "../src/server";
import {
  PrototypeStore,
  type CompanyEnrichmentResult,
  type SignupIntakeResult,
} from "../src/signups";

const modalEnrichment: CompanyEnrichmentResult = {
  content: {
    company: {
      name: "Modal Labs",
      domain: "modal.com",
      headquarters: "New York, NY",
      employeeRange: "51-200 employees",
    },
    funding: {
      stage: "Series B",
      totalRaised: "$23M",
      latestRound: "Series B",
      latestRoundDate: "2025-04-15",
    },
    technicalSignals: {
      aiWorkloads: "Serverless infrastructure for AI workloads.",
      computeIntensity: "High",
      developerToolRelevance: "Strong developer platform signal.",
    },
    salesSignals: {
      keyReasons: ["AI infrastructure workload", "Recent funding"],
      suggestedNextAction: "Review infrastructure workload signal.",
    },
    confidence: {
      evidenceConfidence: "High",
      notes: "Funding and technical signals are supported by citations.",
    },
    outreachSeed: {
      personalizationAngles: ["AI infrastructure scaling"],
      warnings: [],
    },
  },
  evidenceBasis: [
    {
      field: "technicalSignals.computeIntensity",
      confidence: "high",
      reasoning: "Modal describes serverless compute for AI workloads.",
      citations: [
        {
          title: "Modal infrastructure overview",
          url: "https://modal.com",
          excerpts: ["Serverless infrastructure for AI workloads."],
        },
      ],
    },
  ],
};

function expectSuccessfulSignup(result: SignupIntakeResult) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected Demo Signup Payload to be accepted.");
  }

  return result;
}

async function postDemoSignup(app: ReturnType<typeof createApp>, payload: unknown) {
  return app.fetch(
    new Request("http://localhost/demo-signups", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

async function postManualRefresh(
  app: ReturnType<typeof createApp>,
  normalizedCompanyDomain: string,
) {
  return app.fetch(
    new Request("http://localhost/manual-refreshes", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ normalizedCompanyDomain }).toString(),
    }),
  );
}

async function waitForBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe("Freshness Window", () => {
  test("reuses a fresh Company Enrichment while updating signup urgency signals", () => {
    const store = new PrototypeStore();
    const firstSignup = expectSuccessfulSignup(
      store.createDeveloperSignup({
        email: "first@modal.com",
        signedUpAt: "2026-05-01T10:00:00.000Z",
      }),
    );

    expect(firstSignup.enrichmentRun).toBeDefined();

    store.finishEnrichmentRun(
      firstSignup.enrichmentRun!.id,
      {
        status: "completed",
        companyEnrichment: modalEnrichment,
      },
      "2026-05-01T10:05:00.000Z",
    );

    const secondSignup = expectSuccessfulSignup(
      store.createDeveloperSignup({
        email: "second@modal.com",
        signedUpAt: "2026-05-05T09:00:00.000Z",
      }),
    );

    expect(secondSignup.enrichmentRun).toBeUndefined();
    expect(store.listEnrichmentRuns()).toHaveLength(1);

    const modalLead = store.listLeadQueue()[0];

    expect(modalLead).toMatchObject({
      companyName: "Modal Labs",
      normalizedCompanyDomain: "modal.com",
      enrichmentStatus: "completed",
      signupCount: 2,
      latestSignupAt: "2026-05-05T09:00:00.000Z",
      leadScore: 98,
    });
    expect(modalLead.scoreBreakdown?.salesTiming.reason).toContain(
      "2 Developer Signups",
    );
  });

  test("starts a new Enrichment Run when the latest Company Enrichment is stale", () => {
    const store = new PrototypeStore();
    const firstSignup = expectSuccessfulSignup(
      store.createDeveloperSignup({
        email: "first@modal.com",
        signedUpAt: "2026-05-01T10:00:00.000Z",
      }),
    );

    expect(firstSignup.enrichmentRun).toBeDefined();

    store.finishEnrichmentRun(
      firstSignup.enrichmentRun!.id,
      {
        status: "completed",
        companyEnrichment: modalEnrichment,
      },
      "2026-05-01T10:05:00.000Z",
    );

    const laterSignup = expectSuccessfulSignup(
      store.createDeveloperSignup({
        email: "later@modal.com",
        signedUpAt: "2026-05-08T10:06:00.000Z",
      }),
    );

    expect(laterSignup.enrichmentRun).toMatchObject({
      id: "enrichment_run_2",
      normalizedCompanyDomain: "modal.com",
      status: "pending",
      requestedAt: "2026-05-08T10:06:00.000Z",
    });
    expect(store.listEnrichmentRuns()).toHaveLength(2);

    const modalLead = store.listLeadQueue()[0];

    expect(modalLead).toMatchObject({
      normalizedCompanyDomain: "modal.com",
      enrichmentStatus: "pending",
      signupCount: 2,
      latestSignupAt: "2026-05-08T10:06:00.000Z",
    });
  });

  test("reuses an active Enrichment Run for repeated signups from the same Company", () => {
    const store = new PrototypeStore();
    const firstSignup = expectSuccessfulSignup(
      store.createDeveloperSignup({
        email: "first@modal.com",
        signedUpAt: "2026-05-01T10:00:00.000Z",
      }),
    );
    const secondSignup = expectSuccessfulSignup(
      store.createDeveloperSignup({
        email: "second@modal.com",
        signedUpAt: "2026-05-01T10:02:00.000Z",
      }),
    );

    expect(firstSignup.enrichmentRun).toMatchObject({
      id: "enrichment_run_1",
      normalizedCompanyDomain: "modal.com",
      status: "pending",
    });
    expect(secondSignup.enrichmentRun).toBeUndefined();
    expect(store.listEnrichmentRuns()).toHaveLength(1);

    const modalLead = store.listLeadQueue()[0];

    expect(modalLead).toMatchObject({
      normalizedCompanyDomain: "modal.com",
      enrichmentStatus: "pending",
      signupCount: 2,
      latestSignupAt: "2026-05-01T10:02:00.000Z",
    });
  });

  test("offers a manual refresh action that forces a new Enrichment Run for the selected Lead", async () => {
    const startedRuns: string[] = [];
    const app = createApp({
      enrichmentWorker: async (enrichmentRun) => {
        startedRuns.push(`${enrichmentRun.id}:${enrichmentRun.normalizedCompanyDomain}`);

        return {
          status: "completed",
          companyEnrichment: modalEnrichment,
        };
      },
    });

    const signupResponse = await postDemoSignup(app, {
      email: "first@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });

    expect(signupResponse.status).toBe(201);
    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("Re-run enrichment");
    expect(html).toContain('action="/manual-refreshes"');
    expect(html).toContain('name="normalizedCompanyDomain" value="modal.com"');

    const refreshResponse = await postManualRefresh(app, "modal.com");

    expect(refreshResponse.status).toBe(303);
    expect(refreshResponse.headers.get("location")).toBe("/");

    await waitForBackgroundWork();

    expect(startedRuns).toEqual([
      "enrichment_run_1:modal.com",
      "enrichment_run_2:modal.com",
    ]);
  });

  test("rejects a manual refresh while the latest Enrichment Run is still active", async () => {
    const completion = deferred<EnrichmentRunCompletion>();
    const startedRuns: string[] = [];
    const app = createApp({
      enrichmentWorker: async (enrichmentRun) => {
        startedRuns.push(`${enrichmentRun.id}:${enrichmentRun.normalizedCompanyDomain}`);

        return completion.promise;
      },
    });

    const signupResponse = await postDemoSignup(app, {
      email: "first@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });

    expect(signupResponse.status).toBe(201);
    await waitForBackgroundWork();

    const dashboard = await app.fetch(
      new Request("http://localhost/?view=lead&lead=modal.com"),
    );
    const html = await dashboard.text();

    expect(html).toContain("Research in progress");
    expect(html).not.toContain("Re-run enrichment");

    const refreshResponse = await postManualRefresh(app, "modal.com");
    const body = (await refreshResponse.json()) as { error: string };

    expect(refreshResponse.status).toBe(409);
    expect(body.error).toBe(
      "Manual refresh is already running for this Company.",
    );
    expect(startedRuns).toEqual(["enrichment_run_1:modal.com"]);

    completion.resolve({
      status: "completed",
      companyEnrichment: modalEnrichment,
    });
    await waitForBackgroundWork();
  });
});
