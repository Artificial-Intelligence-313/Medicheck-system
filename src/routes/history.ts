import { Router, Request, Response, IRouter } from 'express';
import { getHistory } from '../services/diagnosisService';

const router: IRouter = Router();

/**
 * GET /api/history/:sessionId
 *
 * Returns all past diagnoses for a given session UUID, newest first.
 */
router.get('/:sessionId', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;

  // Basic UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    res.status(400).json({ error: 'sessionId must be a valid UUID.' });
    return;
  }

  try {
    const history = await getHistory(sessionId);
    res.status(200).json(history);
  } catch (err) {
    const message = err instanceof Error ? (err.message || err.toString()) : String(err);
    console.error(`[GET /api/history/${sessionId}] Error:`, message, err);
    res.status(500).json({ error: 'Failed to retrieve history.', detail: message });
  }
});

export default router;
