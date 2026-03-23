// =============================================================================
// MediCheck — Expert-System Validation Tests
//
// These tests exercise the REAL SWI-Prolog inference engine end-to-end.
// No mocks are used.  Every test spawns an actual `swipl` subprocess, loads
// the knowledge base and inference engine, runs forward chaining, and asserts
// that the returned diagnosis matches the documented rules.
//
// Test groups
//   1. Malaria rules       — 3 confidence levels + exclusion (no chills)
//   2. Diarrhoea rules     — 3 confidence levels + exclusion (no loose_stools)
//   3. HIV/AIDS rules      — 3 confidence levels + duration exclusions
//   4. Fallback            — no rules fire → "Unable to determine diagnosis"
//   5. Response structure  — shape, types, and invariants for every result
//   6. Edge cases          — duplicates, supersets, cross-disease, unknown duration
//
// Prerequisites
//   • SWI-Prolog (swipl) must be on PATH.
//   • Tests are automatically SKIPPED if swipl is not found.
//
// Timeout
//   Each test is allowed up to 30 seconds (configured in jest.config.ts).
//   Real swipl startup on a cold machine is typically < 2 seconds.
// =============================================================================

import { execSync } from "child_process";
import { runPrologInference } from "../../services/prologBridge";
import type { PrologResult, ConfidenceLevel } from "../../types/index";

// ---------------------------------------------------------------------------
// Detect whether swipl is available on the host machine.
// Tries `swipl` on PATH first, then falls back to the default Windows install
// location so the tests work from any shell (including editors that do not
// inherit the full Windows user PATH).
// If swipl cannot be found at all, every test is skipped with a clear reason
// rather than failing with an ENOENT error that masks the real skip intent.
// ---------------------------------------------------------------------------

/** Common install locations to probe when `swipl` is not on PATH. */
const WINDOWS_SWIPL_CANDIDATES = [
  "C:\\Program Files\\swipl\\bin\\swipl.exe",
  "C:\\Program Files (x86)\\swipl\\bin\\swipl.exe",
];

function findSwiplCommand(): string | null {
  // 1. Try the bare command (works when swipl is on PATH in any shell)
  try {
    execSync("swipl --version", { stdio: "ignore", timeout: 5_000 });
    return "swipl";
  } catch {
    // not on PATH — fall through
  }

  // 2. On Windows, probe well-known install paths
  if (process.platform === "win32") {
    for (const candidate of WINDOWS_SWIPL_CANDIDATES) {
      try {
        execSync(`"${candidate}" --version`, {
          stdio: "ignore",
          timeout: 5_000,
        });
        return candidate;
      } catch {
        // try next candidate
      }
    }
  }

  return null;
}

const SWIPL_COMMAND = findSwiplCommand();
const SWIPL_AVAILABLE = SWIPL_COMMAND !== null;

// ---------------------------------------------------------------------------
// If we found swipl at a non-PATH location, patch the environment so that
// prologBridge.ts (which calls spawn('swipl', ...)) also resolves correctly.
// We do this by prepending the directory to process.env.PATH before any test
// runs.  spawn() on Windows will then find swipl.exe via the updated PATH.
// ---------------------------------------------------------------------------
if (SWIPL_AVAILABLE && SWIPL_COMMAND !== "swipl") {
  // prologBridge.ts reads SWIPL_EXECUTABLE at module-load time to decide which
  // executable to spawn.  Setting it here — before prologBridge is imported by
  // any test — ensures spawn() receives the full absolute path on Windows even
  // when swipl is not on the shell PATH inherited by the Jest worker.
  process.env.SWIPL_EXECUTABLE = SWIPL_COMMAND;
}

if (!SWIPL_AVAILABLE) {
  console.warn(
    "\n[expert-system] SWI-Prolog not found — all inference tests SKIPPED.\n" +
      "Install swipl from https://www.swi-prolog.org/Download.html to run them.\n",
  );
}

/**
 * Conditional `it` wrapper:
 *   - Runs the test normally when swipl is on PATH.
 *   - Marks it as skipped (with the reason shown in the Jest report) otherwise.
 */
