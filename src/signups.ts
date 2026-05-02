export type SignupQualification = "qualified" | "unqualified";
export type UnqualifiedSignupReason =
  | "personal-domain"
  | "educational-domain"
  | "disposable-domain"
  | "ambiguous-domain";

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

export interface SignupValidationError {
  error: string;
}

export type SignupIntakeResult =
  | { ok: true; developerSignup: DeveloperSignup }
  | { ok: false; status: 400; body: SignupValidationError };

export class PrototypeStore {
  private developerSignups: DeveloperSignup[] = [];
  private nextSignupNumber = 1;

  createDeveloperSignup(payload: unknown): SignupIntakeResult {
    const demoSignupPayload = parseDemoSignupPayload(payload);
    const parsedEmail = parseDeveloperEmail(demoSignupPayload.email);

    if (!parsedEmail.ok) {
      return parsedEmail;
    }

    const domainClassification = classifyDomain(parsedEmail.domain);
    const developerSignup: DeveloperSignup = {
      id: `developer_signup_${this.nextSignupNumber++}`,
      email: parsedEmail.email,
      source: parseOptionalString(demoSignupPayload.source) ?? "demo",
      name: parseOptionalString(demoSignupPayload.name),
      signedUpAt:
        parseOptionalString(demoSignupPayload.signedUpAt) ?? new Date().toISOString(),
      normalizedCompanyDomain: parsedEmail.domain,
      qualification: domainClassification.qualification,
      unqualifiedReason: domainClassification.unqualifiedReason,
    };

    this.developerSignups.unshift(developerSignup);

    return {
      ok: true,
      developerSignup,
    };
  }

  listDeveloperSignups(): DeveloperSignup[] {
    return [...this.developerSignups];
  }
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
