import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

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
  | { status: "failed"; failureReason: string };

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
}

export interface SignupValidationError {
  error: string;
}

export type SignupIntakeResult =
  | { ok: true; developerSignup: DeveloperSignup; enrichmentRun?: EnrichmentRun }
  | { ok: false; status: 400; body: SignupValidationError };

interface PrototypeStoreOptions {
  databasePath?: string;
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
      enrichmentRun = this.createEnrichmentRun(developerSignup, company);
      this.ensureLeadQueueRecord(company, developerSignup.signedUpAt, enrichmentRun.status);
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

  listLeadQueue(): LeadQueueRecord[] {
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
            latest_enrichment.created_at AS company_enrichment_created_at
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
          ORDER BY leads.latest_signup_at DESC, leads.sequence DESC
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
            failure_reason
          FROM enrichment_runs
          ORDER BY sequence DESC
        `,
      )
      .all() as EnrichmentRunRow[];

    return rows.map(mapEnrichmentRunRow);
  }

  getEnrichmentRun(id: string): EnrichmentRun | null {
    const row = this.getEnrichmentRunRow(id);

    return row ? mapEnrichmentRunRow(row) : null;
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
            failure_reason
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

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function maxIsoTimestamp(first: string, second: string): string {
  return first > second ? first : second;
}

function formatCompanyName(normalizedCompanyDomain: string): string {
  const [label] = normalizedCompanyDomain.split(".");

  return label
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