const itSwipl = SWIPL_AVAILABLE ? it : it.skip;

// ---------------------------------------------------------------------------
// Shared assertion helpers
// ---------------------------------------------------------------------------

/** Asserts the shape every PrologResult must satisfy, regardless of content. */
function assertResultShape(result: PrologResult): void {
  expect(typeof result.diagnosis).toBe("string");
  expect(result.diagnosis.length).toBeGreaterThan(0);

  expect(["high", "medium", "possible", "none"]).toContain(result.confidence);

  expect(Array.isArray(result.rules_fired)).toBe(true);
  expect(Array.isArray(result.matched_symptoms)).toBe(true);

  expect(typeof result.reasoning).toBe("string");
  expect(result.reasoning.length).toBeGreaterThan(0);

  expect(typeof result.advice).toBe("string");
  expect(result.advice.length).toBeGreaterThan(0);
}

/** Asserts a successful (non-fallback) diagnosis with a specific outcome. */
function assertDiagnosis(
  result: PrologResult,
  expectedDisease: string,
  expectedConfidence: ConfidenceLevel,
): void {
  assertResultShape(result);
  expect(result.diagnosis).toBe(expectedDisease);
  expect(result.confidence).toBe(expectedConfidence);
  expect(result.rules_fired.length).toBeGreaterThan(0);
  expect(result.matched_symptoms.length).toBeGreaterThan(0);
  expect(result.error).toBeFalsy();
}

/** Asserts the engine returned the no-match fallback result. */
function assertFallback(result: PrologResult): void {
  assertResultShape(result);
  expect(result.diagnosis).toBe("Unable to determine diagnosis");
  expect(result.confidence).toBe("none");
  expect(result.rules_fired).toHaveLength(0);
  expect(result.matched_symptoms).toHaveLength(0);
}

// =============================================================================
// 1. MALARIA RULES
// =============================================================================
describe("Expert System — Malaria rules", () => {
  itSwipl(
    "malaria_high fires when all 5 high-confidence symptoms are present → HIGH",
    async () => {
      const result = await runPrologInference(
        ["fever", "chills", "headache", "sweating", "muscle_pain"],
        "unknown",
      );
      assertDiagnosis(result, "malaria", "high");
      expect(result.rules_fired).toContain("malaria_high");
    },
  );

  itSwipl(
    "malaria_medium fires with fever + chills + nausea + vomiting → MEDIUM",
    async () => {
      const result = await runPrologInference(
        ["fever", "chills", "nausea", "vomiting"],
        "unknown",
      );
      assertDiagnosis(result, "malaria", "medium");
      expect(result.rules_fired).toContain("malaria_medium");
    },
  );

  itSwipl(
    "malaria_possible fires with fever + chills + sweating + headache → POSSIBLE",
    async () => {
      const result = await runPrologInference(
        ["fever", "chills", "sweating", "headache"],
        "unknown",
      );
      assertDiagnosis(result, "malaria", "possible");
      expect(result.rules_fired).toContain("malaria_possible");
    },
  );

  itSwipl(
    "malaria is EXCLUDED (fallback) when chills is absent — even with other malaria symptoms",
    async () => {
      // fever, headache, sweating, muscle_pain — no chills
      const result = await runPrologInference(
        ["fever", "headache", "sweating", "muscle_pain"],
        "unknown",
      );
      // Malaria must not appear; expect fallback since no other disease matches
      assertFallback(result);
    },
  );

  itSwipl(
    "HIGH-confidence rule takes priority when both malaria_high and malaria_medium would fire",
    async () => {
      // Superset: all 5 high symptoms + medium-rule symptoms
      const result = await runPrologInference(
        [
          "fever",
          "chills",
          "headache",
          "sweating",
          "muscle_pain",
          "nausea",
          "vomiting",
        ],
        "unknown",
      );
      assertDiagnosis(result, "malaria", "high");
    },
  );

  itSwipl(
    "matched_symptoms contains at least the symptoms that triggered the fired rule",
    async () => {
      const symptoms = [
        "fever",
        "chills",
        "headache",
        "sweating",
        "muscle_pain",
      ];
      const result = await runPrologInference(symptoms, "unknown");

      for (const s of symptoms) {
        expect(result.matched_symptoms).toContain(s);
      }
    },
  );

  itSwipl(
    "reasoning string mentions the disease and the rule that fired",
    async () => {
      const result = await runPrologInference(
        ["fever", "chills", "headache", "sweating", "muscle_pain"],
        "unknown",
      );
      expect(result.reasoning.toLowerCase()).toContain("malaria");
      expect(result.reasoning).toContain("malaria_high");
    },
  );
});

