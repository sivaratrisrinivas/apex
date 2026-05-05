import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { loadLocalEnvFile } from "../src/local-env";

describe(".env.local loading", () => {
  test("loads live Parallel settings from .env.local without requiring shell exports", () => {
    const cwd = mkdtempSync("/tmp/apex-env-");
    const env: Record<string, string | undefined> = {};

    writeFileSync(
      join(cwd, ".env.local"),
      [
        "# local live Apex settings",
        'PARALLEL_API_KEY="parallel_secret_from_file"',
        "PARALLEL_API_BASE_URL=https://parallel.example.test",
        "APEX_PROTOTYPE_STORE_PATH=/tmp/apex-live.sqlite",
      ].join("\n"),
    );

    loadLocalEnvFile({ cwd, env });

    expect(env.PARALLEL_API_KEY).toBe("parallel_secret_from_file");
    expect(env.PARALLEL_API_BASE_URL).toBe("https://parallel.example.test");
    expect(env.APEX_PROTOTYPE_STORE_PATH).toBe("/tmp/apex-live.sqlite");
  });

  test("keeps shell environment values ahead of .env.local values", () => {
    const cwd = mkdtempSync("/tmp/apex-env-");
    const env: Record<string, string | undefined> = {
      PARALLEL_API_KEY: "parallel_secret_from_shell",
    };

    writeFileSync(
      join(cwd, ".env.local"),
      "PARALLEL_API_KEY=parallel_secret_from_file\n",
    );

    loadLocalEnvFile({ cwd, env });

    expect(env.PARALLEL_API_KEY).toBe("parallel_secret_from_shell");
  });
});
