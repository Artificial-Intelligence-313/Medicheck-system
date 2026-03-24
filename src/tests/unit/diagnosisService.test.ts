// =============================================================================
// MediCheck — Unit Tests: diagnosisService
//
// Tests the three exported service functions in isolation:
//   • runDiagnosis  — orchestrates Prolog inference + DB persistence
//   • getHistory    — retrieves past diagnoses for a session
//   • getSymptoms   — reads and groups the symptom catalog
//
// All external dependencies (pg Pool, prologBridge, uuid) are fully mocked so
// these tests run without a live database or a SWI-Prolog installation.
// =============================================================================

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports so Jest can hoist them
// ---------------------------------------------------------------------------

jest.mock('uuid', () => ({ v4: jest.fn() }));

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../../services/prologBridge', () => ({
  runPrologInference: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// ---------------------------------------------------------------------------

import { v4 as uuidv4 } from 'uuid';
import pool from '../../config/db';
import { runPrologInference } from '../../services/prologBridge';
import { runDiagnosis, getHistory, getSymptoms } from '../../services/diagnosisService';
import {
  makePrologResult,
  makeFallbackPrologResult,
  makeDbDiagnosisRow,
  makeSymptomCatalogRow,
  makeFullSymptomCatalog,
} from '../helpers/mockFactory';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockUuidV4            = uuidv4          as jest.Mock;
const mockQuery             = pool.query       as jest.Mock;
const mockRunPrologInference = runPrologInference as jest.Mock;

const FIXED_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const FIXED_DATE = new Date('2026-03-22T10:00:00.000Z');

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Provide stable UUID by default; individual tests can override
  mockUuidV4.mockReturnValue(FIXED_UUID);
});

// =============================================================================
// runDiagnosis
// =============================================================================

