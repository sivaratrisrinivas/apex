import type { CompanyEnrichmentResult } from "./signups";

export interface LeadScoreDimension {
  score: number;
  maxScore: number;
  reason: string;
}

export interface LeadScoreBreakdown {
  purchasingCapacity: LeadScoreDimension;
  computeIntensity: LeadScoreDimension;
  parallelFit: LeadScoreDimension;
  salesTiming: LeadScoreDimension;
  evidenceConfidence: LeadScoreDimension;
}

export interface LeadScoreResult {
  total: number;
  breakdown: LeadScoreBreakdown;
  topReasons: string[];
}

interface ScoreLeadInput {
  companyEnrichment: CompanyEnrichmentResult;
  signupCount: number;
  latestSignupAt: string;
}

const HIGH_SCORE_THRESHOLD = 80;
const MISSING_EVIDENCE_HIGH_SCORE_CAP = HIGH_SCORE_THRESHOLD - 1;

export function scoreLead(input: ScoreLeadInput): LeadScoreResult {
  const breakdown: LeadScoreBreakdown = {
    purchasingCapacity: scorePurchasingCapacity(input.companyEnrichment),
    computeIntensity: scoreComputeIntensity(input.companyEnrichment),
    parallelFit: scoreParallelFit(input.companyEnrichment),
    salesTiming: scoreSalesTiming(input.companyEnrichment, {
      signupCount: input.signupCount,
      latestSignupAt: input.latestSignupAt,
    }),
    evidenceConfidence: scoreEvidenceConfidence(input.companyEnrichment),
  };
  const rawTotal = Object.values(breakdown).reduce(
    (sum, dimension) => sum + dimension.score,
    0,
  );
  const hasEvidenceBasis = input.companyEnrichment.evidenceBasis.length > 0;
  const total =
    hasEvidenceBasis || rawTotal < HIGH_SCORE_THRESHOLD
      ? rawTotal
      : MISSING_EVIDENCE_HIGH_SCORE_CAP;
  const topReasons = Object.entries(breakdown)
    .filter(([, dimension]) => dimension.score > 0)
    .sort(([, first], [, second]) => second.score - first.score)
    .slice(0, 3)
    .map(([dimensionName, dimension]) => {
      return `${formatDimensionLabel(dimensionName)}: ${dimension.reason}`;
    });

  if (!hasEvidenceBasis && rawTotal >= HIGH_SCORE_THRESHOLD) {
    topReasons.push("Evidence Basis required before displaying a high score.");
  }

  return {
    total,
    breakdown,
    topReasons,
  };
}

function scorePurchasingCapacity(
  companyEnrichment: CompanyEnrichmentResult,
): LeadScoreDimension {
  const { funding, company } = companyEnrichment.content;
  let score = 0;
  const reasons: string[] = [];

  if (isFundedGrowthStage(funding.stage)) {
    score += 10;
    reasons.push(funding.stage);
  }

  if (!isUnknown(funding.totalRaised)) {
    score += 5;
    reasons.push(`${funding.totalRaised} raised`);
  }

  if (hasMeaningfulEmployeeRange(company.employeeRange)) {
    score += 5;
    reasons.push(company.employeeRange);
  }

  return {
    score: Math.min(score, 20),
    maxScore: 20,
    reason:
      reasons.length > 0
        ? reasons.join(", ")
        : "No strong purchasing capacity evidence yet.",
  };
}

function scoreComputeIntensity(
  companyEnrichment: CompanyEnrichmentResult,
): LeadScoreDimension {
  const { technicalSignals, salesSignals } = companyEnrichment.content;
  const computeIntensity = technicalSignals.computeIntensity.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (computeIntensity.includes("high")) {
    score += 18;
    reasons.push("High compute intensity");
  } else if (computeIntensity.includes("medium")) {
    score += 12;
    reasons.push("Medium compute intensity");
  } else if (computeIntensity.includes("low")) {
    score += 5;
    reasons.push("Low compute intensity");
  }

  if (!isUnknown(technicalSignals.aiWorkloads)) {
    score += 4;
    reasons.push("AI workload signal");
  }

  if (mentionsAny(salesSignals.keyReasons.join(" "), [
    "ai",
    "compute",
    "gpu",
    "infrastructure",
  ])) {
    score += 3;
    reasons.push("infrastructure reason");
  }

  return {
    score: Math.min(score, 25),
    maxScore: 25,
    reason:
      reasons.length > 0
        ? reasons.join(", ")
        : "No strong compute intensity evidence yet.",
  };
}

