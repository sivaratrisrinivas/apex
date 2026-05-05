import { renderDashboard } from "./dashboard";
import {
  createEnrichmentWorker,
  createFakeParallelEnrichmentWorker,
  createParallelTaskClientFromEnv,
  type ParallelTaskClient,
} from "./enrichment";
import { loadLocalEnvFile } from "./local-env";
import {
  PrototypeStore,
  type EnrichmentRun,
  type EnrichmentRunCompletion,
  type LeadQueueSort,
} from "./signups";

export type { EnrichmentRunCompletion } from "./signups";

export interface ApexApp {
  fetch(request: Request): Response | Promise<Response>;
}

export type EnrichmentWorker = (
  enrichmentRun: EnrichmentRun,
) => Promise<EnrichmentRunCompletion>;

export interface CreateAppOptions {
  prototypeStorePath?: string;
  enrichmentWorker?: EnrichmentWorker;
  parallelTaskClient?: ParallelTaskClient;
  env?: Record<string, string | undefined>;
}

export function createApp(options: CreateAppOptions = {}): ApexApp {
  const store = new PrototypeStore({
    databasePath: options.prototypeStorePath,
  });
  const configuredEnrichmentWorker = resolveEnrichmentWorker(options);
  console.log(`[apex] App created · enrichment worker: ${configuredEnrichmentWorker ? "configured" : "none (enrichment will be skipped)"}`);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === "/" && request.method === "GET") {
        const selectedLeadDomain = url.searchParams.get("lead")?.trim() || undefined;
        const leadQueueSort = parseLeadQueueSort(url.searchParams.get("sort"));

        return new Response(
          renderDashboard({
            developerSignups: store.listDeveloperSignups(),
            enrichmentRuns: store.listEnrichmentRuns(),
            leadQueue: store.listLeadQueue(leadQueueSort),
            selectedLeadDomain,
            leadQueueSort,
            activeView: parseDashboardView(url.searchParams.get("view")),
          }),
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          },
        );
      }

      if (
        url.pathname === "/assets/apex-focus-surface.png" &&
        request.method === "GET"
      ) {
        return new Response(
          Bun.file(new URL("../assets/apex-focus-surface.png", import.meta.url)),
          {
            headers: {
              "content-type": "image/png",
            },
          },
        );
      }

      if (
        url.pathname === "/assets/dashboard.css" &&
        request.method === "GET"
      ) {
        return new Response(
          Bun.file(new URL("../assets/dashboard.css", import.meta.url)),
          {
            headers: {
              "content-type": "text/css; charset=utf-8",
            },
          },
        );
      }

      if (url.pathname === "/demo-signups" && request.method === "POST") {
        console.log(`[apex] ← POST /demo-signups`);
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.createDeveloperSignup(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          console.log(`[apex]   ✗ Signup rejected: ${JSON.stringify(result.body)}`);
          return jsonResponse(result.body, result.status);
        }

        const signup = result.developerSignup;
        console.log(`[apex]   ✓ Signup created: ${signup.email} → ${signup.normalizedCompanyDomain} (${signup.qualification})`);
        if (signup.qualification !== "qualified") {
          console.log(`[apex]   ↳ Unqualified reason: ${signup.unqualifiedReason}`);
        }

        if (result.enrichmentRun) {
          const enrichmentRunId = result.enrichmentRun.id;
          console.log(`[apex]   ↳ Enrichment run queued: ${enrichmentRunId} for ${result.enrichmentRun.normalizedCompanyDomain}`);

          queueMicrotask(() => {
            void runEnrichmentRun(
              store,
              enrichmentRunId,
              configuredEnrichmentWorker,
            );
          });
        } else {
          console.log(`[apex]   ↳ No enrichment run needed (fresh enrichment exists or signup unqualified)`);
        }

        if (isFormPost) {
          return new Response(null, {
            status: 303,
            headers: {
              location: result.enrichmentRun
                ? "/?view=queue"
                : "/?view=activity",
            },
          });
        }

        return jsonResponse(
          {
            developerSignup: result.developerSignup,
            enrichmentRun: result.enrichmentRun,
          },
          201,
        );
      }

      if (url.pathname === "/outreach-drafts" && request.method === "POST") {
        console.log(`[apex] ← POST /outreach-drafts`);
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.generateOutreachDraft(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          console.log(`[apex]   ✗ Draft rejected: ${JSON.stringify(result.body)}`);
          return jsonResponse(result.body, result.status);
        }

        const draft = result.outreachDraft;
        console.log(`[apex]   ✓ Outreach draft generated: ${draft.companyName} (${draft.status})`);
        console.log(`[apex]   ↳ Subject: ${draft.subject}`);
        console.log(`[apex]   ↳ Evidence refs: ${draft.evidenceReferences.length}`);

        if (isFormPost) {
          return new Response(null, {
            status: 303,
            headers: {
              location: `/?lead=${encodeURIComponent(result.outreachDraft.normalizedCompanyDomain)}`,
            },
          });
        }

        return jsonResponse(
          {
            outreachDraft: result.outreachDraft,
          },
          201,
        );
      }

      if (url.pathname === "/manual-refreshes" && request.method === "POST") {
        console.log(`[apex] ← POST /manual-refreshes`);
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.requestManualRefresh(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          console.log(`[apex]   ✗ Manual refresh rejected: ${JSON.stringify(result.body)}`);
          return jsonResponse(result.body, result.status);
        }

        const enrichmentRunId = result.enrichmentRun.id;
        console.log(`[apex]   ✓ Manual refresh: ${enrichmentRunId} for ${result.enrichmentRun.normalizedCompanyDomain}`);

        queueMicrotask(() => {
          void runEnrichmentRun(
            store,
            enrichmentRunId,
            configuredEnrichmentWorker,
          );
        });

        if (isFormPost) {
          return new Response(null, {
            status: 303,
            headers: {
              location: "/",
            },
          });
        }

        return jsonResponse(
          {
            enrichmentRun: result.enrichmentRun,
          },
          202,
        );
      }

      return new Response("Not found", { status: 404 });
    },
  };
}

