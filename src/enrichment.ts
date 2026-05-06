import type {
  CompanyEnrichmentContent,
  EnrichmentRun,
  EnrichmentRunCompletion,
  EvidenceBasisItem,
} from "./signups";

export interface JsonSchemaParameter {
  type: "json";
  json_schema: Record<string, unknown>;
}

export interface ParallelTaskSpec {
  input_schema?: JsonSchemaParameter;
  output_schema: JsonSchemaParameter;
}

export type ParallelProcessor =
  | "lite"
  | "base"
  | "core"
  | "core2x"
  | "pro"
  | "ultra"
  | "lite-fast"
  | "base-fast"
  | "core-fast"
  | "core2x-fast"
  | "pro-fast"
  | "ultra-fast";

export interface ParallelTaskRunRequest {
  input: {
    normalizedCompanyDomain: string;
    companyWebsite: string;
  };
  processor: ParallelProcessor;
  taskSpec: ParallelTaskSpec;
  metadata: Record<string, string | number | boolean>;
}

export interface ParallelTaskRunResult {
  output: {
    type: "json";
    content: unknown;
    basis?: unknown;
  };
}

export interface RetrieveTaskRunResultOptions {
  timeoutSeconds?: number;
  requestTimeoutSeconds?: number;
  retryDelayMilliseconds?: number;
}

export interface ParallelTaskClient {
  createTaskRun(request: ParallelTaskRunRequest): Promise<{ runId: string }>;
  retrieveTaskRunResult(
    runId: string,
    options?: RetrieveTaskRunResultOptions,
  ): Promise<ParallelTaskRunResult>;
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ParallelTaskClientFromEnvOptions {
  env?: Record<string, string | undefined>;
  fetch?: FetchImplementation;
}

const DEFAULT_RESULT_TOTAL_TIMEOUT_SECONDS = 600;
const DEFAULT_RESULT_REQUEST_TIMEOUT_SECONDS = 25;
const DEFAULT_RESULT_RETRY_DELAY_MILLISECONDS = 250;

export const ENRICHMENT_TASK_SPEC: ParallelTaskSpec = {
  input_schema: {
    type: "json",
    json_schema: {
      type: "object",
      properties: {
        normalizedCompanyDomain: {
          type: "string",
          description: "The canonical company domain Apex inferred from a Developer Signup.",
        },
        companyWebsite: {
          type: "string",
          description: "The public website URL for the company to enrich.",
        },
      },
      required: ["normalizedCompanyDomain", "companyWebsite"],
      additionalProperties: false,
    },
  },
  output_schema: {
    type: "json",
    json_schema: {
      type: "object",
      properties: {
        company: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The company's commonly used legal or brand name.",
            },
            domain: {
              type: "string",
              description: "The normalized company domain confirmed during research.",
            },
            headquarters: {
              type: "string",
              description: "The best-supported headquarters location, or Unknown.",
            },
            employeeRange: {
              type: "string",
              description: "The best-supported employee range.",
            },
          },
          required: ["name", "domain", "headquarters", "employeeRange"],
          additionalProperties: false,
        },
        funding: {
          type: "object",
          properties: {
            stage: {
              type: "string",
              description: "The latest known funding or maturity stage, or Unknown.",
            },
            totalRaised: {
              type: "string",
              description: "The best-supported total capital raised, or Unknown.",
            },
            latestRound: {
              type: "string",
              description: "The latest known funding round, or Unknown.",
            },
            latestRoundDate: {
              type: "string",
              description: "The latest funding round date in ISO-8601 format, or Unknown.",
            },
          },
          required: ["stage", "totalRaised", "latestRound", "latestRoundDate"],
          additionalProperties: false,
        },
        technicalSignals: {
          type: "object",
          properties: {
            aiWorkloads: {
              type: "string",
              description: "Evidence-backed AI, ML, data, or automation workloads.",
            },
            computeIntensity: {
              type: "string",
              description: "Low, Medium, High, or Unknown estimate of infrastructure intensity.",
            },
            developerToolRelevance: {
              type: "string",
              description: "Why the company is or is not relevant for developer-tool sales.",
            },
          },
          required: ["aiWorkloads", "computeIntensity", "developerToolRelevance"],
          additionalProperties: false,
        },
        salesSignals: {
          type: "object",
          properties: {
            keyReasons: {
              type: "array",
              items: { type: "string" },
              description: "Short reasons this Lead may deserve sales attention.",
            },
            suggestedNextAction: {
              type: "string",
              description: "The immediate sales action Apex should recommend.",
            },
          },
          required: ["keyReasons", "suggestedNextAction"],
          additionalProperties: false,
        },
        confidence: {
          type: "object",
          properties: {
            evidenceConfidence: {
              type: "string",
              description: "High, Medium, Low, or Unknown confidence in the evidence.",
            },
            notes: {
              type: "string",
              description: "Caveats, contradictions, or missing non-critical fields.",
            },
          },
          required: ["evidenceConfidence", "notes"],
          additionalProperties: false,
        },
        outreachSeed: {
          type: "object",
          properties: {
            personalizationAngles: {
              type: "array",
              items: { type: "string" },
              description: "Evidence-backed angles for a later Outreach Draft.",
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "Warnings that should constrain later personalization.",
            },
          },
          required: ["personalizationAngles", "warnings"],
          additionalProperties: false,
        },
      },
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
  },
};

