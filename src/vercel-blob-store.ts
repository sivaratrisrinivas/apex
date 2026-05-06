import { get, put } from "@vercel/blob";

import type {
  PrototypeStoreSnapshot,
  PrototypeStoreSnapshotRow,
  PrototypeStoreSnapshotTable,
} from "./signups";

const SNAPSHOT_TABLES: PrototypeStoreSnapshotTable[] = [
  "developer_signups",
  "companies",
  "leads",
  "enrichment_runs",
  "company_enrichments",
  "outreach_drafts",
];

export interface VercelBlobSnapshotStoreOptions {
  pathname?: string;
  token?: string;
}

export class VercelBlobSnapshotStore {
  private readonly pathname: string;
  private readonly token?: string;

  constructor(options: VercelBlobSnapshotStoreOptions = {}) {
    this.pathname =
      options.pathname ??
      process.env.APEX_VERCEL_BLOB_STATE_PATH ??
      "apex/prototype-state.json";
    this.token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
  }

  async load(): Promise<PrototypeStoreSnapshot | null> {
    const result = await get(this.pathname, {
      access: "private",
      useCache: false,
      token: this.token,
    });

    if (!result || result.statusCode !== 200) {
      return null;
    }

    const parsed = await new Response(result.stream).json();

    if (!isPrototypeStoreSnapshot(parsed)) {
      throw new Error("Vercel Blob Apex state is not a valid store snapshot.");
    }

    return parsed;
  }

  async save(snapshot: PrototypeStoreSnapshot): Promise<void> {
    await put(this.pathname, JSON.stringify(snapshot), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 60,
      token: this.token,
    });
  }
}

function isPrototypeStoreSnapshot(
  value: unknown,
): value is PrototypeStoreSnapshot {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.tables)) {
    return false;
  }

  const tables = value.tables;

  return SNAPSHOT_TABLES.every((tableName) => {
    const rows = tables[tableName];

    return Array.isArray(rows) && rows.every(isSnapshotRow);
  });
}

function isSnapshotRow(value: unknown): value is PrototypeStoreSnapshotRow {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((rowValue) => {
    return (
      typeof rowValue === "string" ||
      typeof rowValue === "number" ||
      rowValue === null
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
