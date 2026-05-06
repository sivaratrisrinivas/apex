import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

import type { OutreachDraftWriter } from "./gemini";
import { scoreLead, type LeadScoreBreakdown } from "./scoring";

export type SignupQualification = "qualified" | "unqualified";
export type UnqualifiedSignupReason =
  | "personal-domain"
  | "educational-domain"
  | "disposable-domain"
  | "ambiguous-domain";
export type EnrichmentStatus =
  | "pending"
  | "researching"
  | "completed"
  | "partial"
  | "unqualified"
  | "failed";

export interface EnrichmentCitation {
  title: string;
  url: string;
  excerpts: string[];
}

export interface EvidenceBasisItem {
  field: string;
  citations: EnrichmentCitation[];
  reasoning: string;
  confidence: string;
}

export interface CompanyEnrichmentContent {
  company: {
    name: string;
    domain: string;
    headquarters: string;
    employeeRange: string;
  };
  funding: {
    stage: string;
    totalRaised: string;
    latestRound: string;
    latestRoundDate: string;
  };
  technicalSignals: {
    aiWorkloads: string;
    computeIntensity: string;
    developerToolRelevance: string;
  };
  salesSignals: {
    keyReasons: string[];
    suggestedNextAction: string;
  };
  confidence: {
    evidenceConfidence: string;
    notes: string;
  };
  outreachSeed: {
    personalizationAngles: string[];
    warnings: string[];
  };
}

export interface CompanyEnrichmentResult {
  content: CompanyEnrichmentContent;
  evidenceBasis: EvidenceBasisItem[];
}

export type EnrichmentRunCompletion =
  | { status: "completed" | "partial"; companyEnrichment?: CompanyEnrichmentResult }
  | { status: "failed"; failureReason: string }
  | { status: "deferred"; reason: string };

export interface DemoSignupPayload {
  email: unknown;
  source?: unknown;
  name?: unknown;
  signedUpAt?: unknown;
}

export interface DeveloperSignup {
  id: string;
  email: string;
  source: string;
  name?: string;
  signedUpAt: string;
  normalizedCompanyDomain: string;
  qualification: SignupQualification;
  unqualifiedReason?: UnqualifiedSignupReason;
}

export interface Company {
  id: string;
  normalizedCompanyDomain: string;
  createdAt: string;
}

export interface EnrichmentRun {
  id: string;
  developerSignupId: string;
  companyId: string;
  normalizedCompanyDomain: string;
  status: EnrichmentStatus;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureReason?: string;
  parallelTaskRunId?: string;
}

export interface CompanyEnrichment {
  id: string;
  companyId: string;
  enrichmentRunId: string;
  normalizedCompanyDomain: string;
  status: "completed" | "partial";
  companyName: string;
  content: CompanyEnrichmentContent;
  evidenceBasis: EvidenceBasisItem[];
  createdAt: string;
}

export type OutreachDraftStatus = "ready" | "needs-evidence";

export interface OutreachDraft {
  id: string;
  leadId: string;
  companyId: string;
  normalizedCompanyDomain: string;
  companyName: string;
  status: OutreachDraftStatus;
  subject: string;
  body: string;
  evidenceReferences: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadQueueRecord {
  id: string;
  companyId: string;
  companyName: string;
  normalizedCompanyDomain: string;
  enrichmentStatus: EnrichmentStatus;
  leadScore: number | null;
  scoreBreakdown: LeadScoreBreakdown | null;
  scoreReasons: string[];
  evidenceConfidence: string;
  signupCount: number;
  latestSignupAt: string;
  suggestedNextAction: string;
  keyReasons: string[];
  evidenceBasis: EvidenceBasisItem[];
  companyEnrichment?: CompanyEnrichment;
  outreachDraft?: OutreachDraft;
}

export type LeadQueueSort = "score" | "recent";

export interface SignupValidationError {
  error: string;
}

export type SignupIntakeResult =
  | { ok: true; developerSignup: DeveloperSignup; enrichmentRun?: EnrichmentRun }
  | { ok: false; status: 400; body: SignupValidationError };

export interface ManualRefreshPayload {
  normalizedCompanyDomain: unknown;
}

export interface ManualRefreshError {
  error: string;
}

export type ManualRefreshResult =
  | { ok: true; enrichmentRun: EnrichmentRun }
  | { ok: false; status: 400 | 404 | 409; body: ManualRefreshError };

export interface OutreachDraftPayload {
  normalizedCompanyDomain: unknown;
  regenerate?: unknown;
}

export interface OutreachDraftError {
  error: string;
}

export type OutreachDraftGenerationResult =
  | { ok: true; outreachDraft: OutreachDraft; reusedExisting: boolean }
  | { ok: false; status: 400 | 404 | 409; body: OutreachDraftError };

const FRESHNESS_WINDOW_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

interface PrototypeStoreOptions {
  databasePath?: string;
}

export type PrototypeStoreSnapshotRow = Record<
  string,
  string | number | null
>;

export type PrototypeStoreSnapshotTable =
  | "developer_signups"
  | "companies"
  | "leads"
  | "enrichment_runs"
  | "company_enrichments"
  | "outreach_drafts";

export interface PrototypeStoreSnapshot {
  version: 1;
  tables: Record<PrototypeStoreSnapshotTable, PrototypeStoreSnapshotRow[]>;
}

interface DeveloperSignupRow {
  id: string;
  email: string;
  source: string;
  name: string | null;
  signed_up_at: string;
  normalized_company_domain: string;
  qualification: SignupQualification;
  unqualified_reason: UnqualifiedSignupReason | null;
}

interface CompanyRow {
  id: string;
  normalized_company_domain: string;
  created_at: string;
}

interface LeadRow {
  id: string;
  company_id: string;
  normalized_company_domain: string;
  enrichment_status: EnrichmentStatus;
  lead_score: number | null;
  score_breakdown_json: string | null;
  score_reasons_json: string | null;
  signup_count: number;
  latest_signup_at: string;
  company_enrichment_id: string | null;
  enrichment_run_id: string | null;
  company_enrichment_status: "completed" | "partial" | null;
  enriched_company_name: string | null;
  content_json: string | null;
  evidence_basis_json: string | null;
  company_enrichment_created_at: string | null;
  outreach_draft_id: string | null;
  outreach_draft_lead_id: string | null;
  outreach_draft_company_name: string | null;
  outreach_draft_status: OutreachDraftStatus | null;
  outreach_draft_subject: string | null;
  outreach_draft_body: string | null;
  outreach_draft_evidence_references_json: string | null;
  outreach_draft_created_at: string | null;
  outreach_draft_updated_at: string | null;
}

interface EnrichmentRunRow {
  sequence: number;
  id: string;
  developer_signup_id: string;
  company_id: string;
  normalized_company_domain: string;
  status: EnrichmentStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  failure_reason: string | null;
  parallel_task_run_id: string | null;
}

interface CompanyEnrichmentRow {
  id: string;
  company_id: string;
  enrichment_run_id: string;
  normalized_company_domain: string;
  status: "completed" | "partial";
  company_name: string;
  content_json: string;
  evidence_basis_json: string;
  created_at: string;
}

interface OutreachDraftRow {
  id: string;
  lead_id: string;
  company_id: string;
  normalized_company_domain: string;
  company_name: string;
  status: OutreachDraftStatus;
  subject: string;
  body: string;
  evidence_references_json: string;
  created_at: string;
  updated_at: string;
}

const SNAPSHOT_TABLES_IN_RESTORE_ORDER: PrototypeStoreSnapshotTable[] = [
  "developer_signups",
  "companies",
  "leads",
  "enrichment_runs",
  "company_enrichments",
  "outreach_drafts",
];

const SNAPSHOT_TABLES_IN_DELETE_ORDER = [
  ...SNAPSHOT_TABLES_IN_RESTORE_ORDER,
].reverse();

const SNAPSHOT_TABLE_COLUMNS: Record<PrototypeStoreSnapshotTable, string[]> = {
  developer_signups: [
    "sequence",
    "id",
    "email",
    "source",
    "name",
    "signed_up_at",
    "normalized_company_domain",
    "qualification",
    "unqualified_reason",
  ],
  companies: [
    "sequence",
    "id",
    "normalized_company_domain",
    "created_at",
  ],
  leads: [
    "sequence",
    "id",
    "company_id",
    "enrichment_status",
    "lead_score",
    "score_breakdown_json",
    "score_reasons_json",
    "signup_count",
    "latest_signup_at",
    "created_at",
  ],
  enrichment_runs: [
    "sequence",
    "id",
    "developer_signup_id",
    "company_id",
    "normalized_company_domain",
    "status",
    "requested_at",
    "started_at",
    "finished_at",
    "failure_reason",
    "parallel_task_run_id",
  ],
  company_enrichments: [
    "sequence",
    "id",
    "company_id",
    "enrichment_run_id",
    "normalized_company_domain",
    "status",
    "company_name",
    "content_json",
    "evidence_basis_json",
    "created_at",
  ],
  outreach_drafts: [
    "sequence",
    "id",
    "lead_id",
    "company_id",
    "normalized_company_domain",
    "company_name",
    "status",
    "subject",
    "body",
    "evidence_references_json",
    "created_at",
    "updated_at",
  ],
};

export class PrototypeStore {
  private database: Database;

