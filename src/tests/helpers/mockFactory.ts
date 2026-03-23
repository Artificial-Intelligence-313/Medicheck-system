import { EventEmitter } from 'events';
import type {
  PrologResult,
  DiagnosisResponse,
  SymptomCatalogRow,
} from '../../types/index';

// =============================================================================
// Child-process / Prolog subprocess mocks
// =============================================================================

/**
 * Typed representation of the mock child process returned by our spawn mock.
 * Mirrors the subset of ChildProcess that prologBridge.ts actually uses.
 */
export interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

/**
 * Creates a fresh mock child process with EventEmitter-based stdout/stderr.
 * Pass the return value of this to `(spawn as jest.Mock).mockReturnValue(proc)`.
 */
export function createMockProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  return proc;
}

/**
 * Simulates a Prolog subprocess completing successfully (or with a given exit
 * code).  Events are emitted in a resolved-Promise microtask so that the
 * caller's `.on('close', ...)` handler is always registered first.
 *
 * @param proc      The mock process created by `createMockProcess`.
 * @param stdout    Text to emit on proc.stdout before closing.
 * @param exitCode  Value passed to the 'close' event (default 0).
 * @param stderr    Optional text to emit on proc.stderr.
 */
export function simulateProlog(
  proc: MockChildProcess,
  stdout: string,
  exitCode = 0,
  stderr = '',
): void {
  Promise.resolve().then(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });
}

/**
 * Simulates the 'error' event on a mock process (e.g. ENOENT when swipl is
 * not installed, or a generic spawn failure).
 */
export function simulatePrologError(
  proc: MockChildProcess,
  error: Error,
): void {
  Promise.resolve().then(() => {
    proc.emit('error', error);
  });
}

// =============================================================================
// PrologResult factories
// =============================================================================

/**
 * Returns a valid PrologResult object.  Override any field you need to change.
 * Defaults to a HIGH-confidence malaria diagnosis.
 */
export function makePrologResult(overrides: Partial<PrologResult> = {}): PrologResult {
  return {
    diagnosis: 'malaria',
    confidence: 'high',
    rules_fired: ['malaria_high'],
    matched_symptoms: ['fever', 'chills', 'headache', 'sweating', 'muscle_pain'],
    reasoning:
      'Forward chaining inference initiated with 5 reported symptom(s). ' +
      '[Rule malaria_high fired: (fever, chills, headache, sweating, muscle_pain) → malaria (HIGH).] ' +
      'Conclusion: malaria diagnosed with HIGH confidence.',
    advice:
      'Seek immediate medical attention. A blood smear or RDT test is required to confirm Malaria. ' +
      'Do not self-medicate with antimalarials without laboratory confirmation.',
    error: null,
    ...overrides,
  };
}

/** Convenience wrapper — returns the canonical "no rules fired" fallback result. */
export function makeFallbackPrologResult(): PrologResult {
  return makePrologResult({
    diagnosis: 'Unable to determine diagnosis',
    confidence: 'none',
    rules_fired: [],
    matched_symptoms: [],
    reasoning:
      'No diagnostic rules could be matched to the reported symptoms. ' +
      'Please consult a medical professional for a proper evaluation.',
    advice:
      'Unable to make a diagnosis based on the provided symptoms. ' +
      'Please consult a qualified medical professional.',
  });
}

/** Returns a PrologResult for a diarrhoea HIGH diagnosis. */
export function makeDiarrhoeaPrologResult(
  overrides: Partial<PrologResult> = {},
): PrologResult {
  return makePrologResult({
    diagnosis: 'diarrhoea',
    confidence: 'high',
    rules_fired: ['diarrhoea_high'],
    matched_symptoms: ['loose_stools', 'stomach_cramps', 'dehydration'],
    reasoning:
      'Forward chaining inference initiated with 3 reported symptom(s). ' +
      '[Rule diarrhoea_high fired: (loose_stools, stomach_cramps, dehydration) → diarrhoea (HIGH).] ' +
      'Conclusion: diarrhoea diagnosed with HIGH confidence.',
    advice:
      'Stay hydrated with oral rehydration salts (ORS). Seek medical attention if dehydration is severe, ' +
      'symptoms persist beyond 48 hours, or blood appears in stools.',
    ...overrides,
  });
}

/** Returns a PrologResult for an HIV/AIDS HIGH diagnosis. */
export function makeHivPrologResult(overrides: Partial<PrologResult> = {}): PrologResult {
  return makePrologResult({
    diagnosis: 'HIV/AIDS',
    confidence: 'high',
    rules_fired: ['hiv_high'],
    matched_symptoms: ['weight_loss', 'persistent_fatigue', 'night_sweats', 'swollen_lymph_nodes'],
    reasoning:
      'Forward chaining inference initiated with 4 reported symptom(s). ' +
      '[Rule hiv_high fired: (weight_loss, persistent_fatigue, night_sweats, swollen_lymph_nodes) → HIV/AIDS (HIGH).] ' +
      'Conclusion: HIV/AIDS diagnosed with HIGH confidence.',
    advice:
      'URGENT: Please refer for HIV testing immediately. These symptoms are strongly associated with HIV/AIDS. ' +
      'Early diagnosis is critical for effective treatment and care.',
    ...overrides,
  });
}

