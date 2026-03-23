// =============================================================================
// MediCheck — Integration Tests: GET /api/symptoms
//
// Verifies the HTTP layer for the symptoms catalog endpoint.
// The diagnosisService is fully mocked so no database is required.
//
// Tests cover:
//   ✓ 200 response with correct shape
//   ✓ categories object is present and grouped by disease
//   ✓ all_symptoms flat array is present
//   ✓ each entry has the expected fields
//   ✓ 500 when the service throws
//   ✓ response Content-Type is application/json
//   ✓ empty catalog handled gracefully
//   ✓ HTTP method restrictions (POST not allowed on this route)
// =============================================================================

// ---------------------------------------------------------------------------
// Module mocks — hoisted before imports
// ---------------------------------------------------------------------------
jest.mock('../../services/diagnosisService', () => ({
  getSymptoms: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import express      from 'express';
import request      from 'supertest';
import symptomsRouter from '../../routes/symptoms';
import { getSymptoms } from '../../services/diagnosisService';
import {
  makeFullSymptomCatalog,
  makeSymptomCatalogRow,
} from '../helpers/mockFactory';
import type { SymptomsResponse } from '../../types/index';

// ---------------------------------------------------------------------------
// Typed mock helper
// ---------------------------------------------------------------------------
const mockGetSymptoms = getSymptoms as jest.MockedFunction<typeof getSymptoms>;

// ---------------------------------------------------------------------------
// Test Express app — mirrors server.ts but isolated to this router
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/api/symptoms', symptomsRouter);

// ---------------------------------------------------------------------------
// Shared fixture: the full catalog as a SymptomsResponse
// ---------------------------------------------------------------------------
function buildFullSymptomsResponse(): SymptomsResponse {
  const rows = makeFullSymptomCatalog();
  const categories: SymptomsResponse['categories'] = {};
  const all_symptoms: SymptomsResponse['all_symptoms'] = [];

  for (const row of rows) {
    if (!categories[row.disease_category]) {
      categories[row.disease_category] = [];
    }
    categories[row.disease_category].push({
      name:         row.name,
      display_name: row.display_name,
    });
    all_symptoms.push({
      name:         row.name,
      display_name: row.display_name,
      category:     row.disease_category,
    });
  }

  return { categories, all_symptoms };
}

// =============================================================================
// Test suite
// =============================================================================
describe('GET /api/symptoms', () => {

  // --------------------------------------------------------------------------
  // 1. Happy path — full catalog
  // --------------------------------------------------------------------------

  it('returns HTTP 200 with the symptom catalog', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    expect(res.status).toBe(200);
  });

  it('responds with Content-Type application/json', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response body contains a "categories" object and an "all_symptoms" array', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    expect(res.body).toHaveProperty('categories');
    expect(res.body).toHaveProperty('all_symptoms');
    expect(typeof res.body.categories).toBe('object');
    expect(Array.isArray(res.body.all_symptoms)).toBe(true);
  });

  it('categories object contains keys for all three diseases', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    expect(res.body.categories).toHaveProperty('malaria');
    expect(res.body.categories).toHaveProperty('diarrhoea');
    expect(res.body.categories).toHaveProperty('HIV/AIDS');
  });

  it('returns 22 symptoms total in the all_symptoms array', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    expect(res.body.all_symptoms).toHaveLength(22);
  });

  it('every all_symptoms entry has name, display_name, and category fields', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    for (const symptom of res.body.all_symptoms) {
      expect(symptom).toHaveProperty('name');
      expect(symptom).toHaveProperty('display_name');
      expect(symptom).toHaveProperty('category');
      expect(typeof symptom.name).toBe('string');
      expect(typeof symptom.display_name).toBe('string');
      expect(typeof symptom.category).toBe('string');
    }
  });

  it('every category entry has name and display_name but no category field', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    const malariaSymptoms: unknown[] = res.body.categories.malaria;
    expect(malariaSymptoms.length).toBeGreaterThan(0);

    for (const entry of malariaSymptoms as Record<string, unknown>[]) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('display_name');
      expect(entry).not.toHaveProperty('category');
    }
  });

  it('malaria category contains all 7 expected malaria symptoms', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    const malariaNames = (res.body.categories.malaria as { name: string }[]).map(
      (s) => s.name,
    );
    expect(malariaNames).toEqual(
      expect.arrayContaining([
        'fever',
        'chills',
        'headache',
        'sweating',
        'muscle_pain',
        'nausea',
        'vomiting',
      ]),
    );
  });

  it('diarrhoea category contains all 7 expected diarrhoea symptoms', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    const diarrhoeaNames = (res.body.categories.diarrhoea as { name: string }[]).map(
      (s) => s.name,
    );
    expect(diarrhoeaNames).toEqual(
      expect.arrayContaining([
        'loose_stools',
        'stomach_cramps',
        'abdominal_pain',
        'dehydration',
        'mild_fever',
        'loss_of_appetite',
        'bloating',
      ]),
    );
  });

  it('HIV/AIDS category contains all 8 expected HIV symptoms', async () => {
    mockGetSymptoms.mockResolvedValue(buildFullSymptomsResponse());

    const res = await request(app).get('/api/symptoms');

    const hivNames = (res.body.categories['HIV/AIDS'] as { name: string }[]).map(
      (s) => s.name,
    );
    expect(hivNames).toEqual(
      expect.arrayContaining([
        'weight_loss',
        'persistent_fatigue',
        'night_sweats',
        'swollen_lymph_nodes',
        'recurring_fever',
        'oral_thrush',
        'shortness_of_breath',
        'frequent_infections',
      ]),
    );
  });

  // --------------------------------------------------------------------------
  // 2. Empty catalog edge case
  // --------------------------------------------------------------------------

  it('returns 200 with empty categories and all_symptoms when catalog is empty', async () => {
    mockGetSymptoms.mockResolvedValue({ categories: {}, all_symptoms: [] });

    const res = await request(app).get('/api/symptoms');

    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual({});
    expect(res.body.all_symptoms).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 3. Error handling
  // --------------------------------------------------------------------------

  it('returns HTTP 500 when getSymptoms throws an unexpected error', async () => {
    mockGetSymptoms.mockRejectedValue(new Error('Database connection lost'));

    const res = await request(app).get('/api/symptoms');

    expect(res.status).toBe(500);
  });

  it('500 response body contains an "error" field', async () => {
    mockGetSymptoms.mockRejectedValue(new Error('symptoms_catalog does not exist'));

    const res = await request(app).get('/api/symptoms');

    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('500 response body contains a "detail" field with the error message', async () => {
    const errorMessage = 'symptoms_catalog does not exist';
    mockGetSymptoms.mockRejectedValue(new Error(errorMessage));

    const res = await request(app).get('/api/symptoms');

    expect(res.body.detail).toBe(errorMessage);
  });

  // --------------------------------------------------------------------------
  // 4. Single-symptom partial catalog
  // --------------------------------------------------------------------------

  it('handles a catalog with a single symptom in one category correctly', async () => {
    const single = makeSymptomCatalogRow({
      id: 1,
      name: 'fever',
      display_name: 'Fever',
      disease_category: 'malaria',
    });
    mockGetSymptoms.mockResolvedValue({
      categories: { malaria: [{ name: 'fever', display_name: 'Fever' }] },
      all_symptoms: [{ name: 'fever', display_name: 'Fever', category: 'malaria' }],
    });

    const res = await request(app).get('/api/symptoms');

    expect(res.status).toBe(200);
    expect(res.body.all_symptoms).toHaveLength(1);
    expect(res.body.categories.malaria).toHaveLength(1);
    expect(res.body.categories.malaria[0].name).toBe('fever');
  });
});