/** @deprecated Use ENRICHMENT_TASK_SPEC instead. */
export const CORE2X_ENRICHMENT_TASK_SPEC: ParallelTaskSpec = ENRICHMENT_TASK_SPEC;

export function createParallelTaskClientFromEnv(
  options: ParallelTaskClientFromEnvOptions = {},
): ParallelTaskClient {
  const env = options.env ?? process.env;
  const apiKey = env.PARALLEL_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("PARALLEL_API_KEY must be set to run live Parallel enrichment.");
  }

  return new HttpParallelTaskClient({
    apiKey,
    baseUrl: env.PARALLEL_API_BASE_URL ?? "https://api.parallel.ai",
    fetch: options.fetch ?? fetch,
  });
}

/** @deprecated Use createEnrichmentWorker instead. */
export const createCore2xEnrichmentWorker = createEnrichmentWorker;

export function createEnrichmentWorker(options: {
  taskClient: ParallelTaskClient;
  processor?: ParallelProcessor;
  resultTimeoutSeconds?: number;
}): (enrichmentRun: EnrichmentRun) => Promise<EnrichmentRunCompletion> {
  const processor = options.processor ?? "core2x-fast";
  const resultTimeoutSeconds =
    options.resultTimeoutSeconds ?? DEFAULT_RESULT_TOTAL_TIMEOUT_SECONDS;

  return async (enrichmentRun) => {
    const taskRun = await createParallelEnrichmentTaskRun({
      taskClient: options.taskClient,
      enrichmentRun,
      processor,
    });
    console.log(`[apex]   → [Parallel] Task run created: ${taskRun.runId} — waiting for result (timeout: ${resultTimeoutSeconds}s)...`);
    return retrieveParallelEnrichmentTaskCompletion({
      taskClient: options.taskClient,
      taskRunId: taskRun.runId,
      timeoutSeconds: resultTimeoutSeconds,
    });
  };
}

async function createParallelEnrichmentTaskRun(options: {
  taskClient: ParallelTaskClient;
  enrichmentRun: EnrichmentRun;
  processor?: ParallelProcessor;
}): Promise<{ runId: string }> {
  const processor = options.processor ?? "core2x-fast";
  const enrichmentRun = options.enrichmentRun;

  console.log(`[apex]   → [Parallel] Creating task run for ${enrichmentRun.normalizedCompanyDomain} (processor: ${processor})`);

  return options.taskClient.createTaskRun({
    input: {
      normalizedCompanyDomain: enrichmentRun.normalizedCompanyDomain,
      companyWebsite: `https://${enrichmentRun.normalizedCompanyDomain}`,
    },
    processor,
    taskSpec: ENRICHMENT_TASK_SPEC,
    metadata: {
      apex_run: enrichmentRun.id,
      domain: enrichmentRun.normalizedCompanyDomain,
    },
  });
}

async function retrieveParallelEnrichmentTaskCompletion(options: {
  taskClient: ParallelTaskClient;
  taskRunId: string;
  timeoutSeconds?: number;
  requestTimeoutSeconds?: number;
  retryDelayMilliseconds?: number;
}): Promise<EnrichmentRunCompletion> {
  const result = await options.taskClient.retrieveTaskRunResult(options.taskRunId, {
    timeoutSeconds: options.timeoutSeconds,
    requestTimeoutSeconds: options.requestTimeoutSeconds,
    retryDelayMilliseconds: options.retryDelayMilliseconds,
  });

  return parseParallelEnrichmentTaskResult(result);
}

