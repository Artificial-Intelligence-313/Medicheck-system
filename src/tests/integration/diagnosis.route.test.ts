// =============================================================================
// MediCheck — Integration Tests: POST /api/diagnosis
//
// Tests the HTTP layer of the diagnosis route in isolation.
// The diagnosisService is fully mocked — no real DB or Prolog process runs.
//
// Coverage targets
//   ✓ 400 for every validation failure branch in the route handler
//   ✓ 200 for all valid request shapes
//   ✓ 500 when the service layer throws
//   ✓ Response body shape matches the documented API contract
// =============================================================================

// ---------------------------------------------------------------------------
// Module mock — must be declared before any import so Jest can hoist it
// ---------------------------------------------------------------------------
jest.mock('../../services/diagnosisService');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import express          from 'express';
import request          from 'supertest';
import diagnosisRouter  from '../../routes/diagnosis';
import { runDiagnosis } from '../../services/diagnosisService';
import { makeDiagnosisResponse } from '../helpers/mockFactory';

// ---------------------------------------------------------------------------
// Test Express application
// Re-creates only the slice of server.ts that is relevant to this route.
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/api/diagnosis', diagnosisRouter);

// ---------------------------------------------------------------------------
// Typed mock helper
// ---------------------------------------------------------------------------
const mockRunDiagnosis = runDiagnosis as jest.MockedFunction<typeof runDiagnosis>;

// =============================================================================
// Test suite
// =============================================================================

describe('POST /api/diagnosis', () => {

  // --------------------------------------------------------------------------
  // 1. Input validation — 400 responses
  // --------------------------------------------------------------------------
  describe('400 — input validation failures', () => {

    it('returns 400 when the "symptoms" field is missing from the request body', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/symptoms is required/i);
    });

    it('returns 400 when "symptoms" is a string instead of an array', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: 'fever,chills' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 when "symptoms" is a number instead of an array', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: 42 })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 when "symptoms" is null', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: null })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 when "symptoms" is an empty array', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: [] })
        .expect(400);

      expect(res.body.error).toMatch(/non-empty array/i);
    });

    it('returns 400 when any symptom in the array is an empty string', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', ''] })
        .expect(400);

      expect(res.body.error).toMatch(/non-empty strings/i);
    });

    it('returns 400 when any symptom in the array is a whitespace-only string', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', '   '] })
        .expect(400);

      expect(res.body.error).toMatch(/non-empty strings/i);
    });

    it('returns 400 when the array contains a non-string element (number)', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', 42] })
        .expect(400);

      expect(res.body.error).toMatch(/non-empty strings/i);
    });

    it('returns 400 when the array contains a non-string element (boolean)', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', true] })
        .expect(400);

      expect(res.body.error).toMatch(/non-empty strings/i);
    });

    it('returns 400 when the array contains a non-string element (object)', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', { name: 'chills' }] })
        .expect(400);

      expect(res.body.error).toMatch(/non-empty strings/i);
    });

    it('returns 400 when symptom_duration has an unrecognised value', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'], symptom_duration: 'two_weeks' })
        .expect(400);

      expect(res.body.error).toMatch(/symptom_duration must be one of/i);
    });

    it('does NOT call runDiagnosis when validation fails', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: [] });

      expect(mockRunDiagnosis).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Successful requests — 200 responses
  // --------------------------------------------------------------------------
  describe('200 — successful diagnosis', () => {

    beforeEach(() => {
      mockRunDiagnosis.mockResolvedValue(makeDiagnosisResponse());
    });

    it('returns 200 with a valid symptoms array', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', 'chills', 'headache'] })
        .expect(200);
    });

    it('accepts a single-element symptoms array', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'] })
        .expect(200);
    });

    it('accepts symptom_duration "less_than_2_weeks"', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'], symptom_duration: 'less_than_2_weeks' })
        .expect(200);
    });

    it('accepts symptom_duration "more_than_2_weeks"', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'], symptom_duration: 'more_than_2_weeks' })
        .expect(200);
    });

    it('accepts symptom_duration "unknown"', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'], symptom_duration: 'unknown' })
        .expect(200);
    });

    it('accepts a request without symptom_duration (field is optional)', async () => {
      await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', 'chills'] })
        .expect(200);
    });

    it('accepts a request with a provided session_id', async () => {
      const sessionId = 'cafebabe-dead-beef-1234-abcdef012345';
      mockRunDiagnosis.mockResolvedValue(
        makeDiagnosisResponse({ session_id: sessionId }),
      );

      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'], session_id: sessionId })
        .expect(200);

      expect(res.body.session_id).toBe(sessionId);
    });

    it('accepts a request without session_id and returns one in the response', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'] })
        .expect(200);

      expect(res.body).toHaveProperty('session_id');
      expect(typeof res.body.session_id).toBe('string');
    });

    it('passes the exact request body fields to runDiagnosis', async () => {
      const body = {
        symptoms:         ['fever', 'chills'],
        symptom_duration: 'more_than_2_weeks' as const,
        session_id:       'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      };

      await request(app)
        .post('/api/diagnosis')
        .send(body)
        .expect(200);

      expect(mockRunDiagnosis).toHaveBeenCalledWith({
        symptoms:         body.symptoms,
        symptom_duration: body.symptom_duration,
        session_id:       body.session_id,
      });
    });

    it('returns the full DiagnosisResponse shape from the service', async () => {
      const serviceResponse = makeDiagnosisResponse({
        diagnosis_id:     7,
        diagnosis:        'malaria',
        confidence:       'high',
        rules_fired:      ['malaria_high'],
        matched_symptoms: ['fever', 'chills'],
      });
      mockRunDiagnosis.mockResolvedValue(serviceResponse);

      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever', 'chills'] })
        .expect(200);

      expect(res.body.session_id).toBeDefined();
      expect(res.body.diagnosis_id).toBe(7);
      expect(res.body.diagnosis).toBe('malaria');
      expect(res.body.confidence).toBe('high');
      expect(res.body.rules_fired).toEqual(['malaria_high']);
      expect(res.body.matched_symptoms).toEqual(['fever', 'chills']);
      expect(res.body.reasoning).toBeDefined();
      expect(res.body.advice).toBeDefined();
      expect(res.body.symptoms_submitted).toBeDefined();
      expect(res.body.created_at).toBeDefined();
    });

    it('responds with Content-Type: application/json', async () => {
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'] })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Service layer errors — 500 responses
  // --------------------------------------------------------------------------
  describe('500 — service layer errors', () => {

    it('returns 500 when runDiagnosis throws an unexpected error', async () => {
      mockRunDiagnosis.mockRejectedValue(new Error('DB connection refused'));

      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'] })
        .expect(500);

      expect(res.body).toHaveProperty('error', 'Diagnosis failed.');
    });

    it('includes the error detail in the 500 response body', async () => {
      mockRunDiagnosis.mockRejectedValue(
        new Error('SWI-Prolog (swipl) not found'),
      );

      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'] })
        .expect(500);

      expect(res.body).toHaveProperty('detail');
      expect(res.body.detail).toMatch(/swipl/i);
    });

    it('returns 500 with a detail field when the error is a plain string throw', async () => {
      mockRunDiagnosis.mockRejectedValue('Something went terribly wrong');

      const res = await request(app)
        .post('/api/diagnosis')
        .send({ symptoms: ['fever'] })
        .expect(500);

      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('detail');
    });
  });
});
