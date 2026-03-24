"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const diagnosisService_1 = require("../services/diagnosisService");
const router = (0, express_1.Router)();
/**
 * GET /api/symptoms
 *
 * Returns the full symptom catalog grouped by disease category.
 * The frontend uses this to render the symptom selection UI.
 *
 * Response: { categories: { [disease]: [{name, display_name}] }, all_symptoms: [...] }
 */
router.get('/', async (_req, res) => {
    try {
        const symptoms = await (0, diagnosisService_1.getSymptoms)();
        res.status(200).json(symptoms);
    }
    catch (err) {
        const message = err instanceof Error ? (err.message || err.toString()) : String(err);
        console.error('[GET /api/symptoms] Error:', message, err);
        res.status(500).json({ error: 'Failed to retrieve symptoms.', detail: message });
    }
});
exports.default = router;
//# sourceMappingURL=symptoms.js.map