function parseParallelEnrichmentTaskResult(
  result: ParallelTaskRunResult,
): EnrichmentRunCompletion {
    console.log(`[apex]   → [Parallel] Task run result received`);
    const parsedContent = parseCompanyEnrichmentContent(result.output.content);

    return {
      status: parsedContent.partialReasons.length > 0 ? "partial" : "completed",
      companyEnrichment: {
        content: parsedContent.content,
        evidenceBasis: parseEvidenceBasis(result.output.basis),
      },
    };
}

export function createFakeParallelEnrichmentWorker(): (
  enrichmentRun: EnrichmentRun,
) => Promise<EnrichmentRunCompletion> {
  return async (enrichmentRun) => {
    console.log(`[apex]   → [Fake] Looking up fixture for: ${enrichmentRun.normalizedCompanyDomain}`);
    const fixture = FAKE_PARALLEL_ENRICHMENT_FIXTURES[
      enrichmentRun.normalizedCompanyDomain
    ];

    if (!fixture) {
      console.log(`[apex]   → [Fake] No fixture found — returning failure`);
      return {
        status: "failed",
        failureReason: `No fake Parallel enrichment fixture exists for ${enrichmentRun.normalizedCompanyDomain}.`,
      };
    }

    console.log(`[apex]   → [Fake] Fixture found — returning ${fixture.status} enrichment`);
    return structuredClone(fixture);
  };
}

const FAKE_PARALLEL_ENRICHMENT_FIXTURES: Record<
  string,
  EnrichmentRunCompletion
> = {
  "modal.com": {
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
          aiWorkloads: "Serverless infrastructure for AI workloads.",
          computeIntensity: "High",
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
  },
  "runpod.io": {
    status: "partial",
    companyEnrichment: {
      content: {
        company: {
          name: "RunPod",
          domain: "runpod.io",
          headquarters: "Unknown",
          employeeRange: "51-200 employees",
        },
        funding: {
          stage: "Unknown",
          totalRaised: "Unknown",
          latestRound: "Unknown",
          latestRoundDate: "Unknown",
        },
        technicalSignals: {
          aiWorkloads: "GPU cloud infrastructure for AI workloads.",
          computeIntensity: "High",
          developerToolRelevance:
            "Developer-facing GPU infrastructure is relevant to Parallel-style automation teams.",
        },
        salesSignals: {
          keyReasons: ["GPU infrastructure workload", "Developer platform signal"],
          suggestedNextAction: "Verify current funding before outreach.",
        },
        confidence: {
          evidenceConfidence: "Medium",
          notes: "Technical signals are usable, but funding details are incomplete.",
        },
        outreachSeed: {
          personalizationAngles: ["GPU infrastructure for AI teams"],
          warnings: ["Funding details are incomplete."],
        },
      },
      evidenceBasis: [
        {
          field: "technicalSignals.computeIntensity",
          confidence: "medium",
          reasoning:
            "RunPod presents itself as cloud infrastructure for GPU-heavy AI workloads.",
          citations: [
            {
              title: "RunPod platform overview",
              url: "https://runpod.io",
              excerpts: ["GPU cloud infrastructure for AI workloads."],
            },
          ],
        },
        {
          field: "funding.stage",
          confidence: "low",
          reasoning:
            "The fake fixture intentionally leaves funding unresolved to exercise Partial Enrichment.",
          citations: [
            {
              title: "Fake fixture caveat",
              url: "https://runpod.io",
              excerpts: ["Funding details are incomplete."],
            },
          ],
        },
      ],
    },
  },
};

class HttpParallelTaskClient implements ParallelTaskClient {
  private apiKey: string;
  private baseUrl: string;
  private fetch: FetchImplementation;

  constructor(options: {
    apiKey: string;
    baseUrl: string;
    fetch: FetchImplementation;
  }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch;
  }

