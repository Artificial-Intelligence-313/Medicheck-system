// =============================================================================
// MediCheck — Integration Tests: GET /api/history/:sessionId
//
// Tests the HTTP layer of the history route in isolation.
// The diagnosisService is fully mocked so no database or Prolog process is
// started.  Each test exercises the Express route handler directly via
// supertest.
//
// Coverage targets
//   ✓ 200 — valid UUID returns history response
//   ✓ 200 — session with no diagnoses returns empty array
//   ✓ 200 — multiple diagnoses returned in correct shape
//   ✓ 400 — malformed UUID (not UUID format)
//   ✓ 400 — numeric string used as sessionId
//   ✓ 400 — partial / truncated UUID
//   ✓ 400 — plain text string (e.g. "me")
//   ✓ 400 — UUID with wrong segment lengths
//   ✓ 500 — service throws an unexpected error
//   ✓ Response envelope always contains session_id, count, diagnoses
// =============================================================================

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports
// ---------------------------------------------------------------------------
jest.mock('../../services/diagnosisService');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import express        from 'express';
import request        from 'supertest';
import historyRouter  from '../../routes/history';
import { getHistory } from '../../services/diagnosisService';
import {
  makeDiagnosisResponse,
  makeDbDiagnosisRow,
} from '../helpers/mockFactory';
import type { HistoryResponse } from '../../types/index';

// ---------------------------------------------------------------------------
// Typed mock
// ---------------------------------------------------------------------------
const mockGetHistory = getHistory as jest.MockedFunction<typeof getHistory>;

// ---------------------------------------------------------------------------
// Build a minimal Express app containing only the route under test.
// Avoids importing server.ts (which calls app.listen()) and keeps the
// test scope tightly focused on the history endpoint.
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/api/history', historyRouter);

// ---------------------------------------------------------------------------
// Convenience factory — builds a HistoryResponse with n diagnoses
// ---------------------------------------------------------------------------
function makeHistoryResponse(
  sessionId: string,
  count: number,
): HistoryResponse {
  const diagnoses = Array.from({ length: count }, (_, i) =>
    makeDiagnosisResponse({
      session_id:   sessionId,
      diagnosis_id: i + 1,
    }),
  );
  return { session_id: sessionId, count, diagnoses };
}

// =============================================================================
// Test suite
// =============================================================================

const VALID_UUID    = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_UUID_2  = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

