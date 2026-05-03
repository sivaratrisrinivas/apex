import { describe, expect, test } from "bun:test";

import { createApp, type EnrichmentRunCompletion } from "../src/server";

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

async function waitForBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Lead Score", () => {
  test("shows score breakdown for an evidence-backed completed Company Enrichment", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    const response = await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });

    expect(response.status).toBe(201);

    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("<b>93</b>");
    expect(html).toContain("Lead Score Breakdown");
    expect(html).toContain("Purchasing Capacity");
    expect(html).toContain("20/20");
    expect(html).toContain("Compute Intensity");
    expect(html).toContain("25/25");
    expect(html).toContain("Parallel Fit");
    expect(html).toContain("20/20");
    expect(html).toContain("Sales Timing");
    expect(html).toContain("8/15");
    expect(html).toContain("Evidence Confidence");
    expect(html).toContain("20/20");
    expect(html).toContain("Top score reasons");
    expect(html).toContain("Compute Intensity: High compute intensity");
  });

  test("scores a Partial Enrichment with lower confidence while keeping the Lead visible", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    const response = await postDemoSignup(app, {
      email: "founder@runpod.io",
      signedUpAt: "2026-05-01T11:00:00.000Z",
    });

    expect(response.status).toBe(201);

    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain('data-status="partial">partial</mark>');
    expect(html).toContain("<b>70</b>");
    expect(html).toContain("Purchasing Capacity");
    expect(html).toContain("5/20");
    expect(html).toContain("Evidence Confidence");
    expect(html).toContain("15/20");
    expect(html).toContain("Funding details are incomplete.");
  });

  test("does not display a high Lead Score without an Evidence Basis", async () => {
    const app = createApp({
      enrichmentWorker: async () =>
        ({
          status: "completed",
          companyEnrichment: {
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
                notes: "Enrichment content is strong but no citations were returned.",
              },
              outreachSeed: {
                personalizationAngles: ["AI infrastructure scaling"],
                warnings: [],
              },
            },
            evidenceBasis: [],
          },
        }) as EnrichmentRunCompletion,
    });

    const response = await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });

    expect(response.status).toBe(201);

    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("<b>79</b>");
    expect(html).not.toContain("<b>88</b>");
    expect(html).toContain(
      "Evidence Basis required before displaying a high score.",
    );
    expect(html).toContain("Evidence Basis will appear after enrichment completes.");
  });
});