// =============================================================================
// 2. DIARRHOEA RULES
// =============================================================================
describe("Expert System — Diarrhoea rules", () => {
  itSwipl(
    "diarrhoea_high fires with loose_stools + stomach_cramps + dehydration → HIGH",
    async () => {
      const result = await runPrologInference(
        ["loose_stools", "stomach_cramps", "dehydration"],
        "unknown",
      );
      assertDiagnosis(result, "diarrhoea", "high");
      expect(result.rules_fired).toContain("diarrhoea_high");
    },
  );

  itSwipl(
    "diarrhoea_medium fires with loose_stools + abdominal_pain + nausea → MEDIUM",
    async () => {
      const result = await runPrologInference(
        ["loose_stools", "abdominal_pain", "nausea"],
        "unknown",
      );
      assertDiagnosis(result, "diarrhoea", "medium");
      expect(result.rules_fired).toContain("diarrhoea_medium");
    },
  );

  itSwipl(
    "diarrhoea_possible fires with loose_stools + loss_of_appetite + bloating → POSSIBLE",
    async () => {
      const result = await runPrologInference(
        ["loose_stools", "loss_of_appetite", "bloating"],
        "unknown",
      );
      assertDiagnosis(result, "diarrhoea", "possible");
      expect(result.rules_fired).toContain("diarrhoea_possible");
    },
  );

  itSwipl(
    "diarrhoea is EXCLUDED (fallback) when loose_stools is absent",
    async () => {
      // stomach_cramps + nausea + dehydration — no loose_stools
      // Also no chills (malaria excluded) and no HIV symptoms → fallback
      const result = await runPrologInference(
        ["stomach_cramps", "nausea", "dehydration"],
        "unknown",
      );
      assertFallback(result);
    },
  );
});

// =============================================================================
// 3. HIV/AIDS RULES
// =============================================================================
describe("Expert System — HIV/AIDS rules", () => {
  itSwipl(
    "hiv_high fires with all 4 key symptoms + more_than_2_weeks → HIGH",
    async () => {
      const result = await runPrologInference(
        [
          "weight_loss",
          "persistent_fatigue",
          "night_sweats",
          "swollen_lymph_nodes",
        ],
        "more_than_2_weeks",
      );
      assertDiagnosis(result, "HIV/AIDS", "high");
      expect(result.rules_fired).toContain("hiv_high");
    },
  );

  itSwipl(
    "hiv_medium fires with recurring_fever + persistent_fatigue + swollen_lymph_nodes + weight_loss + more_than_2_weeks → MEDIUM",
    async () => {
      const result = await runPrologInference(
        [
          "recurring_fever",
          "persistent_fatigue",
          "swollen_lymph_nodes",
          "weight_loss",
        ],
        "more_than_2_weeks",
      );
      assertDiagnosis(result, "HIV/AIDS", "medium");
      expect(result.rules_fired).toContain("hiv_medium");
    },
  );

  itSwipl(
    "hiv_possible fires with oral_thrush + weight_loss + night_sweats + more_than_2_weeks → POSSIBLE",
    async () => {
      const result = await runPrologInference(
        ["oral_thrush", "weight_loss", "night_sweats"],
        "more_than_2_weeks",
      );
      assertDiagnosis(result, "HIV/AIDS", "possible");
      expect(result.rules_fired).toContain("hiv_possible");
    },
  );

  itSwipl(
    "HIV/AIDS is EXCLUDED when symptom_duration is less_than_2_weeks — returns fallback",
    async () => {
      // All hiv_high symptoms present but duration is too short → HIV excluded
      const result = await runPrologInference(
        [
          "weight_loss",
          "persistent_fatigue",
          "night_sweats",
          "swollen_lymph_nodes",
        ],
        "less_than_2_weeks",
      );
      // HIV excluded by duration; no malaria (no chills) or diarrhoea (no loose_stools)
      assertFallback(result);
    },
  );

  itSwipl(
    'HIV/AIDS is NOT excluded when symptom_duration is "unknown" — hiv_high fires',
    async () => {
      const result = await runPrologInference(
        [
          "weight_loss",
          "persistent_fatigue",
          "night_sweats",
          "swollen_lymph_nodes",
        ],
        "unknown",
      );
      assertDiagnosis(result, "HIV/AIDS", "high");
    },
  );

  itSwipl(
    "HIV/AIDS advice contains URGENT language for a HIGH-confidence result",
    async () => {
      const result = await runPrologInference(
        [
          "weight_loss",
          "persistent_fatigue",
          "night_sweats",
          "swollen_lymph_nodes",
        ],
        "more_than_2_weeks",
      );
      expect(result.advice.toUpperCase()).toContain("URGENT");
    },
  );
});