  async createTaskRun(request: ParallelTaskRunRequest): Promise<{ runId: string }> {
    console.log(`[apex]   → [Parallel API] POST /v1/tasks/runs for ${request.input.normalizedCompanyDomain}`);
    const response = await this.fetch(`${this.baseUrl}/v1/tasks/runs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        input: request.input,
        processor: request.processor,
        task_spec: request.taskSpec,
        metadata: request.metadata,
      }),
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      console.log(`[apex]   → [Parallel API] Create task run failed: HTTP ${response.status}`);
      throw parallelApiError("create task run", response, body);
    }

    const taskRun = expectRecord(body, "Parallel task run response");
    const runId = expectString(taskRun.run_id, "Parallel task run response.run_id");
    console.log(`[apex]   → [Parallel API] Task run created: ${runId}`);

    return { runId };
  }

  async retrieveTaskRunResult(
    runId: string,
    options: RetrieveTaskRunResultOptions = {},
  ): Promise<ParallelTaskRunResult> {
    const totalTimeoutSeconds = positiveNumberOrDefault(
      options.timeoutSeconds,
      DEFAULT_RESULT_TOTAL_TIMEOUT_SECONDS,
    );
    const requestTimeoutSeconds = Math.min(
      positiveNumberOrDefault(
        options.requestTimeoutSeconds,
        DEFAULT_RESULT_REQUEST_TIMEOUT_SECONDS,
      ),
      totalTimeoutSeconds,
    );
    const retryDelayMilliseconds = Math.max(
      0,
      options.retryDelayMilliseconds ?? DEFAULT_RESULT_RETRY_DELAY_MILLISECONDS,
    );
    const deadline = Date.now() + totalTimeoutSeconds * 1000;
    let attempt = 0;
    let lastNotReadyError: Error | undefined;

    while (Date.now() < deadline) {
      attempt += 1;
      const remainingSeconds = Math.max(
        1,
        Math.ceil((deadline - Date.now()) / 1000),
      );
      const timeoutForAttemptSeconds = Math.min(
        requestTimeoutSeconds,
        remainingSeconds,
      );

      try {
        return await this.retrieveTaskRunResultOnce(
          runId,
          timeoutForAttemptSeconds,
          attempt,
          totalTimeoutSeconds,
        );
      } catch (error) {
        if (!(error instanceof ParallelResultNotReadyError)) {
          throw error;
        }

        lastNotReadyError = error instanceof Error ? error : undefined;

        if (Date.now() >= deadline) {
          break;
        }

        console.log(
          `[apex]   → [Parallel API] Result not ready yet; retrying (attempt ${attempt})`,
        );

        await delay(
          Math.min(retryDelayMilliseconds, Math.max(0, deadline - Date.now())),
        );
      }
    }

    const detail = lastNotReadyError
      ? `: ${lastNotReadyError.message}`
      : ".";

    throw new ParallelResultNotReadyError(
      `Parallel Task API retrieve task run result timed out after ${totalTimeoutSeconds}s${detail}`,
    );
  }

  private async retrieveTaskRunResultOnce(
    runId: string,
    timeoutSeconds: number,
    attempt: number,
    totalTimeoutSeconds: number,
  ): Promise<ParallelTaskRunResult> {
    const url = new URL(
      `${this.baseUrl}/v1/tasks/runs/${encodeURIComponent(runId)}/result`,
    );
    url.searchParams.set("timeout", String(timeoutSeconds));

    console.log(
      `[apex]   → [Parallel API] GET /v1/tasks/runs/${runId}/result (attempt ${attempt}, request timeout: ${timeoutSeconds}s, budget: ${totalTimeoutSeconds}s)`,
    );
    let response: Response;

    try {
      response = await this.fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-api-key": this.apiKey,
        },
      });
    } catch (error) {
      if (isLikelyTimeoutError(error)) {
        throw new ParallelResultNotReadyError(
          `Parallel task run result request timed out after ${timeoutSeconds}s.`,
        );
      }

      throw error;
    }

    const body = await readJsonResponse(response);

    if (!response.ok) {
      if (response.status === 408) {
        throw new ParallelResultNotReadyError(
          `Parallel task run result was not ready after ${timeoutSeconds}s.`,
        );
      }

      if (response.status === 404) {
        throw new Error(
          `Parallel Task API task run failed or not found (HTTP 404).`,
        );
      }

      console.log(
        `[apex]   → [Parallel API] Retrieve result failed: HTTP ${response.status}`,
      );
      throw parallelApiError("retrieve task run result", response, body);
    }

    const result = expectRecord(body, "Parallel task run result");
    const run =
      result.run === undefined
        ? undefined
        : expectRecord(result.run, "Parallel task run result.run");

    if (run?.status === "failed") {
      console.log(`[apex]   → [Parallel API] Task run failed on server side`);
      throw new Error(
        `Parallel Task API task run failed: ${extractParallelErrorMessage(run.error)}`,
      );
    }

    if (isActiveTaskRunStatus(run?.status)) {
      throw new ParallelResultNotReadyError(
        `Parallel task run is still ${String(run?.status)}.`,
      );
    }

    console.log(`[apex]   → [Parallel API] Result received successfully`);

    const output = expectRecord(result.output, "Parallel task run result.output");

    if (output.type !== "json") {
      throw new Error("Parallel task run result.output.type must be json.");
    }

    return {
      output: {
        type: "json",
        content: output.content,
        basis: output.basis,
      },
    };
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
    };
  }
}

class ParallelResultNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParallelResultNotReadyError";
  }
}

function positiveNumberOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function isLikelyTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("timeout") || message.includes("timed out");
}

function isActiveTaskRunStatus(status: unknown): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "action_required" ||
    status === "cancelling"
  );
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parallelApiError(
  action: string,
  response: Response,
  body: unknown,
): Error {
  return new Error(
    `Parallel Task API ${action} failed with HTTP ${response.status}: ${extractParallelErrorMessage(body)}`,
  );
}

function extractParallelErrorMessage(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "Unknown Parallel API error.";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim().length > 0) {
    return record.message;
  }

  if (record.error) {
    return extractParallelErrorMessage(record.error);
  }

  return "Unknown Parallel API error.";
}

function parseCompanyEnrichmentContent(value: unknown): {
  content: CompanyEnrichmentContent;
  partialReasons: string[];
} {
  const content = expectRecord(value, "Parallel result content");
  const partialReasons: string[] = [];
  const company = parseCompanySection(content.company, partialReasons);
  const funding = parseFundingSection(content.funding, partialReasons);
  const technicalSignals = parseTechnicalSignals(
    content.technicalSignals,
    partialReasons,
  );
  const salesSignals = parseSalesSignals(content.salesSignals, partialReasons);
  const confidence = parseConfidence(content.confidence, partialReasons);
  const outreachSeed = parseOutreachSeed(content.outreachSeed, partialReasons);

  if (partialReasons.length > 0) {
    confidence.evidenceConfidence = "Low";
    confidence.notes = appendPartialNotes(confidence.notes, partialReasons);
  }

  return {
    content: {
      company,
      funding,
      technicalSignals,
      salesSignals,
      confidence,
      outreachSeed,
    },
    partialReasons,
  };
}

function parseCompanySection(
  value: unknown,
  partialReasons: string[],
): CompanyEnrichmentContent["company"] {
  const section = expectRecord(value, "company");

  return {
    name: expectString(section.name, "company.name"),
    domain: expectString(section.domain, "company.domain"),
    headquarters: parseOptionalStringField(
      section.headquarters,
      "company.headquarters",
      partialReasons,
      "Unknown",
    ),
    employeeRange: parseOptionalStringField(
      section.employeeRange,
      "company.employeeRange",
      partialReasons,
      "Unknown",
    ),
  };
}

function parseFundingSection(
  value: unknown,
  partialReasons: string[],
): CompanyEnrichmentContent["funding"] {
  const section = parseOptionalRecord(value, "funding", partialReasons);

  return {
    stage: parseOptionalStringField(
      section.stage,
      "funding.stage",
      partialReasons,
      "Unknown",
    ),
    totalRaised: parseOptionalStringField(
      section.totalRaised,
      "funding.totalRaised",
      partialReasons,
      "Unknown",
    ),
    latestRound: parseOptionalStringField(
      section.latestRound,
      "funding.latestRound",
      partialReasons,
      "Unknown",
    ),
    latestRoundDate: parseOptionalStringField(
      section.latestRoundDate,
      "funding.latestRoundDate",
      partialReasons,
      "Unknown",
    ),
  };
}

function parseTechnicalSignals(
  value: unknown,
  partialReasons: string[],
): CompanyEnrichmentContent["technicalSignals"] {
  const section = parseOptionalRecord(
    value,
    "technicalSignals",
    partialReasons,
  );

  return {
    aiWorkloads: parseOptionalStringField(
      section.aiWorkloads,
      "technicalSignals.aiWorkloads",
      partialReasons,
      "Unknown",
    ),
    computeIntensity: parseOptionalStringField(
      section.computeIntensity,
      "technicalSignals.computeIntensity",
      partialReasons,
      "Unknown",
    ),
    developerToolRelevance: parseOptionalStringField(
      section.developerToolRelevance,
      "technicalSignals.developerToolRelevance",
      partialReasons,
      "Unknown",
    ),
  };
}

function parseSalesSignals(
  value: unknown,
  partialReasons: string[],
): CompanyEnrichmentContent["salesSignals"] {
  const section = parseOptionalRecord(value, "salesSignals", partialReasons);

  return {
    keyReasons: parseOptionalStringArrayField(
      section.keyReasons,
      "salesSignals.keyReasons",
      partialReasons,
      ["Company identity confirmed with incomplete enrichment."],
    ),
    suggestedNextAction: parseOptionalStringField(
      section.suggestedNextAction,
      "salesSignals.suggestedNextAction",
      partialReasons,
      "Review available Evidence Basis before outreach.",
    ),
  };
}

function parseConfidence(
  value: unknown,
  partialReasons: string[],
): CompanyEnrichmentContent["confidence"] {
  const section = parseOptionalRecord(value, "confidence", partialReasons);

  return {
    evidenceConfidence: parseOptionalStringField(
      section.evidenceConfidence,
      "confidence.evidenceConfidence",
      partialReasons,
      "Low",
    ),
    notes: parseOptionalStringField(
      section.notes,
      "confidence.notes",
      partialReasons,
      "No confidence notes returned.",
    ),
  };
}

function parseOutreachSeed(
  value: unknown,
  partialReasons: string[],
): CompanyEnrichmentContent["outreachSeed"] {
  const section = parseOptionalRecord(value, "outreachSeed", partialReasons);

  return {
    personalizationAngles: parseOptionalStringArrayField(
      section.personalizationAngles,
      "outreachSeed.personalizationAngles",
      partialReasons,
      [],
    ),
    warnings: parseOptionalStringArrayField(
      section.warnings,
      "outreachSeed.warnings",
      partialReasons,
      ["Enrichment was partial; verify evidence before personalization."],
    ),
  };
}

function parseOptionalRecord(
  value: unknown,
  field: string,
  partialReasons: string[],
): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  partialReasons.push(field);
  return {};
}

function parseOptionalStringField(
  value: unknown,
  field: string,
  partialReasons: string[],
  fallback: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  partialReasons.push(field);
  return fallback;
}

function parseOptionalStringArrayField(
  value: unknown,
  field: string,
  partialReasons: string[],
  fallback: string[],
): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  partialReasons.push(field);
  return fallback;
}

function appendPartialNotes(notes: string, partialReasons: string[]): string {
  const partialNote = `Parallel omitted or returned invalid non-critical fields: ${[
    ...new Set(partialReasons),
  ].join(", ")}.`;

  if (notes === "No confidence notes returned.") {
    return partialNote;
  }

  return `${notes} ${partialNote}`;
}

function parseEvidenceBasis(value: unknown): EvidenceBasisItem[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Parallel result basis must be an array.");
  }

  return value.map((item, index) => parseEvidenceBasisItem(item, index));
}

function parseEvidenceBasisItem(value: unknown, index: number): EvidenceBasisItem {
  const item = expectRecord(value, `basis[${index}]`);

  return {
    field: expectString(item.field, `basis[${index}].field`),
    citations: parseCitations(item.citations, index),
    reasoning: expectString(item.reasoning, `basis[${index}].reasoning`),
    confidence: expectString(item.confidence, `basis[${index}].confidence`),
  };
}

function parseCitations(value: unknown, basisIndex: number): EvidenceBasisItem["citations"] {
  if (!Array.isArray(value)) {
    throw new Error(`basis[${basisIndex}].citations must be an array.`);
  }

  return value.map((citation, citationIndex) => {
    const citationRecord = expectRecord(
      citation,
      `basis[${basisIndex}].citations[${citationIndex}]`,
    );

    return {
      title: expectString(
        citationRecord.title,
        `basis[${basisIndex}].citations[${citationIndex}].title`,
      ),
      url: expectString(
        citationRecord.url,
        `basis[${basisIndex}].citations[${citationIndex}].url`,
      ),
      excerpts: expectStringArray(
        citationRecord.excerpts,
        `basis[${basisIndex}].citations[${citationIndex}].excerpts`,
      ),
    };
  });
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  return value;
}

function expectStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings.`);
  }

  return value;
}