function parseLeadQueueSort(value: string | null): LeadQueueSort {
  return value === "recent" ? "recent" : "score";
}

function parseDashboardView(value: string | null):
  | "intake"
  | "queue"
  | "lead"
  | "draft"
  | "activity"
  | undefined {
  if (
    value === "intake" ||
    value === "queue" ||
    value === "lead" ||
    value === "draft" ||
    value === "activity"
  ) {
    return value;
  }

  return undefined;
}

function resolveEnrichmentWorker(
  options: CreateAppOptions,
): EnrichmentWorker | undefined {
  if (options.enrichmentWorker) {
    return options.enrichmentWorker;
  }

  if (options.parallelTaskClient) {
    return createEnrichmentWorker({
      taskClient: options.parallelTaskClient,
    });
  }

  const env = options.env ?? process.env;

  if (env.APEX_ENRICHMENT_MODE?.trim().toLowerCase() === "fake") {
    console.log(`[apex] Enrichment mode: FAKE (using hardcoded fixtures, no API calls)`);
    return createFakeParallelEnrichmentWorker();
  }

  if (!env.PARALLEL_API_KEY?.trim()) {
    console.log(`[apex] Enrichment mode: NONE (no PARALLEL_API_KEY found — enrichment will be skipped)`);
    return undefined;
  }

  console.log(`[apex] Enrichment mode: LIVE (using Parallel API key from env)`);
  return createEnrichmentWorker({
    taskClient: createParallelTaskClientFromEnv({ env }),
  });
}

