import { spawn } from "child_process";
import path from "path";
import { PrologResult } from "../types/index";

// Path to bridge.pl relative to project root
const BRIDGE_PL = path.resolve(__dirname, "../../prolog/bridge.pl");

// How long (ms) to wait for SWI-Prolog before timing out
const PROLOG_TIMEOUT_MS = 15_000;

// Allow the swipl executable path to be overridden via environment variable.
// This is useful on Windows where swipl may not be on the shell PATH but is
// installed at a known location (e.g. C:\Program Files\swipl\bin\swipl.exe).
// Read at CALL TIME (inside the function) so that any code which sets
// process.env.SWIPL_EXECUTABLE before the first spawn — including the
// expert-system test setup — is always picked up correctly.
function getSwiplCmd(): string {
  return process.env.SWIPL_EXECUTABLE || "swipl";
}

/**
 * runPrologInference
 *
 * Spawns a SWI-Prolog subprocess with bridge.pl, passes the symptom list
 * and duration as CLI arguments, and parses the JSON written to stdout.
 *
 * Forward chaining inference happens entirely inside Prolog; this function
 * is purely the Node ↔ Prolog IPC layer.
 */
export async function runPrologInference(
  symptoms: string[],
  symptomDuration: string = "unknown",
): Promise<PrologResult> {
  return new Promise((resolve, reject) => {
    const symptomsStr = symptoms.join(",");

    // Spawn SWI-Prolog:
    //   swipl -g main -t halt bridge.pl -- --symptoms "..." --duration "..."
    const swiplCmd = getSwiplCmd();
    const proc = spawn(
      swiplCmd,
      [
        "-g",
        "main",
        "-t",
        "halt",
        BRIDGE_PL,
        "--",
        "--symptoms",
        symptomsStr,
        "--duration",
        symptomDuration,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Timeout guard
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(
        new Error(`Prolog inference timed out after ${PROLOG_TIMEOUT_MS}ms`),
      );
    }, PROLOG_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0 && !stdout.trim()) {
        const errMsg = stderr.trim() || `swipl exited with code ${code}`;
        return reject(new Error(`Prolog process failed: ${errMsg}`));
      }

      // Extract the last JSON object from stdout (Prolog may emit warnings before it)
      const jsonLine = extractLastJsonLine(stdout);
      if (!jsonLine) {
        return reject(
          new Error(
            `No JSON output from Prolog.\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        );
      }

      try {
        const result: PrologResult = JSON.parse(jsonLine);
        if (result.error !== null && result.error !== "null" && result.error) {
          return reject(new Error(`Prolog inference error: ${result.error}`));
        }
        resolve(result);
      } catch (parseErr) {
        reject(
          new Error(
            `Failed to parse Prolog JSON output: ${jsonLine}\nParse error: ${String(parseErr)}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `SWI-Prolog (swipl) not found. Install it: https://www.swi-prolog.org/Download.html` +
              (swiplCmd !== "swipl" ? ` (tried: ${swiplCmd})` : ""),
          ),
        );
      } else {
        reject(new Error(`Failed to spawn swipl: ${err.message}`));
      }
    });
  });
}

/**
 * extractLastJsonLine
 *
 * Scans stdout lines from the bottom up and returns the first line
 * that looks like a complete JSON object. This tolerates Prolog printing
 * informational warnings or trace output before the result.
 */
function extractLastJsonLine(output: string): string | null {
  const lines = output.split("\n").reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }
  }
  return null;
}
