import { waitUntil } from "@vercel/functions";

import {
  createParallelEnrichmentTaskRun,
  createParallelTaskClientFromEnv,
  tryRetrieveParallelEnrichmentTaskCompletion,
  type ParallelProcessor,
  type ParallelTaskClient,
} from "../src/enrichment";
import { createApp } from "../src/server";
import {
  PrototypeStore,
  type EnrichmentRun,
  type EnrichmentRunCompletion,
} from "../src/signups";
import { VercelBlobSnapshotStore } from "../src/vercel-blob-store";

const DEFAULT_STALE_RUN_SECONDS = 1800;
const DEFAULT_PARALLEL_POLL_SECONDS = 10;
const STALE_RUN_FAILURE_REASON =
  "Enrichment timed out on Vercel before a result could be saved. Start a new enrichment run to retry.";

export default {
  async fetch(request: Request): Promise<Response> {
    const prototypeStore = new PrototypeStore();
    const blobStore = process.env.BLOB_READ_WRITE_TOKEN
      ? new VercelBlobSnapshotStore()
      : null;
    const snapshot = await blobStore?.load();

    if (snapshot) {
      prototypeStore.restoreSnapshot(snapshot);
    }

    const staleRuns = prototypeStore.failActiveEnrichmentRunsOlderThan(
      new Date(Date.now() - staleRunSeconds() * 1000).toISOString(),
      STALE_RUN_FAILURE_REASON,
    );

    if (staleRuns.length > 0) {
      console.log(`[apex] Marked ${staleRuns.length} stale Vercel enrichment run${staleRuns.length === 1 ? "" : "s"} as failed`);
      await blobStore?.save(prototypeStore.createSnapshot());
    }

    const app = createApp({
      store: prototypeStore,
      enrichmentWorker: createVercelEnrichmentWorker(prototypeStore, blobStore),
      env: process.env,
      recoverActiveRuns: false,
      pollActiveRunsOnDashboardState: true,
      deferTask(task) {
        const deferred = task().catch((error) => {
          console.error("[apex] Deferred Vercel task failed:", error);
        });

        waitUntil(deferred);
      },
      async onStoreChanged() {
        await blobStore?.save(prototypeStore.createSnapshot());
      },
    });

    return app.fetch(rewriteVercelRequest(request));
  },
};

function rewriteVercelRequest(request: Request): Request {
  const url = new URL(request.url);
  const apexPath = url.searchParams.get("apexPath");

  if (apexPath === null) {
    return request;
  }

  url.pathname = apexPath.trim().length > 0 ? `/${apexPath}` : "/";
  url.searchParams.delete("apexPath");

  return new Request(url.toString(), request);
}

function staleRunSeconds(): number {
  const configured = Number(process.env.APEX_STALE_RUN_TIMEOUT_SECONDS);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_STALE_RUN_SECONDS;
}

function parallelPollSeconds(): number {
  const configured = Number(process.env.APEX_PARALLEL_POLL_SECONDS);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_PARALLEL_POLL_SECONDS;
}

function createVercelEnrichmentWorker(
  store: PrototypeStore,
  blobStore: VercelBlobSnapshotStore | null,
):
  | ((enrichmentRun: EnrichmentRun) => Promise<EnrichmentRunCompletion>)
  | undefined {
  if (!process.env.PARALLEL_API_KEY?.trim()) {
    return undefined;
  }

  const taskClient = createParallelTaskClientFromEnv({ env: process.env });
  const processor = parseParallelProcessor(process.env.APEX_PARALLEL_PROCESSOR);

  return async (enrichmentRun) => {
    const taskRunId = await ensureParallelTaskRunId({
      store,
      blobStore,
      taskClient,
      enrichmentRun,
      processor,
    });
    const pollSeconds = parallelPollSeconds();
    const completion = await tryRetrieveParallelEnrichmentTaskCompletion({
      taskClient,
      taskRunId,
      timeoutSeconds: pollSeconds,
      requestTimeoutSeconds: pollSeconds,
      retryDelayMilliseconds: 0,
    });

    if (!completion) {
      return {
        status: "deferred",
        reason: `Parallel task ${taskRunId} is still running.`,
      };
    }

    return completion;
  };
}

async function ensureParallelTaskRunId(options: {
  store: PrototypeStore;
  blobStore: VercelBlobSnapshotStore | null;
  taskClient: ParallelTaskClient;
  enrichmentRun: EnrichmentRun;
  processor?: ParallelProcessor;
}): Promise<string> {
  if (options.enrichmentRun.parallelTaskRunId) {
    console.log(`[apex]   → [Parallel] Resuming task run ${options.enrichmentRun.parallelTaskRunId}`);
    return options.enrichmentRun.parallelTaskRunId;
  }

  const taskRun = await createParallelEnrichmentTaskRun({
    taskClient: options.taskClient,
    enrichmentRun: options.enrichmentRun,
    processor: options.processor,
  });

  options.store.setEnrichmentRunParallelTaskRunId(
    options.enrichmentRun.id,
    taskRun.runId,
  );
  await options.blobStore?.save(options.store.createSnapshot());
  console.log(`[apex]   → [Parallel] Stored task run id ${taskRun.runId}`);

  return taskRun.runId;
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