describe('runDiagnosis', () => {
  // ---------------------------------------------------------------------------
  // Helper: sets up happy-path mocks for one test
  // ---------------------------------------------------------------------------
  function setupHappyPath(prologOverrides = {}, dbRowOverrides = {}) {
    const prologResult = makePrologResult(prologOverrides);
    const dbRow = makeDbDiagnosisRow({ created_at: FIXED_DATE, ...dbRowOverrides });

    mockRunPrologInference.mockResolvedValue(prologResult);
    mockQuery.mockResolvedValue({ rows: [{ id: dbRow.id, created_at: dbRow.created_at }] });

    return { prologResult, dbRow };
  }

  // -------------------------------------------------------------------------
  // Normal / success cases
  // -------------------------------------------------------------------------

  it('returns a complete DiagnosisResponse on the happy path', async () => {
    const { prologResult } = setupHappyPath();

    const result = await runDiagnosis({ symptoms: ['fever', 'chills'] });

    expect(result.session_id).toBe(FIXED_UUID);
    expect(result.diagnosis_id).toBe(1);
    expect(result.diagnosis).toBe(prologResult.diagnosis);
    expect(result.confidence).toBe(prologResult.confidence);
    expect(result.rules_fired).toEqual(prologResult.rules_fired);
    expect(result.matched_symptoms).toEqual(prologResult.matched_symptoms);
    expect(result.reasoning).toBe(prologResult.reasoning);
    expect(result.advice).toBe(prologResult.advice);
    expect(result.created_at).toBe(FIXED_DATE.toISOString());
  });

  it('uses the diagnosis_id from the database INSERT row', async () => {
    setupHappyPath({}, { id: 99 });
    mockQuery.mockResolvedValue({ rows: [{ id: 99, created_at: FIXED_DATE }] });

    const result = await runDiagnosis({ symptoms: ['fever'] });

    expect(result.diagnosis_id).toBe(99);
  });

  it('auto-generates a UUID session_id when none is provided', async () => {
    setupHappyPath();

    const result = await runDiagnosis({ symptoms: ['fever'] });

    expect(mockUuidV4).toHaveBeenCalledTimes(1);
    expect(result.session_id).toBe(FIXED_UUID);
  });

  it('uses the caller-supplied session_id and does NOT call uuidv4', async () => {
    const customId = 'cafebabe-dead-beef-1234-abcdef012345';
    setupHappyPath();

    const result = await runDiagnosis({ symptoms: ['fever'], session_id: customId });

    expect(mockUuidV4).not.toHaveBeenCalled();
    expect(result.session_id).toBe(customId);
  });

  it('defaults symptom_duration to "unknown" when not supplied', async () => {
    setupHappyPath();

    await runDiagnosis({ symptoms: ['fever'] });

    expect(mockRunPrologInference).toHaveBeenCalledWith(
      expect.any(Array),
      'unknown',
    );
  });

  it('passes the caller-supplied symptom_duration to the Prolog bridge', async () => {
    setupHappyPath();

    await runDiagnosis({ symptoms: ['fever'], symptom_duration: 'more_than_2_weeks' });

    expect(mockRunPrologInference).toHaveBeenCalledWith(
      expect.any(Array),
      'more_than_2_weeks',
    );
  });

  // -------------------------------------------------------------------------
  // Symptom sanitisation
  // -------------------------------------------------------------------------

  it('converts uppercase symptom names to lowercase before calling Prolog', async () => {
    setupHappyPath();

    await runDiagnosis({ symptoms: ['FEVER', 'CHILLS'] });

    expect(mockRunPrologInference).toHaveBeenCalledWith(
      ['fever', 'chills'],
      expect.any(String),
    );
  });

  it('replaces spaces in symptom names with underscores', async () => {
    setupHappyPath();

    await runDiagnosis({ symptoms: ['muscle pain', 'loose stools'] });

    expect(mockRunPrologInference).toHaveBeenCalledWith(
      ['muscle_pain', 'loose_stools'],
      expect.any(String),
    );
  });

  it('trims leading and trailing whitespace from symptom names', async () => {
    setupHappyPath();

    await runDiagnosis({ symptoms: ['  fever  ', '\theadache\t'] });

    expect(mockRunPrologInference).toHaveBeenCalledWith(
      ['fever', 'headache'],
      expect.any(String),
    );
  });

  it('applies all sanitisation steps together (uppercase + spaces + trim)', async () => {
    setupHappyPath();

    await runDiagnosis({ symptoms: ['  Muscle Pain  ', ' LOOSE STOOLS '] });

    expect(mockRunPrologInference).toHaveBeenCalledWith(
      ['muscle_pain', 'loose_stools'],
      expect.any(String),
    );
  });

  it('reflects the sanitised (cleaned) symptoms in the response symptoms_submitted', async () => {
    setupHappyPath();

    const result = await runDiagnosis({ symptoms: ['FEVER', 'Chills', ' headache '] });

    expect(result.symptoms_submitted).toEqual(['fever', 'chills', 'headache']);
  });

  // -------------------------------------------------------------------------
  // Database persistence
  // -------------------------------------------------------------------------

  it('persists the diagnosis result to the database with the correct parameters', async () => {
    const { prologResult } = setupHappyPath();
    const symptoms = ['fever', 'chills'];

    await runDiagnosis({ symptoms, session_id: FIXED_UUID });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe(FIXED_UUID);                              // session_id
    expect(params[1]).toBe(JSON.stringify(symptoms));                // symptoms JSON
    expect(params[2]).toBe(prologResult.diagnosis);                  // diagnosis
    expect(params[3]).toBe(prologResult.confidence);                 // confidence
    expect(params[4]).toBe(JSON.stringify(prologResult.rules_fired));
    expect(params[5]).toBe(JSON.stringify(prologResult.matched_symptoms));
    expect(params[6]).toBe(prologResult.reasoning);
    expect(params[7]).toBe(prologResult.advice);
  });

  // -------------------------------------------------------------------------
  // Error / failure paths
  // -------------------------------------------------------------------------

  it('throws an error when symptoms is an empty array', async () => {
    await expect(runDiagnosis({ symptoms: [] }))
      .rejects.toThrow('At least one symptom must be provided.');
  });

  it('propagates errors thrown by the Prolog bridge', async () => {
    mockRunPrologInference.mockRejectedValue(
      new Error('SWI-Prolog (swipl) not found'),
    );

    await expect(runDiagnosis({ symptoms: ['fever'] }))
      .rejects.toThrow('SWI-Prolog (swipl) not found');
  });

  it('propagates database errors without swallowing them', async () => {
    mockRunPrologInference.mockResolvedValue(makePrologResult());
    mockQuery.mockRejectedValue(new Error('DB connection refused'));

    await expect(runDiagnosis({ symptoms: ['fever'] }))
      .rejects.toThrow('DB connection refused');
  });

  it('works correctly with a fallback (no-diagnosis) Prolog result', async () => {
    const fallback = makeFallbackPrologResult();
    mockRunPrologInference.mockResolvedValue(fallback);
    mockQuery.mockResolvedValue({ rows: [{ id: 5, created_at: FIXED_DATE }] });

    const result = await runDiagnosis({ symptoms: ['bloating'] });

    expect(result.diagnosis).toBe('Unable to determine diagnosis');
    expect(result.confidence).toBe('none');
    expect(result.rules_fired).toEqual([]);
    expect(result.matched_symptoms).toEqual([]);
  });
});

// =============================================================================
// getHistory
// =============================================================================

