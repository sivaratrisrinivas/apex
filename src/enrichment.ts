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
  input_schema: JsonSchemaParameter;
  output_schema: JsonSchemaParameter;
}

export interface ParallelTaskRunRequest {
  input: {
    normalizedCompanyDomain: string;
    companyWebsite: string;
  };
  processor: "core2x";
  taskSpec: ParallelTaskSpec;
  metadata: Record<string, string>;
}

export interface ParallelTaskRunResult {
  output: {
    type: "json";
    content: unknown;
    basis?: unknown;
  };
}

export interface ParallelTaskClient {
  createTaskRun(request: ParallelTaskRunRequest): Promise<{ runId: string }>;
  retrieveTaskRunResult(
    runId: string,
    options?: { timeoutSeconds?: number },
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

export const CORE2X_ENRICHMENT_TASK_SPEC: ParallelTaskSpec = {
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

export function createParallelTaskClientFromEnv(
  options: ParallelTaskClientFromEnvOptions = {},
): ParallelTaskClient {
  const env = options.env ?? process.env;
  const apiKey = env.PARALLEL_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("PARALLEL_API_KEY must be set to run live Core2x Enrichment.");
  }

  return new HttpParallelTaskClient({
    apiKey,
    baseUrl: env.PARALLEL_API_BASE_URL ?? "https://api.parallel.ai",
    fetch: options.fetch ?? fetch,
  });
}

export function createCore2xEnrichmentWorker(options: {
  taskClient: ParallelTaskClient;
}): (enrichmentRun: EnrichmentRun) => Promise<EnrichmentRunCompletion> {
  return async (enrichmentRun) => {
    console.log(`[apex]   → [Core2x] Creating task run for ${enrichmentRun.normalizedCompanyDomain}`);
    const taskRun = await options.taskClient.createTaskRun({
      input: {
        normalizedCompanyDomain: enrichmentRun.normalizedCompanyDomain,
        companyWebsite: `https://${enrichmentRun.normalizedCompanyDomain}`,
      },
      processor: "core2x",
      taskSpec: CORE2X_ENRICHMENT_TASK_SPEC,
      metadata: {
        apex_run: enrichmentRun.id,
        domain: enrichmentRun.normalizedCompanyDomain,
      },
    });
    console.log(`[apex]   → [Core2x] Task run created: ${taskRun.runId} — waiting for result (timeout: 600s)...`);
    const result = await options.taskClient.retrieveTaskRunResult(taskRun.runId, {
      timeoutSeconds: 600,
    });
    console.log(`[apex]   → [Core2x] Task run result received`);

    return {
      status: "completed",
      companyEnrichment: {
        content: parseCompanyEnrichmentContent(result.output.content),
        evidenceBasis: parseEvidenceBasis(result.output.basis),
      },
    };
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
    options: { timeoutSeconds?: number } = {},
  ): Promise<ParallelTaskRunResult> {
    const url = new URL(
      `${this.baseUrl}/v1/tasks/runs/${encodeURIComponent(runId)}/result`,
    );

    if (options.timeoutSeconds !== undefined) {
      url.searchParams.set("timeout", String(options.timeoutSeconds));
    }

    console.log(`[apex]   → [Parallel API] GET /v1/tasks/runs/${runId}/result`);
    const response = await this.fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": this.apiKey,
      },
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      console.log(`[apex]   → [Parallel API] Retrieve result failed: HTTP ${response.status}`);
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

function parseCompanyEnrichmentContent(value: unknown): CompanyEnrichmentContent {
  const content = expectRecord(value, "Parallel result content");

  return {
    company: parseCompanySection(content.company),
    funding: parseFundingSection(content.funding),
    technicalSignals: parseTechnicalSignals(content.technicalSignals),
    salesSignals: parseSalesSignals(content.salesSignals),
    confidence: parseConfidence(content.confidence),
    outreachSeed: parseOutreachSeed(content.outreachSeed),
  };
}

function parseCompanySection(value: unknown): CompanyEnrichmentContent["company"] {
  const section = expectRecord(value, "company");

  return {
    name: expectString(section.name, "company.name"),
    domain: expectString(section.domain, "company.domain"),
    headquarters: expectString(section.headquarters, "company.headquarters"),
    employeeRange: expectString(section.employeeRange, "company.employeeRange"),
  };
}

function parseFundingSection(value: unknown): CompanyEnrichmentContent["funding"] {
  const section = expectRecord(value, "funding");

  return {
    stage: expectString(section.stage, "funding.stage"),
    totalRaised: expectString(section.totalRaised, "funding.totalRaised"),
    latestRound: expectString(section.latestRound, "funding.latestRound"),
    latestRoundDate: expectString(section.latestRoundDate, "funding.latestRoundDate"),
  };
}

function parseTechnicalSignals(
  value: unknown,
): CompanyEnrichmentContent["technicalSignals"] {
  const section = expectRecord(value, "technicalSignals");

  return {
    aiWorkloads: expectString(section.aiWorkloads, "technicalSignals.aiWorkloads"),
    computeIntensity: expectString(
      section.computeIntensity,
      "technicalSignals.computeIntensity",
    ),
    developerToolRelevance: expectString(
      section.developerToolRelevance,
      "technicalSignals.developerToolRelevance",
    ),
  };
}

function parseSalesSignals(value: unknown): CompanyEnrichmentContent["salesSignals"] {
  const section = expectRecord(value, "salesSignals");

  return {
    keyReasons: expectStringArray(section.keyReasons, "salesSignals.keyReasons"),
    suggestedNextAction: expectString(
      section.suggestedNextAction,
      "salesSignals.suggestedNextAction",
    ),
  };
}

function parseConfidence(value: unknown): CompanyEnrichmentContent["confidence"] {
  const section = expectRecord(value, "confidence");

  return {
    evidenceConfidence: expectString(
      section.evidenceConfidence,
      "confidence.evidenceConfidence",
    ),
    notes: expectString(section.notes, "confidence.notes"),
  };
}

function parseOutreachSeed(value: unknown): CompanyEnrichmentContent["outreachSeed"] {
  const section = expectRecord(value, "outreachSeed");

  return {
    personalizationAngles: expectStringArray(
      section.personalizationAngles,
      "outreachSeed.personalizationAngles",
    ),
    warnings: expectStringArray(section.warnings, "outreachSeed.warnings"),
  };
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
