import { describe, expect, test } from "bun:test";

import { createApp, type EnrichmentRunCompletion } from "../src/server";

interface DemoSignupResponse {
  enrichmentRun: {
    normalizedCompanyDomain: string;
    status: string;
  };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

async function waitForBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Enrichment Run lifecycle", () => {
  test("acknowledges a qualified Developer Signup while research continues in the background", async () => {
    const completion = deferred<EnrichmentRunCompletion>();
    const startedRuns: string[] = [];
    const app = createApp({
      enrichmentWorker: async (enrichmentRun) => {
        startedRuns.push(enrichmentRun.id);
        return completion.promise;
      },
    });

    const response = await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.enrichmentRun).toMatchObject({
      normalizedCompanyDomain: "modal.com",
      status: "pending",
    });

    await waitForBackgroundWork();

    expect(startedRuns).toHaveLength(1);

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("researching");
    expect(html).not.toContain(">failed<");

    completion.resolve({ status: "completed" });
    await waitForBackgroundWork();
  });

  test("keeps slow Enrichment Runs researching instead of failing them", async () => {
    const app = createApp();

    const response = await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    const body = (await response.json()) as DemoSignupResponse;

    expect(response.status).toBe(201);
    expect(body.enrichmentRun).toMatchObject({
      normalizedCompanyDomain: "modal.com",
      status: "pending",
    });

    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain('data-status="researching">researching</mark>');
    expect(html).not.toContain('data-status="failed">failed</mark>');
  });

  test("shows completed, partial, and failed Enrichment Status outcomes", async () => {
    const app = createApp({
      enrichmentWorker: async (enrichmentRun) => {
        if (enrichmentRun.normalizedCompanyDomain === "modal.com") {
          return { status: "completed" };
        }

        if (enrichmentRun.normalizedCompanyDomain === "runpod.io") {
          return { status: "partial" };
        }

        return {
          status: "failed",
          failureReason: "No usable company identity could be confirmed.",
        };
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
    await postDemoSignup(app, {
      email: "builder@stealth-ai.dev",
      signedUpAt: "2026-05-01T12:00:00.000Z",
    });

    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain('data-status="completed">completed</mark>');
    expect(html).toContain('data-status="partial">partial</mark>');
    expect(html).toContain('data-status="failed">failed</mark>');
    expect(html).toContain("No usable company identity could be confirmed.");
  });

  test("shows Unqualified Signups as unqualified without starting research", async () => {
    const startedRuns: string[] = [];
    const app = createApp({
      enrichmentWorker: async (enrichmentRun) => {
        startedRuns.push(enrichmentRun.id);
        return { status: "completed" };
      },
    });

    await postDemoSignup(app, {
      email: "founder@gmail.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(startedRuns).toHaveLength(0);
    expect(html).toContain('data-status="unqualified">unqualified</mark>');
    expect(html).toContain("personal-domain");
  });
});