// =============================================================================
// 4. FALLBACK — no rules match
// =============================================================================
describe("Expert System — Fallback (no rules fired)", () => {
  itSwipl(
    "returns fallback when only a single diarrhoea symptom with no loose_stools is provided",
    async () => {
      const result = await runPrologInference(["bloating"], "unknown");
      assertFallback(result);
    },
  );

  itSwipl("returns fallback for an unrecognised symptom atom", async () => {
    const result = await runPrologInference(
      ["completely_unknown_symptom_xyz"],
      "unknown",
    );
    assertFallback(result);
  });

  itSwipl(
    "fallback advice tells the user to consult a medical professional",
    async () => {
      const result = await runPrologInference(["bloating"], "unknown");
      expect(result.advice.toLowerCase()).toContain("consult");
    },
  );

  itSwipl(
    "fallback reasoning mentions that no rules could be matched",
    async () => {
      const result = await runPrologInference(["bloating"], "unknown");
      expect(result.reasoning.toLowerCase()).toContain("no diagnostic rules");
    },
  );
});

// =============================================================================
// 5. RESPONSE STRUCTURE — invariants that must hold for every result
// =============================================================================
describe("Expert System — Response structure invariants", () => {
  const scenarios: Array<{
    label: string;
    symptoms: string[];
    duration: string;
  }> = [
    {
      label: "malaria HIGH",
      symptoms: ["fever", "chills", "headache", "sweating", "muscle_pain"],
      duration: "unknown",
    },
    {
      label: "malaria MEDIUM",
      symptoms: ["fever", "chills", "nausea", "vomiting"],
      duration: "unknown",
    },
    {
      label: "diarrhoea HIGH",
      symptoms: ["loose_stools", "stomach_cramps", "dehydration"],
      duration: "unknown",
    },
    {
      label: "HIV/AIDS HIGH",
      symptoms: [
        "weight_loss",
        "persistent_fatigue",
        "night_sweats",
        "swollen_lymph_nodes",
      ],
      duration: "more_than_2_weeks",
    },
    { label: "fallback", symptoms: ["bloating"], duration: "unknown" },
  ];

  for (const { label, symptoms, duration } of scenarios) {
    itSwipl(
      `result for "${label}" satisfies the PrologResult shape contract`,
      async () => {
        const result = await runPrologInference(symptoms, duration);
        assertResultShape(result);
      },
    );
  }

  itSwipl(
    "rules_fired is an array of strings for a matched diagnosis",
    async () => {
      const result = await runPrologInference(
        ["fever", "chills", "headache", "sweating", "muscle_pain"],
        "unknown",
      );
      for (const rule of result.rules_fired) {
        expect(typeof rule).toBe("string");
      }
    },
  );

  itSwipl(
    "matched_symptoms is an array of strings for a matched diagnosis",
    async () => {
      const result = await runPrologInference(
        ["fever", "chills", "headache", "sweating", "muscle_pain"],
        "unknown",
      );
      for (const symptom of result.matched_symptoms) {
        expect(typeof symptom).toBe("string");
      }
    },
  );

  itSwipl(
    "confidence is always one of: high | medium | possible | none",
    async () => {
      const results = await Promise.all([
        runPrologInference(
          ["fever", "chills", "headache", "sweating", "muscle_pain"],
          "unknown",
        ),
        runPrologInference(
          ["fever", "chills", "nausea", "vomiting"],
          "unknown",
        ),
        runPrologInference(
          ["fever", "chills", "sweating", "headache"],
          "unknown",
        ),
        runPrologInference(["bloating"], "unknown"),
      ]);

      const validConfidences: ConfidenceLevel[] = [
        "high",
        "medium",
        "possible",
        "none",
      ];
      for (const r of results) {
        expect(validConfidences).toContain(r.confidence);
      }
    },
  );
});

