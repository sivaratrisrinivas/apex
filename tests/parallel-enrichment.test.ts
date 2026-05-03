import { describe, expect, test } from "bun:test";

import {
  CORE2X_ENRICHMENT_TASK_SPEC,
  createCore2xEnrichmentWorker,
  createParallelTaskClientFromEnv,
  type FetchImplementation,
  type ParallelTaskClient,
} from "../src/enrichment";
import { createApp, type EnrichmentRunCompletion } from "../src/server";
import type { EnrichmentRun } from "../src/signups";

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

describe("Core2x Enrichment", () => {
  test("persists a completed Company Enrichment with Evidence Basis", async () => {
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
                aiWorkloads: "Runs cloud infrastructure for AI workloads.",
                computeIntensity: "high",
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

    expect(html).toContain("Modal Labs");
    expect(html).toContain("High");
    expect(html).toContain("Review infrastructure workload signal.");
    expect(html).toContain("technicalSignals.computeIntensity");
    expect(html).toContain("Serverless infrastructure for AI workloads.");
  });

  test("submits Enrichment Runs to Parallel with Core2x and a strict Enrichment Schema", async () => {
    const requests: Parameters<ParallelTaskClient["createTaskRun"]>[0][] = [];
    const taskClient: ParallelTaskClient = {
      createTaskRun: async (request) => {
        requests.push(request);

        return {
          runId: "trun_modal",
        };
      },
      retrieveTaskRunResult: async () => ({
        output: {
          type: "json",
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
              aiWorkloads: "Runs cloud infrastructure for AI workloads.",
              computeIntensity: "high",
              developerToolRelevance: "Strong developer platform signal.",
            },
            salesSignals: {
              keyReasons: ["AI infrastructure workload"],
              suggestedNextAction: "Review infrastructure workload signal.",
            },
            confidence: {
              evidenceConfidence: "High",
              notes: "Technical signal is supported by citations.",
            },
            outreachSeed: {
              personalizationAngles: ["AI infrastructure scaling"],
              warnings: [],
            },
          },
          basis: [
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
        },
      }),
    };
    const worker = createCore2xEnrichmentWorker({ taskClient });

    const completion = await worker(enrichmentRunFor("modal.com"));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      input: {
        normalizedCompanyDomain: "modal.com",
        companyWebsite: "https://modal.com",
      },
      processor: "core2x",
      metadata: {
        apex_run: "enrichment_run_1",
        domain: "modal.com",
      },
    });
    expect(requests[0].taskSpec.input_schema).toMatchObject({
      type: "json",
      json_schema: {
        required: ["normalizedCompanyDomain", "companyWebsite"],
        additionalProperties: false,
      },
    });
    expect(requests[0].taskSpec.output_schema).toMatchObject({
      type: "json",
      json_schema: {
        required: [
          "company",
          "funding",
          "technicalSignals",
          "salesSignals",
          "confidence",
          "outreachSeed",
        ],
        additionalProperties: false,
      },
    });
    expect(completion).toMatchObject({
      status: "completed",
      companyEnrichment: {
        content: {
          company: {
            name: "Modal Labs",
            domain: "modal.com",
          },
        },
        evidenceBasis: [
          {
            field: "technicalSignals.computeIntensity",
          },
        ],
      },
    });
  });

  test("reads Parallel credentials from WSL environment variables", async () => {
    const calls: { url: string; headers: Headers; body?: unknown }[] = [];
    const fetchImplementation: FetchImplementation = async (input, init) => {
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({
        url: String(input),
        headers,
        body,
      });

      if (String(input).endsWith("/v1/tasks/runs")) {
        return Response.json({
          run_id: "trun_modal",
          status: "queued",
          processor: "core2x",
        });
      }

      return Response.json({
        run: {
          run_id: "trun_modal",
          status: "completed",
          processor: "core2x",
        },
        output: {
          type: "json",
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
              aiWorkloads: "Runs cloud infrastructure for AI workloads.",
              computeIntensity: "high",
              developerToolRelevance: "Strong developer platform signal.",
            },
            salesSignals: {
              keyReasons: ["AI infrastructure workload"],
              suggestedNextAction: "Review infrastructure workload signal.",
            },
            confidence: {
              evidenceConfidence: "High",
              notes: "Technical signal is supported by citations.",
            },
            outreachSeed: {
              personalizationAngles: ["AI infrastructure scaling"],
              warnings: [],
            },
          },
          basis: [],
        },
      });
    };
    const client = createParallelTaskClientFromEnv({
      env: {
        PARALLEL_API_KEY: "parallel_secret",
        PARALLEL_API_BASE_URL: "https://parallel.test",
      },
      fetch: fetchImplementation,
    });

    const taskRun = await client.createTaskRun({
      input: {
        normalizedCompanyDomain: "modal.com",
        companyWebsite: "https://modal.com",
      },
      processor: "core2x",
      taskSpec: CORE2X_ENRICHMENT_TASK_SPEC,
      metadata: {
        apex_run: "enrichment_run_1",
        domain: "modal.com",
      },
    });
    const result = await client.retrieveTaskRunResult("trun_modal", {
      timeoutSeconds: 30,
    });

    expect(taskRun).toEqual({ runId: "trun_modal" });
    expect(result.output.type).toBe("json");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://parallel.test/v1/tasks/runs");
    expect(calls[0].headers.get("x-api-key")).toBe("parallel_secret");
    expect(calls[0].headers.get("content-type")).toBe("application/json");
    expect(calls[0].body).toMatchObject({
      input: {
        normalizedCompanyDomain: "modal.com",
        companyWebsite: "https://modal.com",
      },
      processor: "core2x",
      task_spec: CORE2X_ENRICHMENT_TASK_SPEC,
      metadata: {
        apex_run: "enrichment_run_1",
        domain: "modal.com",
      },
    });
    expect(calls[1].url).toBe(
      "https://parallel.test/v1/tasks/runs/trun_modal/result?timeout=30",
    );
    expect(calls[1].headers.get("x-api-key")).toBe("parallel_secret");
  });

  test("uses Core2x Enrichment for normal automated Enrichment Runs when configured", async () => {
    const requests: Parameters<ParallelTaskClient["createTaskRun"]>[0][] = [];
    const taskClient: ParallelTaskClient = {
      createTaskRun: async (request) => {
        requests.push(request);

        return {
          runId: "trun_modal",
        };
      },
      retrieveTaskRunResult: async () => ({
        output: {
          type: "json",
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
              aiWorkloads: "Runs cloud infrastructure for AI workloads.",
              computeIntensity: "high",
              developerToolRelevance: "Strong developer platform signal.",
            },
            salesSignals: {
              keyReasons: ["AI infrastructure workload"],
              suggestedNextAction: "Review infrastructure workload signal.",
            },
            confidence: {
              evidenceConfidence: "High",
              notes: "Technical signal is supported by citations.",
            },
            outreachSeed: {
              personalizationAngles: ["AI infrastructure scaling"],
              warnings: [],
            },
          },
          basis: [],
        },
      }),
    };
    const app = createApp({
      parallelTaskClient: taskClient,
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(requests).toHaveLength(1);
    expect(requests[0].processor).toBe("core2x");
    expect(html).toContain("Modal Labs");
    expect(html).toContain("High");
  });

  test("shows Parallel API errors as failed Enrichment Status reasons", async () => {
    const taskClient = createParallelTaskClientFromEnv({
      env: {
        PARALLEL_API_KEY: "parallel_secret",
        PARALLEL_API_BASE_URL: "https://parallel.test",
      },
      fetch: async () =>
        Response.json(
          {
            error: {
              message: "Invalid Parallel API key.",
            },
          },
          { status: 401 },
        ),
    });
    const app = createApp({
      parallelTaskClient: taskClient,
    });

    await postDemoSignup(app, {
      email: "engineer@modal.com",
      signedUpAt: "2026-05-01T10:00:00.000Z",
    });
    await waitForBackgroundWork();

    const dashboard = await app.fetch(new Request("http://localhost/"));
    const html = await dashboard.text();

    expect(html).toContain('data-status="failed">failed</mark>');
    expect(html).toContain(
      "Parallel Task API create task run failed with HTTP 401: Invalid Parallel API key.",
    );
  });
});

function enrichmentRunFor(normalizedCompanyDomain: string): EnrichmentRun {
  return {
    id: "enrichment_run_1",
    developerSignupId: "developer_signup_1",
    companyId: "company_1",
    normalizedCompanyDomain,
    status: "researching",
    requestedAt: "2026-05-01T10:00:00.000Z",
    startedAt: "2026-05-01T10:00:01.000Z",
  };
}