describe('GET /api/history/:sessionId', () => {

  // --------------------------------------------------------------------------
  // 2xx — success paths
  // --------------------------------------------------------------------------
  describe('200 — successful responses', () => {

    it('returns 200 and the full history for a valid UUID with diagnoses', async () => {
      const history = makeHistoryResponse(VALID_UUID, 2);
      mockGetHistory.mockResolvedValue(history);

      const res = await request(app).get(`/api/history/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe(VALID_UUID);
      expect(res.body.count).toBe(2);
      expect(res.body.diagnoses).toHaveLength(2);
    });

    it('returns 200 with count 0 and empty diagnoses when the session has no history', async () => {
      const emptyHistory: HistoryResponse = {
        session_id: VALID_UUID,
        count:      0,
        diagnoses:  [],
      };
      mockGetHistory.mockResolvedValue(emptyHistory);

      const res = await request(app).get(`/api/history/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.diagnoses).toEqual([]);
    });

    it('returns a response whose diagnoses contain all required DiagnosisResponse fields', async () => {
      const history = makeHistoryResponse(VALID_UUID, 1);
      mockGetHistory.mockResolvedValue(history);

      const res = await request(app).get(`/api/history/${VALID_UUID}`);

      expect(res.status).toBe(200);
      const diag = res.body.diagnoses[0];
      expect(diag).toHaveProperty('session_id');
      expect(diag).toHaveProperty('diagnosis_id');
      expect(diag).toHaveProperty('diagnosis');
      expect(diag).toHaveProperty('confidence');
      expect(diag).toHaveProperty('rules_fired');
      expect(diag).toHaveProperty('matched_symptoms');
      expect(diag).toHaveProperty('reasoning');
      expect(diag).toHaveProperty('advice');
      expect(diag).toHaveProperty('symptoms_submitted');
      expect(diag).toHaveProperty('created_at');
    });

    it('accepts a UUID with uppercase letters (case-insensitive regex)', async () => {
      const upperUuid  = VALID_UUID.toUpperCase();
      const history    = makeHistoryResponse(upperUuid, 0);
      mockGetHistory.mockResolvedValue(history);

      const res = await request(app).get(`/api/history/${upperUuid}`);

      // The route uses /i flag so this must pass UUID validation
      expect(res.status).toBe(200);
    });

    it('forwards the sessionId param directly to getHistory', async () => {
      mockGetHistory.mockResolvedValue(makeHistoryResponse(VALID_UUID_2, 0));

      await request(app).get(`/api/history/${VALID_UUID_2}`);

      expect(mockGetHistory).toHaveBeenCalledTimes(1);
      expect(mockGetHistory).toHaveBeenCalledWith(VALID_UUID_2);
    });

    it('returns 200 with multiple diagnoses preserving their order', async () => {
      const diagnoses = [
        makeDiagnosisResponse({ diagnosis_id: 10, diagnosis: 'malaria',   created_at: '2026-03-22T12:00:00.000Z' }),
        makeDiagnosisResponse({ diagnosis_id: 9,  diagnosis: 'diarrhoea', created_at: '2026-03-22T11:00:00.000Z' }),
        makeDiagnosisResponse({ diagnosis_id: 8,  diagnosis: 'malaria',   created_at: '2026-03-22T10:00:00.000Z' }),
      ];
      const history: HistoryResponse = { session_id: VALID_UUID, count: 3, diagnoses };
      mockGetHistory.mockResolvedValue(history);

      const res = await request(app).get(`/api/history/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
      expect(res.body.diagnoses[0].diagnosis_id).toBe(10);
      expect(res.body.diagnoses[1].diagnosis_id).toBe(9);
      expect(res.body.diagnoses[2].diagnosis_id).toBe(8);
    });
  });

  // --------------------------------------------------------------------------
  // 4xx — UUID validation
  // --------------------------------------------------------------------------
  describe('400 — invalid sessionId format', () => {

    it('returns 400 when the sessionId is a plain text string', async () => {
      const res = await request(app).get('/api/history/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/uuid/i);
    });

    it('returns 400 when the sessionId is a numeric string', async () => {
      const res = await request(app).get('/api/history/1234567890');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/uuid/i);
    });

    it('returns 400 when the UUID is missing one segment (truncated)', async () => {
      const truncated = 'a1b2c3d4-e5f6-7890-abcd';   // only 4 segments
      const res = await request(app).get(`/api/history/${truncated}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/uuid/i);
    });

    it('returns 400 when a UUID segment has the wrong length', async () => {
      const badUuid = 'a1b2c3d4-e5f6-7890-abcd-ef12345678901234'; // last segment too long
      const res = await request(app).get(`/api/history/${badUuid}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/uuid/i);
    });

    it('returns 400 when the sessionId contains non-hex characters', async () => {
      const nonHex = 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz';
      const res = await request(app).get(`/api/history/${nonHex}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/uuid/i);
    });

    it('does NOT call getHistory when the UUID is invalid', async () => {
      await request(app).get('/api/history/this-is-not-valid');

      expect(mockGetHistory).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 5xx — service errors
  // --------------------------------------------------------------------------
  describe('500 — unexpected service errors', () => {

    it('returns 500 when getHistory throws an unexpected error', async () => {
      mockGetHistory.mockRejectedValue(new Error('Database connection lost'));

      const res = await request(app).get(`/api/history/${VALID_UUID}`);

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/failed to retrieve history/i);
    });

    it('includes error detail in the 500 response body', async () => {
      mockGetHistory.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5432'));

      const res = await request(app).get(`/api/history/${VALID_UUID}`);

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('detail');
      expect(res.body.detail).toContain('ECONNREFUSED');
    });
  });
});