  constructor(options: PrototypeStoreOptions = {}) {
    const databasePath = options.databasePath ?? ":memory:";

    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.database = new Database(databasePath);
    this.database.run("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  createSnapshot(): PrototypeStoreSnapshot {
    return {
      version: 1,
      tables: Object.fromEntries(
        SNAPSHOT_TABLES_IN_RESTORE_ORDER.map((tableName) => [
          tableName,
          this.database
            .query(`SELECT * FROM ${tableName} ORDER BY sequence ASC`)
            .all() as PrototypeStoreSnapshotRow[],
        ]),
      ) as Record<PrototypeStoreSnapshotTable, PrototypeStoreSnapshotRow[]>,
    };
  }

  restoreSnapshot(snapshot: PrototypeStoreSnapshot): void {
    for (const tableName of SNAPSHOT_TABLES_IN_DELETE_ORDER) {
      this.database.run(`DELETE FROM ${tableName}`);
    }

    for (const tableName of SNAPSHOT_TABLES_IN_RESTORE_ORDER) {
      for (const row of snapshot.tables[tableName]) {
        const columnNames = SNAPSHOT_TABLE_COLUMNS[tableName].filter(
          (columnName) => Object.hasOwn(row, columnName),
        );
        if (columnNames.length === 0) {
          continue;
        }

        const placeholders = columnNames.map(() => "?").join(", ");
        this.database.run(
          `
            INSERT INTO ${tableName} (${columnNames.join(", ")})
            VALUES (${placeholders})
          `,
          columnNames.map((columnName) => row[columnName]),
        );
      }
    }
  }

  createDeveloperSignup(payload: unknown): SignupIntakeResult {
    const demoSignupPayload = parseDemoSignupPayload(payload);
    const parsedEmail = parseDeveloperEmail(demoSignupPayload.email);

    if (!parsedEmail.ok) {
      return parsedEmail;
    }

    const domainClassification = classifyDomain(parsedEmail.domain);
    const developerSignup: DeveloperSignup = {
      id: "",
      email: parsedEmail.email,
      source: parseOptionalString(demoSignupPayload.source) ?? "demo",
      name: parseOptionalString(demoSignupPayload.name),
      signedUpAt:
        parseOptionalString(demoSignupPayload.signedUpAt) ?? new Date().toISOString(),
      normalizedCompanyDomain: parsedEmail.domain,
      qualification: domainClassification.qualification,
      unqualifiedReason: domainClassification.unqualifiedReason,
    };

    developerSignup.id = this.insertDeveloperSignup(developerSignup);

    let enrichmentRun: EnrichmentRun | undefined;

    if (developerSignup.qualification === "qualified") {
      const company = this.ensureCompany(
        developerSignup.normalizedCompanyDomain,
        developerSignup.signedUpAt,
      );
      const freshCompanyEnrichment = this.findFreshCompanyEnrichment(
        company.id,
        developerSignup.signedUpAt,
      );

      if (freshCompanyEnrichment) {
        this.ensureLeadQueueRecord(
          company,
          developerSignup.signedUpAt,
          freshCompanyEnrichment.status,
        );
        this.updateLeadScore(company.id, {
          content: freshCompanyEnrichment.content,
          evidenceBasis: freshCompanyEnrichment.evidenceBasis,
        });
      } else {
        const activeRun = this.findActiveEnrichmentRunForCompany(company.id);

        if (activeRun) {
          this.ensureLeadQueueRecord(
            company,
            developerSignup.signedUpAt,
            activeRun.status,
          );
        } else {
          enrichmentRun = this.createEnrichmentRun(developerSignup, company);
          this.ensureLeadQueueRecord(
            company,
            developerSignup.signedUpAt,
            enrichmentRun.status,
          );
        }
      }
    }

    return {
      ok: true,
      developerSignup,
      enrichmentRun,
    };
  }

  listDeveloperSignups(): DeveloperSignup[] {
    const rows = this.database
      .query(
        `
          SELECT
            id,
            email,
            source,
            name,
            signed_up_at,
            normalized_company_domain,
            qualification,
            unqualified_reason
          FROM developer_signups
          ORDER BY sequence DESC
        `,
      )
      .all() as DeveloperSignupRow[];

    return rows.map(mapDeveloperSignupRow);
  }

  listCompanies(): Company[] {
    const rows = this.database
      .query(
        `
          SELECT id, normalized_company_domain, created_at
          FROM companies
          ORDER BY sequence DESC
        `,
      )
      .all() as CompanyRow[];

    return rows.map(mapCompanyRow);
  }

  listLeadQueue(sort: LeadQueueSort = "score"): LeadQueueRecord[] {
    const orderBy =
      sort === "recent"
        ? `
            leads.latest_signup_at DESC,
            leads.lead_score IS NULL,
            leads.lead_score DESC,
            leads.sequence DESC
          `
        : `
            leads.lead_score IS NULL,
            leads.lead_score DESC,
            leads.latest_signup_at DESC,
            leads.sequence DESC
          `;
    const rows = this.database
      .query(
        `
          SELECT
            leads.id,
            leads.company_id,
            companies.normalized_company_domain,
            leads.enrichment_status,
            leads.lead_score,
            leads.score_breakdown_json,
            leads.score_reasons_json,
            leads.signup_count,
            leads.latest_signup_at,
            latest_enrichment.id AS company_enrichment_id,
            latest_enrichment.enrichment_run_id,
            latest_enrichment.status AS company_enrichment_status,
            latest_enrichment.company_name AS enriched_company_name,
            latest_enrichment.content_json,
            latest_enrichment.evidence_basis_json,
            latest_enrichment.created_at AS company_enrichment_created_at,
            latest_outreach.id AS outreach_draft_id,
            latest_outreach.lead_id AS outreach_draft_lead_id,
            latest_outreach.company_name AS outreach_draft_company_name,
            latest_outreach.status AS outreach_draft_status,
            latest_outreach.subject AS outreach_draft_subject,
            latest_outreach.body AS outreach_draft_body,
            latest_outreach.evidence_references_json AS outreach_draft_evidence_references_json,
            latest_outreach.created_at AS outreach_draft_created_at,
            latest_outreach.updated_at AS outreach_draft_updated_at
          FROM leads
          JOIN companies ON companies.id = leads.company_id
          LEFT JOIN company_enrichments AS latest_enrichment
            ON latest_enrichment.sequence = (
              SELECT sequence
              FROM company_enrichments
              WHERE company_enrichments.company_id = leads.company_id
              ORDER BY sequence DESC
              LIMIT 1
            )
          LEFT JOIN outreach_drafts AS latest_outreach
            ON latest_outreach.sequence = (
              SELECT sequence
              FROM outreach_drafts
              WHERE outreach_drafts.lead_id = leads.id
              ORDER BY sequence DESC
              LIMIT 1
            )
          ORDER BY ${orderBy}
        `,
      )
      .all() as LeadRow[];

    return rows.map(mapLeadRow);
  }

  listEnrichmentRuns(): EnrichmentRun[] {
    const rows = this.database
      .query(
        `
          SELECT
            sequence,
            id,
            developer_signup_id,
            company_id,
            normalized_company_domain,
            status,
            requested_at,
            started_at,
            finished_at,
            failure_reason,
            parallel_task_run_id
          FROM enrichment_runs
          ORDER BY sequence DESC
        `,
      )
      .all() as EnrichmentRunRow[];

    return rows.map(mapEnrichmentRunRow);
  }

  listRecoverableEnrichmentRuns(): EnrichmentRun[] {
    const rows = this.database
      .query(
        `
          SELECT
            sequence,
            id,
            developer_signup_id,
            company_id,
            normalized_company_domain,
            status,
            requested_at,
            started_at,
            finished_at,
            failure_reason,
            parallel_task_run_id
          FROM enrichment_runs
          WHERE status IN ('pending', 'researching')
          ORDER BY sequence ASC
        `,
      )
      .all() as EnrichmentRunRow[];

    return rows.map(mapEnrichmentRunRow);
  }

  failActiveEnrichmentRunsOlderThan(
    cutoffIso: string,
    failureReason: string,
    finishedAt = new Date().toISOString(),
  ): EnrichmentRun[] {
    const rows = this.database
      .query(
        `
          SELECT
            sequence,
            id,
            developer_signup_id,
            company_id,
            normalized_company_domain,
            status,
            requested_at,
            started_at,
            finished_at,
            failure_reason,
            parallel_task_run_id
          FROM enrichment_runs
          WHERE status IN ('pending', 'researching')
            AND requested_at < ?
          ORDER BY sequence ASC
        `,
      )
      .all(cutoffIso) as EnrichmentRunRow[];

    const failedRuns: EnrichmentRun[] = [];

    for (const row of rows) {
      const failedRun = this.finishEnrichmentRun(
        row.id,
        {
          status: "failed",
          failureReason,
        },
        finishedAt,
      );

      if (failedRun) {
        failedRuns.push(failedRun);
      }
    }

    return failedRuns;
  }

  getEnrichmentRun(id: string): EnrichmentRun | null {
    const row = this.getEnrichmentRunRow(id);

    return row ? mapEnrichmentRunRow(row) : null;
  }

  setEnrichmentRunParallelTaskRunId(
    id: string,
    parallelTaskRunId: string,
  ): EnrichmentRun | null {
    this.database.run(
      `
        UPDATE enrichment_runs
        SET parallel_task_run_id = ?
        WHERE id = ?
      `,
      [parallelTaskRunId, id],
    );

    return this.getEnrichmentRun(id);
  }

  listCompanyEnrichments(): CompanyEnrichment[] {
    const rows = this.database
      .query(
        `
          SELECT
            id,
            company_id,
            enrichment_run_id,
            normalized_company_domain,
            status,
            company_name,
            content_json,
            evidence_basis_json,
            created_at
          FROM company_enrichments
          ORDER BY sequence DESC
        `,
      )
      .all() as CompanyEnrichmentRow[];

    return rows.map(mapCompanyEnrichmentRow);
  }

  requestManualRefresh(
    payload: unknown,
    requestedAt = new Date().toISOString(),
  ): ManualRefreshResult {
    const parsedPayload = parseManualRefreshPayload(payload);

    if (!parsedPayload.ok) {
      return parsedPayload;
    }

    const company = this.findCompanyByNormalizedDomain(
      parsedPayload.normalizedCompanyDomain,
    );

    if (!company) {
      return {
        ok: false,
        status: 404,
        body: {
          error: "Manual refresh requires an existing Company.",
        },
      };
    }

    const latestDeveloperSignup = this.findLatestDeveloperSignupForCompany(
      company.normalizedCompanyDomain,
    );

    if (!latestDeveloperSignup) {
      return {
        ok: false,
        status: 404,
        body: {
          error: "Manual refresh requires an existing Developer Signup.",
        },
      };
    }

    const activeRun = this.findActiveEnrichmentRunForCompany(company.id);

    if (activeRun) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "Manual refresh is already running for this Company.",
        },
      };
    }

