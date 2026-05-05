import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface LoadLocalEnvFileOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  filename?: string;
}

export function loadLocalEnvFile(
  options: LoadLocalEnvFileOptions = {},
): Record<string, string | undefined> {
  const env = options.env ?? process.env;
  const filename = options.filename ?? ".env.local";
  const envFilePath = join(options.cwd ?? process.cwd(), filename);

  if (!existsSync(envFilePath)) {
    return env;
  }

  const contents = readFileSync(envFilePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed || env[parsed.key]?.trim()) {
      continue;
    }

    env[parsed.key] = parsed.value;
  }

  return env;
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trimStart()
    : trimmed;
  const separatorIndex = normalized.indexOf("=");

  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = normalized.slice(0, separatorIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return undefined;
  }

  return {
    key,
    value: parseEnvValue(normalized.slice(separatorIndex + 1).trim()),
  };
}

function parseEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r")
      .replaceAll("\\t", "\t")
      .replaceAll('\\"', '"')
      .replaceAll("\\\\", "\\");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return stripInlineComment(value).trim();
}

function stripInlineComment(value: string): string {
  const commentStart = value.search(/\s#/);

  return commentStart === -1 ? value : value.slice(0, commentStart);
}
