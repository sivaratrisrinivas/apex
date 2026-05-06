import { waitUntil } from "@vercel/functions";

import { createApp } from "../src/server";
import { PrototypeStore } from "../src/signups";
import { VercelBlobSnapshotStore } from "../src/vercel-blob-store";

const DEFAULT_STALE_RUN_SECONDS = 330;
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
      env: process.env,
      recoverActiveRuns: false,
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