// =============================================================================
// DiagnosisResponse factory
// =============================================================================

/**
 * Returns a valid DiagnosisResponse (as returned by the API).
 * Override any field you need.
 */
export function makeDiagnosisResponse(
  overrides: Partial<DiagnosisResponse> = {},
): DiagnosisResponse {
  return {
    session_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    diagnosis_id: 1,
    diagnosis: 'malaria',
    confidence: 'high',
    rules_fired: ['malaria_high'],
    matched_symptoms: ['fever', 'chills', 'headache', 'sweating', 'muscle_pain'],
    reasoning:
      'Forward chaining inference initiated with 5 reported symptom(s). ' +
      '[Rule malaria_high fired: (fever, chills, headache, sweating, muscle_pain) → malaria (HIGH).] ' +
      'Conclusion: malaria diagnosed with HIGH confidence.',
    advice:
      'Seek immediate medical attention. A blood smear or RDT test is required to confirm Malaria.',
    symptoms_submitted: ['fever', 'chills', 'headache', 'sweating', 'muscle_pain'],
    created_at: '2026-03-22T10:00:00.000Z',
    ...overrides,
  };
}

// =============================================================================
// Database row factories
// =============================================================================

/**
 * Mimics a raw row returned by pg for a SELECT on the `diagnoses` table.
 * `created_at` is a real Date so that `.toISOString()` works correctly.
 */
export function makeDbDiagnosisRow(overrides: Partial<{
  id: number;
  session_id: string;
  symptoms: string[];
  diagnosis: string;
  confidence: string;
  rules_fired: string[];
  matched_symptoms: string[];
  reasoning: string;
  advice: string;
  created_at: Date;
}> = {}) {
  return {
    id: 1,
    session_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    symptoms: ['fever', 'chills', 'headache', 'sweating', 'muscle_pain'],
    diagnosis: 'malaria',
    confidence: 'high',
    rules_fired: ['malaria_high'],
    matched_symptoms: ['fever', 'chills', 'headache', 'sweating', 'muscle_pain'],
    reasoning: 'Forward chaining inference initiated with 5 reported symptom(s).',
    advice: 'Seek immediate medical attention.',
    created_at: new Date('2026-03-22T10:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Mimics a raw row returned by pg for a SELECT on `symptoms_catalog`.
 */
export function makeSymptomCatalogRow(
  overrides: Partial<SymptomCatalogRow> = {},
): SymptomCatalogRow {
  return {
    id: 1,
    name: 'fever',
    display_name: 'Fever',
    disease_category: 'malaria',
    ...overrides,
  };
}

/**
 * Builds the full set of 22 symptom catalog rows that match the seeded schema,
 * useful for testing `getSymptoms()` grouping logic end-to-end.
 */
export function makeFullSymptomCatalog(): SymptomCatalogRow[] {
  const malaria = [
    ['fever', 'Fever'],
    ['chills', 'Chills'],
    ['headache', 'Headache'],
    ['sweating', 'Sweating'],
    ['muscle_pain', 'Muscle Pain'],
    ['nausea', 'Nausea'],
    ['vomiting', 'Vomiting'],
  ];
  const diarrhoea = [
    ['loose_stools', 'Loose Stools'],
    ['stomach_cramps', 'Stomach Cramps'],
    ['abdominal_pain', 'Abdominal Pain'],
    ['dehydration', 'Dehydration'],
    ['mild_fever', 'Mild Fever'],
    ['loss_of_appetite', 'Loss of Appetite'],
    ['bloating', 'Bloating'],
  ];
  const hiv = [
    ['weight_loss', 'Weight Loss'],
    ['persistent_fatigue', 'Persistent Fatigue'],
    ['night_sweats', 'Night Sweats'],
    ['swollen_lymph_nodes', 'Swollen Lymph Nodes'],
    ['recurring_fever', 'Recurring Fever'],
    ['oral_thrush', 'Oral Thrush'],
    ['shortness_of_breath', 'Shortness of Breath'],
    ['frequent_infections', 'Frequent Infections'],
  ];

  let id = 1;
  const rows: SymptomCatalogRow[] = [];

  for (const [name, display_name] of malaria) {
    rows.push({ id: id++, name, display_name, disease_category: 'malaria' });
  }
  for (const [name, display_name] of diarrhoea) {
    rows.push({ id: id++, name, display_name, disease_category: 'diarrhoea' });
  }
  for (const [name, display_name] of hiv) {
    rows.push({ id: id++, name, display_name, disease_category: 'HIV/AIDS' });
  }

  return rows;
}
