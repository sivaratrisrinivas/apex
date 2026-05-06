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

async function postOutreachDraft(
  app: ReturnType<typeof createApp>,
  payload: unknown,
) {
  return app.fetch(
    new Request("http://localhost/outreach-drafts", {
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

describe("Outreach Drafts", () => {
  test("does not generate an Outreach Draft before a Lead exists", async () => {
    const app = createApp();

    const response = await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Outreach Draft generation requires an existing Lead.");
  });

  test("generates an evidence-backed Outreach Draft after a Lead exists", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const response = await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
    });
    const body = (await response.json()) as {
      outreachDraft: {
        companyName: string;
        status: string;
        subject: string;
        body: string;
        evidenceReferences: string[];
      };
    };

    expect(response.status).toBe(201);
    expect(body.outreachDraft).toMatchObject({
      companyName: "Modal Labs",
      status: "ready",
      subject: "Modal Labs' AI infrastructure story",
    });
    expect(body.outreachDraft.body).toContain("AI infrastructure scaling");
    expect(body.outreachDraft.body).toContain(
      "A developer from modal.com signed up for Parallel",
    );
    expect(body.outreachDraft.body).toContain(
      "turn account research into API-backed workflows",
    );
    expect(body.outreachDraft.body).toContain("technicalSignals.computeIntensity");
    expect(body.outreachDraft.body).not.toContain("Apex flagged this Lead");
    expect(body.outreachDraft.body).not.toContain("Evidence used:");
    expect(body.outreachDraft.body).not.toContain("Suggested next action:");
    expect(body.outreachDraft.evidenceReferences).toContain(
      "technicalSignals.computeIntensity: Modal infrastructure overview",
    );
  });

  test("keeps the Lead Score independent from Outreach Draft generation", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const beforeDraft = await app.fetch(new Request("http://localhost/"));
    const beforeHtml = await beforeDraft.text();

    await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
    });

    const afterDraft = await app.fetch(new Request("http://localhost/"));
    const afterHtml = await afterDraft.text();

    expect(beforeHtml).toContain("<b>93</b>");
    expect(afterHtml).toContain("<b>93</b>");
    expect(afterHtml).toContain("Outreach Draft");
  });

  test("reuses an existing Outreach Draft instead of generating it twice", async () => {
    let draftWriterCalls = 0;
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
      outreachDraftWriter: async () => {
        draftWriterCalls += 1;

        return {
          status: "ready" as const,
          subject: `custom Modal follow up ${draftWriterCalls}`,
          body: "Custom body",
          evidenceReferences: ["technicalSignals.computeIntensity: Modal infrastructure overview"],
        };
      },
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const firstResponse = await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
    });
    const firstBody = (await firstResponse.json()) as {
      outreachDraft: { id: string; subject: string };
      reusedExisting?: boolean;
    };
    const secondResponse = await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
    });
    const secondBody = (await secondResponse.json()) as {
      outreachDraft: { id: string; subject: string };
      reusedExisting?: boolean;
    };
    const rewriteResponse = await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
      regenerate: true,
    });
    const rewriteBody = (await rewriteResponse.json()) as {
      outreachDraft: { id: string; subject: string };
      reusedExisting?: boolean;
    };

    expect(firstResponse.status).toBe(201);
    expect(firstBody.reusedExisting).toBe(false);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.reusedExisting).toBe(true);
    expect(secondBody.outreachDraft.id).toBe(firstBody.outreachDraft.id);
    expect(secondBody.outreachDraft.subject).toBe("custom Modal follow up 1");
    expect(rewriteResponse.status).toBe(201);
    expect(rewriteBody.reusedExisting).toBe(false);
    expect(rewriteBody.outreachDraft.id).not.toBe(firstBody.outreachDraft.id);
    expect(rewriteBody.outreachDraft.subject).toBe("custom Modal follow up 2");
    expect(draftWriterCalls).toBe(2);
  });

  test("avoids fake-personalized Outreach Drafts when evidence is weak", async () => {
    const app = createApp({
      enrichmentWorker: async () =>
        ({
          status: "partial",
          companyEnrichment: {
            content: {
              company: {
                name: "Stealth AI",
                domain: "stealth-ai.dev",
                headquarters: "Unknown",
                employeeRange: "Unknown",
              },
              funding: {
                stage: "Unknown",
                totalRaised: "Unknown",
                latestRound: "Unknown",
                latestRoundDate: "Unknown",
              },
              technicalSignals: {
                aiWorkloads: "Unknown",
                computeIntensity: "Unknown",
                developerToolRelevance: "Unknown",
              },
              salesSignals: {
                keyReasons: ["Possible agent infrastructure interest"],
                suggestedNextAction: "Ask a discovery question before personalizing.",
              },
              confidence: {
                evidenceConfidence: "Low",
                notes: "No reliable personalization evidence yet.",
              },
              outreachSeed: {
                personalizationAngles: ["stealth agent workloads"],
                warnings: ["Do not personalize without stronger evidence."],
              },
            },
            evidenceBasis: [],
          },
        }) as EnrichmentRunCompletion,
    });

    await postDemoSignup(app, {
      email: "builder@stealth-ai.dev",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const response = await postOutreachDraft(app, {
      normalizedCompanyDomain: "stealth-ai.dev",
    });
    const body = (await response.json()) as {
      outreachDraft: {
        status: string;
        body: string;
        evidenceReferences: string[];
      };
    };

    expect(response.status).toBe(201);
    expect(body.outreachDraft.status).toBe("needs-evidence");
    expect(body.outreachDraft.body).toContain(
      "A developer from stealth-ai.dev signed up for Parallel",
    );
    expect(body.outreachDraft.body).toContain(
      "Ask a discovery question before personalizing.",
    );
    expect(body.outreachDraft.body).toContain("opening chapter");
    expect(body.outreachDraft.body).not.toContain("stealth agent workloads");
    expect(body.outreachDraft.evidenceReferences).toEqual([]);
  });

  test("shows generated Outreach Drafts as editable and copyable dashboard content", async () => {
    const app = createApp({
      env: {
        APEX_ENRICHMENT_MODE: "fake",
      },
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();
    await postOutreachDraft(app, {
      normalizedCompanyDomain: "modal.com",
    });

    const dashboard = await app.fetch(
      new Request("http://localhost/?lead=modal.com"),
    );
    const html = await dashboard.text();
    const detail = sectionHtml(html, "Selected Lead detail");

    expect(detail).toContain("Outreach Draft");
    expect(detail).toContain("<textarea");
    expect(detail).toContain("AI infrastructure scaling");
    expect(detail).toContain("turn account research into API-backed workflows");
    expect(detail).toContain("data-copy-outreach");
    expect(detail).toContain("Rewrite draft");
    expect(detail).toContain('name="regenerate" value="true"');
    expect(detail).toContain(
      "technicalSignals.computeIntensity: Modal infrastructure overview",
    );
  });
});
