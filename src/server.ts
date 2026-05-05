import { renderDashboard } from "./dashboard";
import {
  createCore2xEnrichmentWorker,
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
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.createDeveloperSignup(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

        if (result.enrichmentRun) {
          const enrichmentRunId = result.enrichmentRun.id;

          queueMicrotask(() => {
            void runEnrichmentRun(
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
        const result = store.generateOutreachDraft(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

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
        const isFormPost = isUrlEncodedFormPost(request);
        const result = store.requestManualRefresh(
          await readStructuredPayload(request),
        );

        if (!result.ok) {
          return jsonResponse(result.body, result.status);
        }

        const enrichmentRunId = result.enrichmentRun.id;

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
    return createCore2xEnrichmentWorker({
      taskClient: options.parallelTaskClient,
    });
  }

  const env = options.env ?? process.env;

  if (env.APEX_ENRICHMENT_MODE?.trim().toLowerCase() === "fake") {
    return createFakeParallelEnrichmentWorker();
  }

  if (!env.PARALLEL_API_KEY?.trim()) {
    return undefined;
  }

  return createCore2xEnrichmentWorker({
    taskClient: createParallelTaskClientFromEnv({ env }),
  });
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
    store.finishEnrichmentRun(
      enrichmentRunId,
      {
        status: "failed",
        failureReason: formatErrorMessage(error),
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
    fetch: app.fetch,
  });

  console.log(`Apex running at http://localhost:${port}`);
}