async function runEnrichmentRun(
  store: PrototypeStore,
  enrichmentRunId: string,
  enrichmentWorker: EnrichmentWorker | undefined,
): Promise<void> {
  console.log(`[apex] ⚙ Enrichment run starting: ${enrichmentRunId}`);

  const startedRun = store.markEnrichmentRunResearching(
    enrichmentRunId,
    new Date().toISOString(),
  );

  if (!startedRun) {
    console.log(`[apex]   ✗ Enrichment run ${enrichmentRunId} not found in store`);
    return;
  }

  console.log(`[apex]   → Status: researching · domain: ${startedRun.normalizedCompanyDomain}`);

  if (!enrichmentWorker) {
    console.log(`[apex]   ⏸ No enrichment worker configured — run stays in researching state`);
    return;
  }

  const startTime = Date.now();
  try {
    console.log(`[apex]   → Calling enrichment worker...`);
    const completion = await enrichmentWorker(startedRun);
    const elapsed = Date.now() - startTime;
    console.log(`[apex]   ✓ Enrichment completed in ${elapsed}ms · status: ${completion.status}`);
    if (completion.status !== "failed" && completion.companyEnrichment) {
      const co = completion.companyEnrichment.content;
      console.log(`[apex]   ↳ Company: ${co.company.name} · HQ: ${co.company.headquarters} · Employees: ${co.company.employeeRange}`);
      console.log(`[apex]   ↳ Funding: ${co.funding.stage} · Total raised: ${co.funding.totalRaised}`);
      console.log(`[apex]   ↳ Compute intensity: ${co.technicalSignals.computeIntensity} · Confidence: ${co.confidence.evidenceConfidence}`);
      console.log(`[apex]   ↳ Evidence basis items: ${completion.companyEnrichment.evidenceBasis.length}`);
      console.log(`[apex]   ↳ Key reasons: ${co.salesSignals.keyReasons.join(", ")}`);
      console.log(`[apex]   ↳ Suggested next action: ${co.salesSignals.suggestedNextAction}`);
    }
    if (completion.status === "failed" && "failureReason" in completion) {
      console.log(`[apex]   ↳ Failure reason: ${completion.failureReason}`);
    }
    store.finishEnrichmentRun(enrichmentRunId, completion, new Date().toISOString());
    console.log(`[apex]   ✓ Enrichment run ${enrichmentRunId} persisted to store`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const reason = formatErrorMessage(error);
    console.log(`[apex]   ✗ Enrichment failed after ${elapsed}ms: ${reason}`);
    store.finishEnrichmentRun(
      enrichmentRunId,
      {
        status: "failed",
        failureReason: reason,
      },
      new Date().toISOString(),
    );
  }
}

async function readJsonPayload(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function readStructuredPayload(request: Request): Promise<unknown> {
  if (isUrlEncodedFormPost(request)) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }

  return readJsonPayload(request);
}

function isUrlEncodedFormPost(request: Request): boolean {
  return (request.headers.get("content-type") ?? "")
    .toLowerCase()
    .includes("application/x-www-form-urlencoded");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Enrichment Run failed.";
}

if (import.meta.main) {
  console.log(`[apex] ────────────────────────────────────`);
  console.log(`[apex] Starting Apex server...`);
  const env = loadLocalEnvFile();
  console.log(`[apex] .env.local: ${env.PARALLEL_API_KEY ? "PARALLEL_API_KEY loaded ✓" : "no PARALLEL_API_KEY found"}`);
  console.log(`[apex] APEX_ENRICHMENT_MODE: ${env.APEX_ENRICHMENT_MODE ?? "(not set)"}`);
  const port = Number(env.PORT ?? 3000);
  const app = createApp({
    prototypeStorePath: env.APEX_PROTOTYPE_STORE_PATH ?? ".apex/prototype.sqlite",
    env,
  });

  Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`[apex] ────────────────────────────────────`);
  console.log(`[apex] Apex running at http://localhost:${port}`);
  console.log(`[apex] ────────────────────────────────────`);
}
