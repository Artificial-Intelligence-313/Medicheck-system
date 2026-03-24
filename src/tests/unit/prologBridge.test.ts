// =============================================================================
// MediCheck — Unit Tests: prologBridge.ts
//
// Tests the Node ↔ SWI-Prolog IPC layer in isolation.
// `child_process.spawn` is fully mocked — no real swipl process is started.
//
// Coverage targets
//   ✓ Correct CLI arguments are passed to swipl
//   ✓ JSON is extracted from clean stdout
//   ✓ JSON is extracted when Prolog warnings precede the result line
//   ✓ Default symptom duration fallback
//   ✓ Non-zero exit with stdout still parses (Prolog warning path)
//   ✓ All rejection paths: no-stdout exit, no JSON, bad JSON, error field, timeout, ENOENT, generic error
// =============================================================================

import { EventEmitter } from 'events';
import { spawn }        from 'child_process';

import { runPrologInference } from '../../services/prologBridge';
import {
  createMockProcess,
  simulateProlog,
  simulatePrologError,
  makePrologResult,
  makeFallbackPrologResult,
} from '../helpers/mockFactory';

// ---------------------------------------------------------------------------
// Module-level mock — replaces the real `spawn` with a jest.fn()
// ---------------------------------------------------------------------------
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps createMockProcess + mockSpawn.mockReturnValue in one call. */
function setupMockProcess() {
  const proc = createMockProcess();
  mockSpawn.mockReturnValue(proc as unknown as ReturnType<typeof spawn>);
  return proc;
}

// =============================================================================
// Test suite
// =============================================================================