describe('getHistory', () => {
  const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('returns a HistoryResponse with the correct session_id and count', async () => {
    const row = makeDbDiagnosisRow({ created_at: FIXED_DATE });
    mockQuery.mockResolvedValue({ rows: [row] });

    const result = await getHistory(SESSION_ID);

    expect(result.session_id).toBe(SESSION_ID);
    expect(result.count).toBe(1);
  });

  it('maps each row to a correctly shaped DiagnosisResponse', async () => {
    const row = makeDbDiagnosisRow({ id: 42, created_at: FIXED_DATE });
    mockQuery.mockResolvedValue({ rows: [row] });

    const result = await getHistory(SESSION_ID);

    const diagnosis = result.diagnoses[0];
    expect(diagnosis.diagnosis_id).toBe(42);              // row.id → diagnosis_id
    expect(diagnosis.session_id).toBe(row.session_id);
    expect(diagnosis.diagnosis).toBe(row.diagnosis);
    expect(diagnosis.confidence).toBe(row.confidence);
    expect(diagnosis.rules_fired).toEqual(row.rules_fired);
    expect(diagnosis.matched_symptoms).toEqual(row.matched_symptoms);
    expect(diagnosis.reasoning).toBe(row.reasoning);
    expect(diagnosis.advice).toBe(row.advice);
    expect(diagnosis.symptoms_submitted).toEqual(row.symptoms);
    expect(diagnosis.created_at).toBe(FIXED_DATE.toISOString());
  });

  it('returns count 0 and an empty diagnoses array for an unknown session', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getHistory('00000000-0000-0000-0000-000000000000');

    expect(result.count).toBe(0);
    expect(result.diagnoses).toEqual([]);
  });

  it('returns multiple diagnoses with correct count', async () => {
    const rows = [
      makeDbDiagnosisRow({ id: 1, created_at: new Date('2026-03-22T11:00:00.000Z') }),
      makeDbDiagnosisRow({ id: 2, diagnosis: 'diarrhoea', created_at: new Date('2026-03-22T10:00:00.000Z') }),
    ];
    mockQuery.mockResolvedValue({ rows });

    const result = await getHistory(SESSION_ID);

    expect(result.count).toBe(2);
    expect(result.diagnoses).toHaveLength(2);
    expect(result.diagnoses[0].diagnosis_id).toBe(1);
    expect(result.diagnoses[1].diagnosis_id).toBe(2);
  });

  it('queries the database using the provided sessionId as a parameter', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await getHistory(SESSION_ID);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([SESSION_ID]);
  });

  it('propagates database errors', async () => {
    mockQuery.mockRejectedValue(new Error('Query timeout'));

    await expect(getHistory(SESSION_ID)).rejects.toThrow('Query timeout');
  });
});

// =============================================================================
// getSymptoms
// =============================================================================

describe('getSymptoms', () => {
  it('returns all 22 symptoms from the catalog in the all_symptoms array', async () => {
    mockQuery.mockResolvedValue({ rows: makeFullSymptomCatalog() });

    const result = await getSymptoms();

    expect(result.all_symptoms).toHaveLength(22);
  });

  it('groups symptoms into the correct disease categories', async () => {
    mockQuery.mockResolvedValue({ rows: makeFullSymptomCatalog() });

    const result = await getSymptoms();

    expect(Object.keys(result.categories)).toEqual(
      expect.arrayContaining(['malaria', 'diarrhoea', 'HIV/AIDS']),
    );
  });

  it('places every malaria symptom under the malaria category key', async () => {
    mockQuery.mockResolvedValue({ rows: makeFullSymptomCatalog() });

    const result = await getSymptoms();

    const malariaNames = result.categories['malaria'].map((s) => s.name);
    expect(malariaNames).toEqual(
      expect.arrayContaining(['fever', 'chills', 'headache', 'sweating', 'muscle_pain', 'nausea', 'vomiting']),
    );
    expect(result.categories['malaria']).toHaveLength(7);
  });

  it('includes name, display_name, and category on every all_symptoms entry', async () => {
    mockQuery.mockResolvedValue({ rows: makeFullSymptomCatalog() });

    const result = await getSymptoms();

    for (const symptom of result.all_symptoms) {
      expect(symptom).toHaveProperty('name');
      expect(symptom).toHaveProperty('display_name');
      expect(symptom).toHaveProperty('category');
      expect(typeof symptom.name).toBe('string');
      expect(typeof symptom.display_name).toBe('string');
      expect(typeof symptom.category).toBe('string');
    }
  });

  it('includes only name and display_name on category entries (no category field)', async () => {
    mockQuery.mockResolvedValue({ rows: makeFullSymptomCatalog() });

    const result = await getSymptoms();
    const entry = result.categories['malaria'][0];

    expect(entry).toHaveProperty('name');
    expect(entry).toHaveProperty('display_name');
    expect(entry).not.toHaveProperty('category');
  });

  it('returns empty categories and all_symptoms when the catalog is empty', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getSymptoms();

    expect(result.categories).toEqual({});
    expect(result.all_symptoms).toEqual([]);
  });

  it('creates a new category key automatically when encountering a new disease', async () => {
    const rows = [
      makeSymptomCatalogRow({ id: 1, name: 'fever',        display_name: 'Fever',        disease_category: 'malaria' }),
      makeSymptomCatalogRow({ id: 2, name: 'loose_stools', display_name: 'Loose Stools', disease_category: 'diarrhoea' }),
    ];
    mockQuery.mockResolvedValue({ rows });

    const result = await getSymptoms();

    expect(result.categories['malaria']).toHaveLength(1);
    expect(result.categories['diarrhoea']).toHaveLength(1);
    expect(result.all_symptoms).toHaveLength(2);
  });

  it('propagates database errors', async () => {
    mockQuery.mockRejectedValue(new Error('symptoms_catalog does not exist'));

    await expect(getSymptoms()).rejects.toThrow('symptoms_catalog does not exist');
  });
});
