import { describe, expect, test } from "bun:test";

describe("WSL demo script", () => {
  test("verifies the full Apex story from signup through Outreach Draft", async () => {
    const childProcess = Bun.spawn([process.execPath, "run", "demo:wsl"], {
      cwd: import.meta.dir.replace(/\/tests$/, ""),
      env: {
        ...Bun.env,
        FORCE_COLOR: "0",
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      childProcess.exited,
      new Response(childProcess.stdout).text(),
      new Response(childProcess.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).not.toContain("Apex WSL demo failed");
    expect(stdout).toContain("Apex WSL demo complete");
    expect(stdout).toContain("Demo Signup Payload: engineer@modal.com");
    expect(stdout).toContain("Near-Real-Time Enrichment: pending");
    expect(stdout).toContain("Lead Queue: Modal Labs scored 93");
    expect(stdout).toContain("Evidence Basis: technicalSignals.computeIntensity");
    expect(stdout).toContain("Outreach Draft: ready");
    expect(stdout).toContain(
      "technicalSignals.computeIntensity: Modal infrastructure overview",
    );
    expect(stdout.toLowerCase()).not.toContain("powershell");
    expect(stdout.toLowerCase()).not.toContain("cmd.exe");
  });
});