    const enrichmentRun = this.createEnrichmentRun(
      {
        ...latestDeveloperSignup,
        signedUpAt: requestedAt,
      },
      company,
    );

    this.updateLeadEnrichmentStatus(company.id, enrichmentRun.status);

    return {
      ok: true,
      enrichmentRun,
    };
  }

  async generateOutreachDraft(
    payload: unknown,
    options: {
      generatedAt?: string;
      draftWriter?: OutreachDraftWriter;
    } = {},
  ): Promise<OutreachDraftGenerationResult> {
    const { generatedAt = new Date().toISOString(), draftWriter } = options;
    const parsedPayload = parseOutreachDraftPayload(payload);

    if (!parsedPayload.ok) {
      return parsedPayload;
    }

    const lead = this.listLeadQueue().find(
      (candidate) =>
        candidate.normalizedCompanyDomain ===
        parsedPayload.normalizedCompanyDomain,
    );

    if (!lead) {
      return {
        ok: false,
        status: 404,
        body: {
          error: "Outreach Draft generation requires an existing Lead.",
        },
      };
    }

    if (lead.outreachDraft && !parsedPayload.regenerate) {
      return {
        ok: true,
        outreachDraft: lead.outreachDraft,
        reusedExisting: true,
      };
    }

    if (!lead.companyEnrichment) {
      return {
        ok: false,
        status: 409,
        body: {
          error:
            "Outreach Draft generation requires a completed or partial Company Enrichment.",
        },
      };
    }

    let draftContent;
    if (draftWriter) {
      draftContent = await draftWriter(lead.companyEnrichment);
    } else {
      draftContent = buildTemplateDraftContent(lead.companyEnrichment);
    }

    return {
      ok: true,
      outreachDraft: this.insertOutreachDraft(lead, draftContent, generatedAt),
      reusedExisting: false,
    };
  }

  markEnrichmentRunResearching(id: string, startedAt: string): EnrichmentRun | null {
    this.database.run(
      `
        UPDATE enrichment_runs
        SET status = ?,
            started_at = COALESCE(started_at, ?)
        WHERE id = ?
      `,
      ["researching", startedAt, id],
    );

    return this.syncLeadStatusForEnrichmentRun(id);
  }

  finishEnrichmentRun(
    id: string,
    completion: EnrichmentRunCompletion,
    finishedAt: string,
  ): EnrichmentRun | null {
    this.database.run(
      `
        UPDATE enrichment_runs
        SET status = ?,
            finished_at = ?,
            failure_reason = ?
        WHERE id = ?
      `,
      [
        completion.status,
        finishedAt,
        completion.status === "failed" ? completion.failureReason : null,
        id,
      ],
    );

    const finishedRun = this.syncLeadStatusForEnrichmentRun(id);

    if (
      finishedRun &&
      completion.status !== "failed" &&
      completion.status !== "deferred" &&
      completion.companyEnrichment
    ) {
      this.insertCompanyEnrichment(
        finishedRun,
        completion.status,
        completion.companyEnrichment,
        finishedAt,
      );
      this.updateLeadScore(finishedRun.companyId, completion.companyEnrichment);
    }

    return finishedRun;
  }

  private migrate(): void {
    this.database.run(`
      CREATE TABLE IF NOT EXISTS developer_signups (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE,
        email TEXT NOT NULL,
        source TEXT NOT NULL,
        name TEXT,
        signed_up_at TEXT NOT NULL,
        normalized_company_domain TEXT NOT NULL,
        qualification TEXT NOT NULL,
        unqualified_reason TEXT
      )
    `);

    this.database.run(`
      CREATE TABLE IF NOT EXISTS companies (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE,
        normalized_company_domain TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `);

    this.database.run(`
      CREATE TABLE IF NOT EXISTS leads (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE,
        company_id TEXT NOT NULL UNIQUE,
        enrichment_status TEXT NOT NULL,
        lead_score INTEGER,
        score_breakdown_json TEXT,
        score_reasons_json TEXT,
        signup_count INTEGER NOT NULL,
        latest_signup_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    this.addColumnIfMissing("leads", "lead_score", "INTEGER");
    this.addColumnIfMissing("leads", "score_breakdown_json", "TEXT");
    this.addColumnIfMissing("leads", "score_reasons_json", "TEXT");

    this.database.run(`
      CREATE TABLE IF NOT EXISTS enrichment_runs (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE,
        developer_signup_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        normalized_company_domain TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        failure_reason TEXT,
        FOREIGN KEY (developer_signup_id) REFERENCES developer_signups(id),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    this.addColumnIfMissing("enrichment_runs", "parallel_task_run_id", "TEXT");

    this.database.run(`
      CREATE TABLE IF NOT EXISTS company_enrichments (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE,
        company_id TEXT NOT NULL,
        enrichment_run_id TEXT NOT NULL UNIQUE,
        normalized_company_domain TEXT NOT NULL,
        status TEXT NOT NULL,
        company_name TEXT NOT NULL,
        content_json TEXT NOT NULL,
        evidence_basis_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (enrichment_run_id) REFERENCES enrichment_runs(id)
      )
    `);

    this.database.run(`
      CREATE TABLE IF NOT EXISTS outreach_drafts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE,
        lead_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        normalized_company_domain TEXT NOT NULL,
        company_name TEXT NOT NULL,
        status TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        evidence_references_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )
    `);

    this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_developer_signups_company_activity
      ON developer_signups (normalized_company_domain, qualification, signed_up_at, sequence)
    `);

    this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_enrichment_runs_recovery
      ON enrichment_runs (status, sequence)
    `);

    this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_enrichment_runs_company_sequence
      ON enrichment_runs (company_id, sequence)
    `);

    this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_company_enrichments_latest
      ON company_enrichments (company_id, sequence)
    `);

    this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_outreach_drafts_latest
      ON outreach_drafts (lead_id, sequence)
    `);
  }

  private insertDeveloperSignup(developerSignup: DeveloperSignup): string {
    const result = this.database.run(
      `
        INSERT INTO developer_signups (
          email,
          source,
          name,
          signed_up_at,
          normalized_company_domain,
          qualification,
          unqualified_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        developerSignup.email,
        developerSignup.source,
        developerSignup.name ?? null,
        developerSignup.signedUpAt,
        developerSignup.normalizedCompanyDomain,
        developerSignup.qualification,
        developerSignup.unqualifiedReason ?? null,
      ],
    );
    const id = `developer_signup_${result.lastInsertRowid}`;

    this.database.run("UPDATE developer_signups SET id = ? WHERE sequence = ?", [
      id,
      result.lastInsertRowid,
    ]);

    return id;
  }

  private ensureCompany(normalizedCompanyDomain: string, createdAt: string): Company {
    const existingCompany = this.database
      .query(
        `
          SELECT id, normalized_company_domain, created_at
          FROM companies
          WHERE normalized_company_domain = ?
        `,
      )
      .get(normalizedCompanyDomain) as CompanyRow | null;

    if (existingCompany) {
      return mapCompanyRow(existingCompany);
    }

    const result = this.database.run(
      `
        INSERT INTO companies (normalized_company_domain, created_at)
        VALUES (?, ?)
      `,
      [normalizedCompanyDomain, createdAt],
    );
    const id = `company_${result.lastInsertRowid}`;

    this.database.run("UPDATE companies SET id = ? WHERE sequence = ?", [
      id,
      result.lastInsertRowid,
    ]);

    return {
      id,
      normalizedCompanyDomain,
      createdAt,
    };
  }

  private findCompanyByNormalizedDomain(
    normalizedCompanyDomain: string,
  ): Company | null {
    const row = this.database
      .query(
        `
          SELECT id, normalized_company_domain, created_at
          FROM companies
          WHERE normalized_company_domain = ?
        `,
      )
      .get(normalizedCompanyDomain) as CompanyRow | null;

    return row ? mapCompanyRow(row) : null;
  }

  private findLatestDeveloperSignupForCompany(
    normalizedCompanyDomain: string,
  ): DeveloperSignup | null {
    const row = this.database
      .query(
        `
          SELECT
            id,
            email,
            source,
            name,
            signed_up_at,
            normalized_company_domain,
            qualification,
            unqualified_reason
          FROM developer_signups
          WHERE normalized_company_domain = ?
            AND qualification = 'qualified'
          ORDER BY signed_up_at DESC, sequence DESC
          LIMIT 1
        `,
      )
      .get(normalizedCompanyDomain) as DeveloperSignupRow | null;

    return row ? mapDeveloperSignupRow(row) : null;
  }

  private findActiveEnrichmentRunForCompany(companyId: string): EnrichmentRun | null {
    const row = this.database
      .query(
        `
          SELECT
            sequence,
            id,
            developer_signup_id,
            company_id,
            normalized_company_domain,
            status,
            requested_at,
            started_at,
            finished_at,
            failure_reason,
            parallel_task_run_id
          FROM enrichment_runs
          WHERE company_id = ?
            AND status IN ('pending', 'researching')
          ORDER BY sequence DESC
          LIMIT 1
        `,
      )
      .get(companyId) as EnrichmentRunRow | null;

    return row ? mapEnrichmentRunRow(row) : null;
  }

  private createEnrichmentRun(
    developerSignup: DeveloperSignup,
    company: Company,
  ): EnrichmentRun {
    const result = this.database.run(
      `
        INSERT INTO enrichment_runs (
          developer_signup_id,
          company_id,
          normalized_company_domain,
          status,
          requested_at
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        developerSignup.id,
        company.id,
        company.normalizedCompanyDomain,
        "pending",
        developerSignup.signedUpAt,
      ],
    );
    const id = `enrichment_run_${result.lastInsertRowid}`;

    this.database.run("UPDATE enrichment_runs SET id = ? WHERE sequence = ?", [
      id,
      result.lastInsertRowid,
    ]);

    return {
      id,
      developerSignupId: developerSignup.id,
      companyId: company.id,
      normalizedCompanyDomain: company.normalizedCompanyDomain,
      status: "pending",
      requestedAt: developerSignup.signedUpAt,
    };
  }

  private ensureLeadQueueRecord(
    company: Company,
    signedUpAt: string,
    enrichmentStatus: EnrichmentStatus,
  ): void {
    const existingLead = this.database
      .query(
        `
          SELECT
            leads.id,
            leads.company_id,
            companies.normalized_company_domain,
            leads.enrichment_status,
            leads.signup_count,
            leads.latest_signup_at
          FROM leads
          JOIN companies ON companies.id = leads.company_id
          WHERE leads.company_id = ?
        `,
      )
      .get(company.id) as LeadRow | null;

    if (existingLead) {
      this.database.run(
        `
          UPDATE leads
          SET signup_count = signup_count + 1,
              latest_signup_at = ?,
              enrichment_status = ?
          WHERE id = ?
        `,
        [
          maxIsoTimestamp(existingLead.latest_signup_at, signedUpAt),
          enrichmentStatus,
          existingLead.id,
        ],
      );
      return;
    }

    const result = this.database.run(
      `
        INSERT INTO leads (
          company_id,
          enrichment_status,
          signup_count,
          latest_signup_at,
          created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
      [company.id, enrichmentStatus, 1, signedUpAt, signedUpAt],
    );
    const id = `lead_${result.lastInsertRowid}`;

    this.database.run("UPDATE leads SET id = ? WHERE sequence = ?", [
      id,
      result.lastInsertRowid,
    ]);
  }

  private insertCompanyEnrichment(
    enrichmentRun: EnrichmentRun,
    status: "completed" | "partial",
    companyEnrichment: CompanyEnrichmentResult,
    createdAt: string,
  ): void {
    const result = this.database.run(
      `
        INSERT INTO company_enrichments (
          company_id,
          enrichment_run_id,
          normalized_company_domain,
          status,
          company_name,
          content_json,
          evidence_basis_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        enrichmentRun.companyId,
        enrichmentRun.id,
        enrichmentRun.normalizedCompanyDomain,
        status,
        companyEnrichment.content.company.name,
        JSON.stringify(companyEnrichment.content),
        JSON.stringify(companyEnrichment.evidenceBasis),
        createdAt,
      ],
    );
    const id = `company_enrichment_${result.lastInsertRowid}`;

    this.database.run("UPDATE company_enrichments SET id = ? WHERE sequence = ?", [
      id,
      result.lastInsertRowid,
    ]);
  }

  private insertOutreachDraft(
    lead: LeadQueueRecord,
    draftContent: Omit<
      OutreachDraft,
      | "id"
      | "leadId"
      | "companyId"
      | "normalizedCompanyDomain"
      | "companyName"
      | "createdAt"
      | "updatedAt"
    >,
    generatedAt: string,
  ): OutreachDraft {
    const result = this.database.run(
      `
        INSERT INTO outreach_drafts (
          lead_id,
          company_id,
          normalized_company_domain,
          company_name,
          status,
          subject,
          body,
          evidence_references_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        lead.id,
        lead.companyId,
        lead.normalizedCompanyDomain,
        lead.companyName,
        draftContent.status,
        draftContent.subject,
        draftContent.body,
        JSON.stringify(draftContent.evidenceReferences),
        generatedAt,
        generatedAt,
      ],
    );
    const id = `outreach_draft_${result.lastInsertRowid}`;

    this.database.run("UPDATE outreach_drafts SET id = ? WHERE sequence = ?", [
      id,
      result.lastInsertRowid,
    ]);

    return {
      id,
      leadId: lead.id,
      companyId: lead.companyId,
      normalizedCompanyDomain: lead.normalizedCompanyDomain,
      companyName: lead.companyName,
      status: draftContent.status,
      subject: draftContent.subject,
      body: draftContent.body,
      evidenceReferences: draftContent.evidenceReferences,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };
  }

  private updateLeadScore(
    companyId: string,
    companyEnrichment: CompanyEnrichmentResult,
  ): void {
    const lead = this.database
      .query(
        `
          SELECT signup_count, latest_signup_at
          FROM leads
          WHERE company_id = ?
        `,
      )
      .get(companyId) as { signup_count: number; latest_signup_at: string } | null;

    if (!lead) {
      return;
    }

    const leadScore = scoreLead({
      companyEnrichment,
      signupCount: lead.signup_count,
      latestSignupAt: lead.latest_signup_at,
    });

    this.database.run(
      `
        UPDATE leads
        SET lead_score = ?,
            score_breakdown_json = ?,
            score_reasons_json = ?
        WHERE company_id = ?
      `,
      [
        leadScore.total,
        JSON.stringify(leadScore.breakdown),
        JSON.stringify(leadScore.topReasons),
        companyId,
      ],
    );
  }

  private updateLeadEnrichmentStatus(
    companyId: string,
    enrichmentStatus: EnrichmentStatus,
  ): void {
    this.database.run(
      `
        UPDATE leads
        SET enrichment_status = ?
        WHERE company_id = ?
      `,
      [enrichmentStatus, companyId],
    );
  }

  private findFreshCompanyEnrichment(
    companyId: string,
    referenceAt: string,
  ): CompanyEnrichment | null {
    const row = this.database
      .query(
        `
          SELECT
            id,
            company_id,
            enrichment_run_id,
            normalized_company_domain,
            status,
            company_name,
            content_json,
            evidence_basis_json,
            created_at
          FROM company_enrichments
          WHERE company_id = ?
          ORDER BY sequence DESC
          LIMIT 1
        `,
      )
      .get(companyId) as CompanyEnrichmentRow | null;

    if (!row || !isInsideFreshnessWindow(row.created_at, referenceAt)) {
      return null;
    }

    return mapCompanyEnrichmentRow(row);
  }

  private addColumnIfMissing(
    tableName: string,
    columnName: string,
    columnDefinition: string,
  ): void {
    const columns = this.database
      .query(`PRAGMA table_info(${tableName})`)
      .all() as { name: string }[];

    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.database.run(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
    );
  }

  private getEnrichmentRunRow(id: string): EnrichmentRunRow | null {
    return this.database
      .query(
        `
          SELECT
            sequence,
            id,
            developer_signup_id,
            company_id,
            normalized_company_domain,
            status,
            requested_at,
            started_at,
            finished_at,
            failure_reason,
            parallel_task_run_id
          FROM enrichment_runs
          WHERE id = ?
        `,
      )
      .get(id) as EnrichmentRunRow | null;
  }

  private syncLeadStatusForEnrichmentRun(id: string): EnrichmentRun | null {
    const row = this.getEnrichmentRunRow(id);

    if (!row) {
      return null;
    }

    const latestRun = this.database
      .query(
        `
          SELECT sequence
          FROM enrichment_runs
          WHERE company_id = ?
          ORDER BY sequence DESC
          LIMIT 1
        `,
      )
      .get(row.company_id) as { sequence: number } | null;

    if (latestRun?.sequence === row.sequence) {
      this.database.run(
        `
          UPDATE leads
          SET enrichment_status = ?
          WHERE company_id = ?
        `,
        [row.status, row.company_id],
      );
    }

    return mapEnrichmentRunRow(row);
  }
}

