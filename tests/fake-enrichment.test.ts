import { describe, expect, test } from "bun:test";

import { createApp } from "../src/server";

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

describe("Fake Parallel enrichment fixtures", () => {
  test("complete a strong enterprise-style Company Enrichment without live Parallel credentials", async () => {
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

    expect(html).toContain('data-status="completed">completed</mark>');
    expect(html).toContain("Modal Labs");
    expect(html).toContain("High");
    expect(html).toContain("AI infrastructure workload");
    expect(html).toContain("Review infrastructure workload signal.");
    expect(html).toContain("technicalSignals.computeIntensity");
    expect(html).toContain("Serverless infrastructure for AI workloads.");
  });

  test("produce a lower-confidence partial Company Enrichment from fixtures", async () => {
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
    expect(html).toContain("RunPod");
    expect(html).toContain("Medium");
    expect(html).toContain("Verify current funding before outreach.");
    expect(html).toContain("Funding details are incomplete.");
  });
});
