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

function sectionHtml(html: string, ariaLabel: string): string {
  const labelStart = html.indexOf(`aria-label="${ariaLabel}"`);
  const start = html.lastIndexOf("<section", labelStart);
  const end = html.indexOf("</section>", labelStart);

  return html.slice(start, end);
}

describe("Lead Queue dashboard", () => {
  test("prioritizes higher-scoring Leads while showing key reasons in the queue", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    await postDemoSignup(app, {
      email: "founder@runpod.io",
      signedUpAt: "2026-05-01T11:00:00.000Z",
    });
    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();
    const leadQueue = sectionHtml(html, "Lead Queue");

    expect(leadQueue.indexOf("Modal Labs")).toBeLessThan(
      leadQueue.indexOf("RunPod"),
    );
    expect(leadQueue).toContain("<th>Key Reasons</th>");
    expect(leadQueue).toContain("AI infrastructure workload");
    expect(leadQueue).toContain("GPU infrastructure workload");
  });

  test("shows the selected Lead detail with Mock CRM Fields and raw Company Enrichment", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await postDemoSignup(app, {
      email: "founder@runpod.io",
      signedUpAt: "2026-05-01T11:00:00.000Z",
    });
    await waitForBackgroundWork();

    const dashboard = await app.fetch(
      new Request("http://localhost/?lead=runpod.io"),
    );
    const html = await dashboard.text();
    const detail = sectionHtml(html, "Selected Lead detail");

    expect(detail).toContain("RunPod details");
    expect(detail).not.toContain("Modal Labs details");
    expect(detail).toContain("Mock CRM Fields");
    expect(detail).toContain("Lifecycle Stage");
    expect(detail).toContain("Owner");
    expect(detail).toContain("Raw Company Enrichment");
    expect(detail).toContain('"employeeRange": "51-200 employees"');
    expect(detail).toContain("Evidence Basis");
    expect(detail).toContain("technicalSignals.computeIntensity");
  });

  test("can sort the Lead Queue by recent signup activity", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await postDemoSignup(app, {
      email: "founder@runpod.io",
      signedUpAt: "2026-05-01T11:00:00.000Z",
    });
    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/?sort=recent"));
    const html = await dashboard.text();
    const leadQueue = sectionHtml(html, "Lead Queue");

    expect(leadQueue.indexOf("RunPod")).toBeLessThan(
      leadQueue.indexOf("Modal Labs"),
    );
    expect(leadQueue).toContain('href="/?sort=score"');
    expect(leadQueue).toContain('href="/?sort=recent"');
  });
});