function mapDeveloperSignupRow(row: DeveloperSignupRow): DeveloperSignup {
  return {
    id: row.id,
    email: row.email,
    source: row.source,
    name: row.name ?? undefined,
    signedUpAt: row.signed_up_at,
    normalizedCompanyDomain: row.normalized_company_domain,
    qualification: row.qualification,
    unqualifiedReason: row.unqualified_reason ?? undefined,
  };
}

function mapCompanyRow(row: CompanyRow): Company {
  return {
    id: row.id,
    normalizedCompanyDomain: row.normalized_company_domain,
    createdAt: row.created_at,
  };
}

function mapLeadRow(row: LeadRow): LeadQueueRecord {
  const companyEnrichment =
    row.company_enrichment_id &&
    row.enrichment_run_id &&
    row.company_enrichment_status &&
    row.enriched_company_name &&
    row.content_json &&
    row.evidence_basis_json &&
    row.company_enrichment_created_at
      ? mapCompanyEnrichmentRow({
          id: row.company_enrichment_id,
          company_id: row.company_id,
          enrichment_run_id: row.enrichment_run_id,
          normalized_company_domain: row.normalized_company_domain,
          status: row.company_enrichment_status,
          company_name: row.enriched_company_name,
          content_json: row.content_json,
          evidence_basis_json: row.evidence_basis_json,
          created_at: row.company_enrichment_created_at,
        })
      : undefined;
  const outreachDraft =
    row.outreach_draft_id &&
    row.outreach_draft_lead_id &&
    row.outreach_draft_company_name &&
    row.outreach_draft_status &&
    row.outreach_draft_subject &&
    row.outreach_draft_body &&
    row.outreach_draft_evidence_references_json &&
    row.outreach_draft_created_at &&
    row.outreach_draft_updated_at
      ? mapOutreachDraftRow({
          id: row.outreach_draft_id,
          lead_id: row.outreach_draft_lead_id,
          company_id: row.company_id,
          normalized_company_domain: row.normalized_company_domain,
          company_name: row.outreach_draft_company_name,
          status: row.outreach_draft_status,
          subject: row.outreach_draft_subject,
          body: row.outreach_draft_body,
          evidence_references_json: row.outreach_draft_evidence_references_json,
          created_at: row.outreach_draft_created_at,
          updated_at: row.outreach_draft_updated_at,
        })
      : undefined;

  return {
    id: row.id,
    companyId: row.company_id,
    companyName:
      companyEnrichment?.companyName ?? formatCompanyName(row.normalized_company_domain),
    normalizedCompanyDomain: row.normalized_company_domain,
    enrichmentStatus: row.enrichment_status,
    leadScore: row.lead_score,
    scoreBreakdown: row.score_breakdown_json
      ? parseJson<LeadScoreBreakdown>(row.score_breakdown_json)
      : null,
    scoreReasons: row.score_reasons_json
      ? parseJson<string[]>(row.score_reasons_json)
      : [],
    evidenceConfidence:
      companyEnrichment?.content.confidence.evidenceConfidence ?? "Pending",
    signupCount: row.signup_count,
    latestSignupAt: row.latest_signup_at,
    suggestedNextAction:
      companyEnrichment?.content.salesSignals.suggestedNextAction ?? "Start enrichment",
    keyReasons: companyEnrichment?.content.salesSignals.keyReasons ?? [],
    evidenceBasis: companyEnrichment?.evidenceBasis ?? [],
    companyEnrichment,
    outreachDraft,
  };
}