describe('prologBridge — runPrologInference()', () => {

  // --------------------------------------------------------------------------
  // 1. Successful inference paths
  // --------------------------------------------------------------------------
  describe('successful inference', () => {

    it('resolves with the parsed PrologResult when stdout contains clean JSON', async () => {
      const expected = makePrologResult();
      const proc     = setupMockProcess();

      simulateProlog(proc, JSON.stringify(expected), 0);

      const result = await runPrologInference(['fever', 'chills', 'headache'], 'unknown');

      expect(result.diagnosis).toBe('malaria');
      expect(result.confidence).toBe('high');
      expect(result.rules_fired).toEqual(['malaria_high']);
      expect(result.matched_symptoms).toContain('fever');
      expect(result.error).toBeNull();
    });

    it('extracts the JSON line even when Prolog prints warnings before it', async () => {
      const expected = makePrologResult({ diagnosis: 'diarrhoea', confidence: 'high' });

      // Simulate typical SWI-Prolog boot output followed by the result JSON
      const stdoutWithWarnings = [
        'Welcome to SWI-Prolog (threaded, 64 bits)',
        'WARNING: /some/path.pl:12: Singleton variables: [X]',
        'INFO: Loading knowledge base...',
        JSON.stringify(expected),   // ← this is the line that must be found
      ].join('\n');

      const proc = setupMockProcess();
      simulateProlog(proc, stdoutWithWarnings, 0);

      const result = await runPrologInference(['loose_stools'], 'unknown');

      expect(result.diagnosis).toBe('diarrhoea');
      expect(result.confidence).toBe('high');
    });

    it('picks the LAST JSON-looking line when multiple JSON fragments appear in stdout', async () => {
      const first  = JSON.stringify(makePrologResult({ diagnosis: 'diarrhoea', confidence: 'medium' }));
      const second = JSON.stringify(makePrologResult({ diagnosis: 'malaria',   confidence: 'high'   }));

      const proc = setupMockProcess();
      simulateProlog(proc, `${first}\n${second}\n`, 0);

      const result = await runPrologInference(['fever'], 'unknown');

      // extractLastJsonLine scans from the bottom, so second line wins
      expect(result.diagnosis).toBe('malaria');
    });

    it('uses "unknown" as the default symptom_duration when the argument is omitted', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 0);

      await runPrologInference(['fever']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.arrayContaining(['--duration', 'unknown']),
        expect.any(Object),
      );
    });

    it('passes the correct --symptoms comma-separated string to swipl', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 0);

      await runPrologInference(['fever', 'chills', 'headache'], 'unknown');

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.arrayContaining(['--symptoms', 'fever,chills,headache']),
        expect.any(Object),
      );
    });

    it('passes the supplied symptom_duration to swipl', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 0);

      await runPrologInference(['fever'], 'more_than_2_weeks');

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.arrayContaining(['--duration', 'more_than_2_weeks']),
        expect.any(Object),
      );
    });

    it('still resolves when swipl exits with non-zero code but stdout has valid JSON', async () => {
      // Non-zero exit can happen when Prolog emits warnings; as long as stdout
      // contains parseable JSON the bridge should succeed.
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 1 /* non-zero */);

      const result = await runPrologInference(['fever'], 'unknown');

      expect(result.diagnosis).toBe('malaria');
    });

    it('resolves without rejecting when error field is the string "null"', async () => {
      // The Prolog bridge may emit error: "null" (a string) instead of a real
      // JSON null.  The bridge code explicitly allows this.
      const prologResultWithStringNull = makePrologResult({ error: 'null' as unknown as null });
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(prologResultWithStringNull), 0);

      await expect(runPrologInference(['fever'], 'unknown')).resolves.toBeDefined();
    });

    it('resolves with the fallback result when Prolog fires no rules', async () => {
      const fallback = makeFallbackPrologResult();
      const proc     = setupMockProcess();
      simulateProlog(proc, JSON.stringify(fallback), 0);

      const result = await runPrologInference(['bloating'], 'unknown');

      expect(result.diagnosis).toBe('Unable to determine diagnosis');
      expect(result.confidence).toBe('none');
      expect(result.rules_fired).toHaveLength(0);
    });

    it('invokes swipl with the correct base arguments (-g main -t halt)', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 0);

      await runPrologInference(['fever'], 'unknown');

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.arrayContaining(['-g', 'main', '-t', 'halt']),
        expect.any(Object),
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Failure / rejection paths
  // --------------------------------------------------------------------------
  describe('failure scenarios', () => {

    it('rejects when swipl exits non-zero with empty stdout (stderr used as message)', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, '' /* empty stdout */, 1, 'ERROR: Unknown procedure: main/0');

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('Prolog process failed: ERROR: Unknown procedure: main/0');
    });

    it('includes a generic exit-code message when both stdout and stderr are empty', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, '', 2, '' /* also empty stderr */);

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('swipl exited with code 2');
    });

    it('rejects when stdout contains no JSON object at all', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, 'Loading knowledge base... done.\nAll rules checked.\n', 0);

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('No JSON output from Prolog');
    });

    it('rejects when the JSON line is syntactically malformed', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, '{ diagnosis: malaria, confidence: high }' /* invalid JSON */, 0);

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('Failed to parse Prolog JSON output');
    });

    it('rejects when the parsed result contains a non-null error field', async () => {
      const errorResult = makePrologResult({
        error: 'Missing required argument: --symptoms',
      });
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(errorResult), 0);

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('Prolog inference error: Missing required argument: --symptoms');
    });

    it('rejects with an install-hint message when swipl is not on PATH (ENOENT)', async () => {
      const proc      = setupMockProcess();
      const enoent    = Object.assign(new Error('spawn swipl ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;

      simulatePrologError(proc, enoent);

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('SWI-Prolog (swipl) not found');
    });

    it('rejects with a generic message for non-ENOENT spawn errors', async () => {
      const proc         = setupMockProcess();
      const genericError = new Error('EACCES: permission denied, spawn swipl');

      simulatePrologError(proc, genericError);

      await expect(runPrologInference(['fever'], 'unknown'))
        .rejects.toThrow('Failed to spawn swipl: EACCES: permission denied, spawn swipl');
    });

    it('rejects and kills the process after PROLOG_TIMEOUT_MS (15 s)', async () => {
      jest.useFakeTimers();

      const proc = setupMockProcess();
      // Intentionally do NOT emit 'close' — the process hangs forever

      const promise = runPrologInference(['fever'], 'unknown');

      // Advance past the 15-second guard timeout
      jest.advanceTimersByTime(15_001);

      await expect(promise).rejects.toThrow('timed out after 15000ms');
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Argument / edge-case variations
  // --------------------------------------------------------------------------
  describe('argument edge cases', () => {

    it('passes a single symptom without a trailing comma', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 0);

      await runPrologInference(['fever'], 'unknown');

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.arrayContaining(['--symptoms', 'fever']),
        expect.any(Object),
      );
    });

    it('passes less_than_2_weeks duration correctly', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makeFallbackPrologResult()), 0);

      await runPrologInference(['weight_loss', 'night_sweats'], 'less_than_2_weeks');

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.arrayContaining(['--duration', 'less_than_2_weeks']),
        expect.any(Object),
      );
    });

    it('spawns with stdio configuration ignoring stdin and piping stdout/stderr', async () => {
      const proc = setupMockProcess();
      simulateProlog(proc, JSON.stringify(makePrologResult()), 0);

      await runPrologInference(['fever'], 'unknown');

      expect(mockSpawn).toHaveBeenCalledWith(
        'swipl',
        expect.any(Array),
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
      );
    });
  });
});