// =============================================================================
// 6. EDGE CASES
// =============================================================================
describe("Expert System — Edge cases", () => {
  itSwipl(
    "duplicate symptoms in the input array are deduplicated — diagnosis still fires correctly",
    async () => {
      // fever appears three times — should still match malaria_high
      const result = await runPrologInference(
        [
          "fever",
          "fever",
          "chills",
          "headache",
          "sweating",
          "muscle_pain",
          "chills",
        ],
        "unknown",
      );
      assertDiagnosis(result, "malaria", "high");
    },
  );

  itSwipl(
    "extra unrecognised symptoms alongside valid ones do not break the diagnosis",
    async () => {
      // malaria_high symptoms + a completely unknown atom
      const result = await runPrologInference(
        [
          "fever",
          "chills",
          "headache",
          "sweating",
          "muscle_pain",
          "alien_symptom_xyz",
        ],
        "unknown",
      );
      assertDiagnosis(result, "malaria", "high");
    },
  );

  itSwipl(
    "when symptoms from two diseases both fire medium rules, the first in rule order wins",
    async () => {
      // malaria_medium requires: fever, chills, nausea, vomiting
      // diarrhoea_medium requires: loose_stools, abdominal_pain, nausea
      // Both fire at MEDIUM — malaria is defined first in the knowledge base
      const result = await runPrologInference(
        [
          "fever",
          "chills",
          "nausea",
          "vomiting",
          "loose_stools",
          "abdominal_pain",
        ],
        "unknown",
      );
      // Both malaria and diarrhoea medium rules fire; malaria rules appear first
      expect(result.diagnosis).toBe("malaria");
      expect(result.confidence).toBe("medium");
    },
  );

  itSwipl(
    'HIV/AIDS with "unknown" duration is not excluded and produces a valid diagnosis',
    async () => {
      const result = await runPrologInference(
        ["oral_thrush", "weight_loss", "night_sweats"],
        "unknown",
      );
      // unknown duration does not trigger the less_than_2_weeks exclusion
      assertDiagnosis(result, "HIV/AIDS", "possible");
    },
  );

  itSwipl(
    "a large symptom set spanning all three diseases resolves without error",
    async () => {
      // Stress test — submit all 22 known symptoms at once
      const allSymptoms = [
        "fever",
        "chills",
        "headache",
        "sweating",
        "muscle_pain",
        "nausea",
        "vomiting",
        "loose_stools",
        "stomach_cramps",
        "abdominal_pain",
        "dehydration",
        "mild_fever",
        "loss_of_appetite",
        "bloating",
        "weight_loss",
        "persistent_fatigue",
        "night_sweats",
        "swollen_lymph_nodes",
        "recurring_fever",
        "oral_thrush",
        "shortness_of_breath",
        "frequent_infections",
      ];
      const result = await runPrologInference(allSymptoms, "more_than_2_weeks");

      // At least one rule fires and the result has the correct shape
      assertResultShape(result);
      expect(result.confidence).not.toBe("none");
      expect(result.rules_fired.length).toBeGreaterThan(0);
    },
  );
});