function scoreParallelFit(
  companyEnrichment: CompanyEnrichmentResult,
): LeadScoreDimension {
  const { technicalSignals, salesSignals, outreachSeed } =
    companyEnrichment.content;
  let score = 0;
  const reasons: string[] = [];

  if (
    mentionsAny(technicalSignals.developerToolRelevance, [
      "strong",
      "developer",
      "automation",
      "parallel",
      "platform",
    ])
  ) {
    score += 15;
    reasons.push("developer-tool relevance");
  }

  if (
    mentionsAny(salesSignals.keyReasons.join(" "), [
      "ai",
      "automation",
      "developer",
      "infrastructure",
      "platform",
      "research",
    ])
  ) {
    score += 3;
    reasons.push("sales reason fits Parallel");
  }

  if (outreachSeed.personalizationAngles.length > 0) {
    score += 2;
    reasons.push("usable outreach angle");
  }

  return {
    score: Math.min(score, 20),
    maxScore: 20,
    reason:
      reasons.length > 0
        ? reasons.join(", ")
        : "No strong Parallel Fit signal yet.",
  };
}

function scoreSalesTiming(
  companyEnrichment: CompanyEnrichmentResult,
  activity: { signupCount: number; latestSignupAt: string },
): LeadScoreDimension {
  const { funding } = companyEnrichment.content;
  let score = activity.signupCount >= 3 ? 12 : activity.signupCount >= 2 ? 10 : 5;
  const reasons = [
    `${activity.signupCount} Developer Signup${
      activity.signupCount === 1 ? "" : "s"
    }`,
  ];

  if (isWithinMonths(funding.latestRoundDate, activity.latestSignupAt, 18)) {
    score += 3;
    reasons.push("recent funding activity");
  }

  return {
    score: Math.min(score, 15),
    maxScore: 15,
    reason: reasons.join(", "),
  };
}

function scoreEvidenceConfidence(
  companyEnrichment: CompanyEnrichmentResult,
): LeadScoreDimension {
  const confidence =
    companyEnrichment.content.confidence.evidenceConfidence.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (confidence.includes("high")) {
    score += 15;
    reasons.push("High Evidence Confidence");
  } else if (confidence.includes("medium")) {
    score += 10;
    reasons.push("Medium Evidence Confidence");
  } else if (confidence.includes("low")) {
    score += 5;
    reasons.push("Low Evidence Confidence");
  }

  if (companyEnrichment.evidenceBasis.length > 0) {
    score += 5;
    reasons.push("Evidence Basis present");
  } else {
    reasons.push("Evidence Basis missing");
  }

  return {
    score: Math.min(score, 20),
    maxScore: 20,
    reason: reasons.join(", "),
  };
}

function isFundedGrowthStage(stage: string): boolean {
  const normalized = stage.toLowerCase();

  return [
    "series a",
    "series b",
    "series c",
    "series d",
    "series e",
    "growth",
    "ipo",
    "public",
  ].some((knownStage) => normalized.includes(knownStage));
}

function hasMeaningfulEmployeeRange(employeeRange: string): boolean {
  return /\d/.test(employeeRange) && !isUnknown(employeeRange);
}

function isUnknown(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length === 0 || normalized === "unknown" || normalized === "n/a"
  );
}

function mentionsAny(value: string, needles: string[]): boolean {
  const normalized = value.toLowerCase();

  return needles.some((needle) => normalized.includes(needle));
}

function isWithinMonths(
  candidateDate: string,
  referenceDate: string,
  months: number,
): boolean {
  if (isUnknown(candidateDate)) {
    return false;
  }

  const candidate = Date.parse(candidateDate);
  const reference = Date.parse(referenceDate);

  if (Number.isNaN(candidate) || Number.isNaN(reference) || candidate > reference) {
    return false;
  }

  const millisecondsPerMonth = 31 * 24 * 60 * 60 * 1000;

  return reference - candidate <= months * millisecondsPerMonth;
}

function formatDimensionLabel(dimensionName: string): string {
  return dimensionName
    .replace(/[A-Z]/g, (letter) => ` ${letter}`)
    .replace(/^./, (letter) => letter.toUpperCase());
}
