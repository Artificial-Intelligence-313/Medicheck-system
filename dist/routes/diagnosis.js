"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const diagnosisService_1 = require("../services/diagnosisService");
const router = (0, express_1.Router)();
/**
 * POST /api/diagnosis
 *
 * Body: { symptoms: string[], symptom_duration?: string, session_id?: string }
 *
 * Passes symptoms to the Prolog forward-chaining inference engine,
 * persists the result, and returns the full diagnosis with reasoning chain.
 */
router.post('/', async (req, res) => {
    const body = req.body;
    // --- Validation ---
    if (!body.symptoms || !Array.isArray(body.symptoms) || body.symptoms.length === 0) {
        res.status(400).json({
            error: 'symptoms is required and must be a non-empty array of strings.',
        });
        return;
    }
    const invalidSymptoms = body.symptoms.filter((s) => typeof s !== 'string' || s.trim() === '');
    if (invalidSymptoms.length > 0) {
        res.status(400).json({
            error: 'All symptoms must be non-empty strings.',
        });
        return;
    }
    const validDurations = ['less_than_2_weeks', 'more_than_2_weeks', 'unknown', undefined];
    if (body.symptom_duration !== undefined && !validDurations.includes(body.symptom_duration)) {
        res.status(400).json({
            error: 'symptom_duration must be one of: less_than_2_weeks, more_than_2_weeks, unknown',
        });
        return;
    }
    try {
        const result = await (0, diagnosisService_1.runDiagnosis)({
            symptoms: body.symptoms,
            symptom_duration: body.symptom_duration,
            session_id: body.session_id,
        });
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? (err.message || err.toString()) : String(err);
        console.error('[POST /api/diagnosis] Error:', message, err);
        res.status(500).json({ error: 'Diagnosis failed.', detail: message });
    }
});
exports.default = router;
//# sourceMappingURL=diagnosis.js.map