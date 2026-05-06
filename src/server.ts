import { renderDashboard } from "./dashboard";
import {
  createEnrichmentWorker,
  createFakeParallelEnrichmentWorker,
  createParallelTaskClientFromEnv,
  type ParallelTaskClient,
  type ParallelProcessor,
} from "./enrichment";
import { loadLocalEnvFile } from "./local-env";
import { createGeminiDraftWriter, type OutreachDraftWriter } from "./gemini";
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
  store?: PrototypeStore;
  enrichmentWorker?: EnrichmentWorker | null;
  parallelTaskClient?: ParallelTaskClient;
  outreachDraftWriter?: OutreachDraftWriter | null;
  env?: Record<string, string | undefined>;
  recoverActiveRuns?: boolean;
  deferTask?: (task: () => Promise<void>) => void;
}

export function createApp(options: CreateAppOptions = {}): ApexApp {
  const env = options.env ?? process.env;
  const store =
    options.store ??
    new PrototypeStore({
      databasePath: options.prototypeStorePath,
    });
  const configuredEnrichmentWorker = resolveEnrichmentWorker(options);
  const draftWriter = resolveOutreachDraftWriter(options);
  const recoverActiveRuns = options.recoverActiveRuns ?? true;

  if (configuredEnrichmentWorker && recoverActiveRuns) {
    const recoverableRuns = store.listRecoverableEnrichmentRuns();

    for (const enrichmentRun of recoverableRuns) {
      scheduleDeferredTask(options, async () => {
        await runEnrichmentRun(
          store,
          enrichmentRun.id,
          configuredEnrichmentWorker,
        );
      });
    }
  }

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
            liveRefreshEnabled: configuredEnrichmentWorker !== undefined,
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

      if (url.pathname === "/dashboard-state" && request.method === "GET") {
        const enrichmentRuns = store.listEnrichmentRuns();
        const latestRun = enrichmentRuns[0];

        return jsonResponse(
          {
            activeEnrichmentRunCount: enrichmentRuns.filter((run) =>
              isActiveEnrichmentStatus(run.status),
            ).length,
            latestRunStatus: latestRun?.status ?? null,
            generatedAt: new Date().toISOString(),
          },
          200,
        );
      }

      if (url.pathname === "/demo-signups" && request.method === "POST") {
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.createDeveloperSignup(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

        if (result.enrichmentRun) {
          const enrichmentRunId = result.enrichmentRun.id;

          scheduleDeferredTask(options, async () => {
            await runEnrichmentRun(
              store,
              enrichmentRunId,
              configuredEnrichmentWorker,
            );
          });
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
        const isFormPost = isUrlEncodedFormPost(request);
        const payload = await readStructuredPayload(request);
        const result = await store.generateOutreachDraft(payload, { draftWriter });

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

        if (isFormPost) {
          return new Response(null, {
            status: 303,
            headers: {
              location: `/?view=draft&lead=${encodeURIComponent(result.outreachDraft.normalizedCompanyDomain)}`,
            },
          });
        }

        return jsonResponse(
          {
            outreachDraft: result.outreachDraft,
            reusedExisting: result.reusedExisting,
          },
          result.reusedExisting ? 200 : 201,
        );
      }

      if (url.pathname === "/manual-refreshes" && request.method === "POST") {
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.requestManualRefresh(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

        const enrichmentRunId = result.enrichmentRun.id;

        scheduleDeferredTask(options, async () => {
          await runEnrichmentRun(
            store,
            enrichmentRunId,
            configuredEnrichmentWorker,
          );
        });

        if (isFormPost) {
          return new Response(null, {
            status: 303,
            headers: {
              location: `/?view=queue&lead=${encodeURIComponent(result.enrichmentRun.normalizedCompanyDomain)}`,
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

function scheduleDeferredTask(
  options: CreateAppOptions,
  task: () => Promise<void>,
): void {
  const deferTask = options.deferTask ?? ((deferredTask) => {
    queueMicrotask(() => {
      void deferredTask();
    });
  });

  deferTask(task);
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

function isActiveEnrichmentStatus(status: EnrichmentRun["status"]): boolean {
  return status === "pending" || status === "researching";
}

function resolveEnrichmentWorker(
  options: CreateAppOptions,
): EnrichmentWorker | undefined {
  const env = options.env ?? process.env;

  if (options.enrichmentWorker) {
    return options.enrichmentWorker;
  }

  if (options.parallelTaskClient) {
    return createEnrichmentWorker({
      taskClient: options.parallelTaskClient,
      resultTimeoutSeconds:
        parsePositiveInteger(env.APEX_PARALLEL_RESULT_TIMEOUT_SECONDS) ??
        600,
    });
  }

  if (env.APEX_ENRICHMENT_MODE?.trim().toLowerCase() === "fake") {
    return createFakeParallelEnrichmentWorker();
  }

  if (!env.PARALLEL_API_KEY?.trim()) {
    return undefined;
  }

  return createEnrichmentWorker({
    taskClient: createParallelTaskClientFromEnv({ env }),
    processor: parseParallelProcessor(env.APEX_PARALLEL_PROCESSOR),
    resultTimeoutSeconds:
      parsePositiveInteger(env.APEX_PARALLEL_RESULT_TIMEOUT_SECONDS) ??
      600,
  });
}

const PARALLEL_PROCESSORS: ParallelProcessor[] = [
  "lite",
  "base",
  "core",
  "core2x",
  "pro",
  "ultra",
  "lite-fast",
  "base-fast",
  "core-fast",
  "core2x-fast",
  "pro-fast",
  "ultra-fast",
];

function parseParallelProcessor(value: string | undefined): ParallelProcessor | undefined {
  const processor = value?.trim();

  if (PARALLEL_PROCESSORS.includes(processor as ParallelProcessor)) {
    return processor as ParallelProcessor;
  }

  return undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return undefined;
}

function resolveOutreachDraftWriter(
  options: CreateAppOptions,
): OutreachDraftWriter | undefined {
  if (options.outreachDraftWriter) {
    return options.outreachDraftWriter;
  }

  if (options.outreachDraftWriter === null) {
    return undefined; // explicitly disabled
  }

  const env = options.env ?? process.env;

  if (env.GEMINI_API_KEY?.trim()) {
    return createGeminiDraftWriter({ apiKey: env.GEMINI_API_KEY.trim() });
  }

  return undefined;
}

async function runEnrichmentRun(
  store: PrototypeStore,
  enrichmentRunId: string,
  enrichmentWorker: EnrichmentWorker | undefined,
): Promise<void> {
  const startedRun = store.markEnrichmentRunResearching(
    enrichmentRunId,
    new Date().toISOString(),
  );

  if (!startedRun) {
    return;
  }

  if (!enrichmentWorker) {
    return;
  }

  try {
    const completion = await enrichmentWorker(startedRun);
    store.finishEnrichmentRun(enrichmentRunId, completion, new Date().toISOString());
  } catch (error) {
    const reason = formatErrorMessage(error);
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
  const env = loadLocalEnvFile();
  const port = Number(env.PORT ?? 3000);
  const app = createApp({
    prototypeStorePath: env.APEX_PROTOTYPE_STORE_PATH ?? ".apex/prototype.sqlite",
    env,
  });

  Bun.serve({
    port,
    hostname: "0.0.0.0",
    fetch: app.fetch,
  });
}
