"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const diagnosisService_1 = require("../services/diagnosisService");
const router = (0, express_1.Router)();
/**
 * GET /api/history/:sessionId
 *
 * Returns all past diagnoses for a given session UUID, newest first.
 */
router.get('/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    // Basic UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
        res.status(400).json({ error: 'sessionId must be a valid UUID.' });
        return;
    }
    try {
        const history = await (0, diagnosisService_1.getHistory)(sessionId);
        res.status(200).json(history);
    }
    catch (err) {
        const message = err instanceof Error ? (err.message || err.toString()) : String(err);
        console.error(`[GET /api/history/${sessionId}] Error:`, message, err);
        res.status(500).json({ error: 'Failed to retrieve history.', detail: message });
    }
});
exports.default = router;
//# sourceMappingURL=history.js.map