function mapEnrichmentRunRow(row: EnrichmentRunRow): EnrichmentRun {
  return {
    id: row.id,
    developerSignupId: row.developer_signup_id,
    companyId: row.company_id,
    normalizedCompanyDomain: row.normalized_company_domain,
    status: row.status,
    requestedAt: row.requested_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    parallelTaskRunId: row.parallel_task_run_id ?? undefined,
  };
}

function mapCompanyEnrichmentRow(row: CompanyEnrichmentRow): CompanyEnrichment {
  return {
    id: row.id,
    companyId: row.company_id,
    enrichmentRunId: row.enrichment_run_id,
    normalizedCompanyDomain: row.normalized_company_domain,
    status: row.status,
    companyName: row.company_name,
    content: parseJson<CompanyEnrichmentContent>(row.content_json),
    evidenceBasis: parseJson<EvidenceBasisItem[]>(row.evidence_basis_json),
    createdAt: row.created_at,
  };
}

function mapOutreachDraftRow(row: OutreachDraftRow): OutreachDraft {
  return {
    id: row.id,
    leadId: row.lead_id,
    companyId: row.company_id,
    normalizedCompanyDomain: row.normalized_company_domain,
    companyName: row.company_name,
    status: row.status,
    subject: row.subject,
    body: row.body,
    evidenceReferences: parseJson<string[]>(row.evidence_references_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function maxIsoTimestamp(first: string, second: string): string {
  return first > second ? first : second;
}

function isInsideFreshnessWindow(createdAt: string, referenceAt: string): boolean {
  const created = Date.parse(createdAt);
  const reference = Date.parse(referenceAt);

  if (Number.isNaN(created) || Number.isNaN(reference) || created > reference) {
    return false;
  }

  return reference - created <= FRESHNESS_WINDOW_MILLISECONDS;
}

function formatCompanyName(normalizedCompanyDomain: string): string {
  const [label] = normalizedCompanyDomain.split(".");

  return label
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function buildTemplateDraftContent(
  companyEnrichment: CompanyEnrichment,
): Omit<
  OutreachDraft,
  | "id"
  | "leadId"
  | "companyId"
  | "normalizedCompanyDomain"
  | "companyName"
  | "createdAt"
  | "updatedAt"
> {
  const { content, evidenceBasis } = companyEnrichment;
  const evidenceReferences = evidenceBasis.map(formatEvidenceReference);
  const weakEvidence = isWeakOutreachEvidence(content, evidenceReferences);

  if (weakEvidence) {
    return {
      status: "needs-evidence",
      subject: `Follow up with ${content.company.domain}`,
      body: [
        `Hi ${content.company.name} team,`,
        "",
        `A developer from ${content.company.domain} signed up for Parallel, which is a signal worth noticing but not enough evidence to personalize confidently.`,
        "I would treat this as the opening chapter: someone may be exploring how to turn research and enrichment into API-backed automation, but the right first move is to learn what workflow they are trying to improve.",
        content.salesSignals.suggestedNextAction,
        "If useful, I can share a lightweight example of how Parallel turns a raw signup into a researched account narrative.",
      ].join("\n"),
      evidenceReferences,
    };
  }

  const primaryAngle =
    content.outreachSeed.personalizationAngles[0] ??
    content.salesSignals.keyReasons[0] ??
    "developer infrastructure";
  const reasons = formatInlineList(content.salesSignals.keyReasons);
  const evidenceSignal =
    evidenceReferences[0] ?? content.technicalSignals.computeIntensity;

  return {
    status: "ready",
    subject: `${formatPossessive(content.company.name)} ${formatSubjectAngle(primaryAngle)} story`,
    body: [
      `Hi ${content.company.name} team,`,
      "",
      `A developer from ${content.company.domain} signed up for Parallel, and the timing looks interesting: ${content.company.name} is already telling a story around ${primaryAngle}.`,
      "That usually creates a second problem behind the product story: the GTM team needs to spot the right accounts, understand why the signal matters, and move fast without hand-building every brief.",
      "Parallel helps teams turn account research into API-backed workflows, so a signup like this can become a grounded account narrative instead of another row in a CRM.",
      `The strongest signal I found is ${evidenceSignal}, alongside ${reasons}.`,
      "Would it be worth comparing notes on how Parallel could help your team turn these research signals into cleaner sales motion?",
    ].join("\n"),
    evidenceReferences,
  };
}

function formatPossessive(value: string): string {
  return value.endsWith("s") ? `${value}'` : `${value}'s`;
}

function formatSubjectAngle(value: string): string {
  const trimmed = value.trim().replace(/\s+scaling$/i, "");

  return trimmed.length > 0 ? trimmed : "developer infrastructure";
}

function formatInlineList(values: string[]): string {
  const cleaned = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (cleaned.length === 0) {
    return "the signup activity";
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`;
}

function isWeakOutreachEvidence(
  content: CompanyEnrichmentContent,
  evidenceReferences: string[],
): boolean {
  const confidence = content.confidence.evidenceConfidence.trim().toLowerCase();

  return (
    evidenceReferences.length === 0 ||
    confidence.includes("low") ||
    confidence.includes("unknown")
  );
}

function formatEvidenceReference(item: EvidenceBasisItem): string {
  const firstCitation = item.citations[0];

  return firstCitation
    ? `${item.field}: ${firstCitation.title}`
    : item.field;
}

function parseDemoSignupPayload(payload: unknown): DemoSignupPayload {
  if (!isRecord(payload)) {
    return {
      email: undefined,
    };
  }

  return {
    email: payload.email,
    source: payload.source,
    name: payload.name,
    signedUpAt: payload.signedUpAt,
  };
}

function parseManualRefreshPayload(payload: unknown):
  | { ok: true; normalizedCompanyDomain: string }
  | { ok: false; status: 400; body: ManualRefreshError } {
  if (!isRecord(payload)) {
    return invalidManualRefreshDomain();
  }

  const normalizedCompanyDomain = parseNormalizedCompanyDomain(
    payload.normalizedCompanyDomain,
  );

  if (!normalizedCompanyDomain) {
    return invalidManualRefreshDomain();
  }

  return {
    ok: true,
    normalizedCompanyDomain,
  };
}

function parseOutreachDraftPayload(payload: unknown):
  | { ok: true; normalizedCompanyDomain: string; regenerate: boolean }
  | { ok: false; status: 400; body: OutreachDraftError } {
  if (!isRecord(payload)) {
    return invalidOutreachDraftDomain();
  }

  const normalizedCompanyDomain = parseNormalizedCompanyDomain(
    payload.normalizedCompanyDomain,
  );

  if (!normalizedCompanyDomain) {
    return invalidOutreachDraftDomain();
  }

  return {
    ok: true,
    normalizedCompanyDomain,
    regenerate: parseOptionalBoolean(payload.regenerate),
  };
}

function parseOptionalBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseNormalizedCompanyDomain(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized.length === 0 ||
    /\s/.test(normalized) ||
    !/^[a-z0-9.-]+$/.test(normalized) ||
    normalized.startsWith(".") ||
    normalized.endsWith(".") ||
    !normalized.includes(".")
  ) {
    return null;
  }

  return normalized;
}

function invalidManualRefreshDomain(): {
  ok: false;
  status: 400;
  body: ManualRefreshError;
} {
  return {
    ok: false,
    status: 400,
    body: {
      error: "Manual refresh requires a valid Normalized Company Domain.",
    },
  };
}

function invalidOutreachDraftDomain(): {
  ok: false;
  status: 400;
  body: OutreachDraftError;
} {
  return {
    ok: false,
    status: 400,
    body: {
      error:
        "Outreach Draft generation requires a valid Normalized Company Domain.",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyDomain(domain: string):
  | { qualification: "qualified"; unqualifiedReason?: undefined }
  | { qualification: "unqualified"; unqualifiedReason: UnqualifiedSignupReason } {
  if (PERSONAL_DOMAINS.has(domain)) {
    return {
      qualification: "unqualified",
      unqualifiedReason: "personal-domain",
    };
  }

  if (domain.endsWith(".edu")) {
    return {
      qualification: "unqualified",
      unqualifiedReason: "educational-domain",
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      qualification: "unqualified",
      unqualifiedReason: "disposable-domain",
    };
  }

  if (!domain.includes(".")) {
    return {
      qualification: "unqualified",
      unqualifiedReason: "ambiguous-domain",
    };
  }

  return {
    qualification: "qualified",
  };
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
]);

function parseDeveloperEmail(email: unknown):
  | { ok: true; email: string; domain: string }
  | { ok: false; status: 400; body: SignupValidationError } {
  if (typeof email !== "string") {
    return invalidEmail();
  }

  const normalizedEmail = email.trim().toLowerCase();
  const parts = normalizedEmail.split("@");

  if (parts.length !== 2) {
    return invalidEmail();
  }

  const [localPart, domain] = parts;

  if (
    localPart.length === 0 ||
    domain.length === 0 ||
    /\s/.test(normalizedEmail) ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    domain.startsWith(".") ||
    domain.endsWith(".")
  ) {
    return invalidEmail();
  }

  return {
    ok: true,
    email: normalizedEmail,
    domain,
  };
}

function invalidEmail(): { ok: false; status: 400; body: SignupValidationError } {
  return {
    ok: false,
    status: 400,
    body: {
      error: "Demo Signup Payload email must be a valid email address.",
    },
  };
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
