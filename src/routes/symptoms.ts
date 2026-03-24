import { Router, Request, Response, IRouter } from 'express';
import { getSymptoms } from '../services/diagnosisService';

const router: IRouter = Router();

/**
 * GET /api/symptoms
 *
 * Returns the full symptom catalog grouped by disease category.
 * The frontend uses this to render the symptom selection UI.
 *
 * Response: { categories: { [disease]: [{name, display_name}] }, all_symptoms: [...] }
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const symptoms = await getSymptoms();
    res.status(200).json(symptoms);
  } catch (err) {
    const message = err instanceof Error ? (err.message || err.toString()) : String(err);
    console.error('[GET /api/symptoms] Error:', message, err);
    res.status(500).json({ error: 'Failed to retrieve symptoms.', detail: message });
  }
});

export default router;
