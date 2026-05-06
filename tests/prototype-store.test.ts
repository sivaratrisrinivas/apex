import { mkdtempSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createApp } from "../src/server";
import { PrototypeStore } from "../src/signups";

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

function temporaryStorePath(): string {
  return join(mkdtempSync("/tmp/apex-store-"), "prototype.sqlite");
}

describe("Prototype Store", () => {
  test("persists Developer Signups across restart-like app reloads", async () => {
    const prototypeStorePath = temporaryStorePath();
    const firstApp = createApp({ prototypeStorePath });

    const response = await postDemoSignup(firstApp, {
      email: "Engineer@Modal.com",
      name: "Ada Lovelace",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });

    expect(response.status).toBe(201);

    const reloadedApp = createApp({ prototypeStorePath });
    const dashboard = await reloadedApp.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("engineer@modal.com");
    expect(html).toContain("modal.com");
    expect(html).toContain("Eligible for enrichment");
  });

  test("deduplicates Companies and active Leads while preserving every Developer Signup", () => {
    const store = new PrototypeStore({
      databasePath: temporaryStorePath(),
    });

    store.createDeveloperSignup({
      email: "first@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    store.createDeveloperSignup({
      email: "second@modal.com",
      signedUpAt: "2026-05-02T11:00:00.000Z",
    });
    store.createDeveloperSignup({
      email: "founder@runpod.io",
      signedUpAt: "2026-05-01T12:00:00.000Z",
    });

    expect(store.listDeveloperSignups()).toHaveLength(3);
    expect(store.listCompanies()).toHaveLength(2);

    const modalLead = store
      .listLeadQueue()
      .find((lead) => lead.normalizedCompanyDomain === "modal.com");

    expect(modalLead).toMatchObject({
      signupCount: 2,
      latestSignupAt: "2026-05-02T11:00:00.000Z",
    });
    expect(
      store
        .listLeadQueue()
        .filter((lead) => lead.normalizedCompanyDomain === "modal.com"),
    ).toHaveLength(1);
  });

  test("shows repeated signup urgency signals in the Lead Queue", async () => {
    const app = createApp({
      prototypeStorePath: temporaryStorePath(),
    });

    await postDemoSignup(app, {
      email: "first@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await postDemoSignup(app, {
      email: "second@modal.com",
      signedUpAt: "2026-05-02T11:00:00.000Z",
    });

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain("Modal");
    expect(html).toContain("modal.com");
    expect(html).toContain("pending");
    expect(html).toContain(">2<span>");
    expect(html).toContain("May 2, 2026");
  });

  test("fails stale active Enrichment Runs so Vercel demos do not spin forever", () => {
    const store = new PrototypeStore();

    const result = store.createDeveloperSignup({
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });

    if (!result.ok || !result.enrichmentRun) {
      throw new Error("Expected a queued Enrichment Run.");
    }

    const failedRuns = store.failActiveEnrichmentRunsOlderThan(
      "2026-05-01T10:10:00.000Z",
      "Timed out on Vercel.",
      "2026-05-01T10:11:00.000Z",
    );

    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0]).toMatchObject({
      id: result.enrichmentRun.id,
      status: "failed",
      failureReason: "Timed out on Vercel.",
      finishedAt: "2026-05-01T10:11:00.000Z",
    });
    expect(store.listLeadQueue()[0]).toMatchObject({
      normalizedCompanyDomain: "modal.com",
      enrichmentStatus: "failed",
    });
  });

  test("exports and restores a full demo snapshot for Vercel Blob storage", () => {
    const sourceStore = new PrototypeStore();

    sourceStore.createDeveloperSignup({
      email: "engineer@modal.com",
      name: "Ada Lovelace",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    sourceStore.createDeveloperSignup({
      email: "founder@gmail.com",
      signedUpAt: "2026-05-01T11:00:00.000Z",
    });

    const restoredStore = new PrototypeStore();
    restoredStore.restoreSnapshot(sourceStore.createSnapshot());

    expect(restoredStore.listDeveloperSignups()).toEqual(
      sourceStore.listDeveloperSignups(),
    );
    expect(restoredStore.listCompanies()).toEqual(sourceStore.listCompanies());
    expect(restoredStore.listEnrichmentRuns()).toEqual(
      sourceStore.listEnrichmentRuns(),
    );
    expect(restoredStore.listLeadQueue()).toEqual(sourceStore.listLeadQueue());
  });
});
