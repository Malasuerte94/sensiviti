import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnCaptureEvent } from '../src/core/turnMeasurement';
import { TurnCaptureController } from '../electron/turnCapture';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));
class Receiver extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
  packet(value: unknown) {
    this.stdout.write(JSON.stringify(value) + '\n');
  }
}
const request = { id: 'a3646fc2-ad7f-4323-813c-d3bc715eed97', dpi: 1600, sensitivity: 2 };
const turn = { type: 'sample', x: 16000, y: 0, pathX: 16000, pathY: 0, elapsedMs: 5000 };
let receiver: Receiver;
let events: TurnCaptureEvent[];
let controller: TurnCaptureController;
beforeEach(() => {
  vi.useFakeTimers();
  receiver = new Receiver();
  spawn.mockReturnValue(receiver);
  events = [];
  controller = new TurnCaptureController('test-receiver.exe', (event) => events.push(event));
});
afterEach(() => {
  controller.cancel();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function arm() {
  const ready = controller.start(request);
  receiver.packet({ type: 'ready' });
  await ready;
}
function finishTurn(x = 16000) {
  receiver.packet({ type: 'measuring' });
  receiver.packet({ ...turn, x, pathX: Math.abs(x) });
}

describe('native capture lifecycle', () => {
  it('only completes after three valid turns and ignores a late process exit', async () => {
    await arm();
    finishTurn();
    finishTurn(-16000);
    expect(events.some((event) => event.type === 'complete')).toBe(false);
    finishTurn();
    expect(events.at(-1)).toEqual({ id: request.id, type: 'complete', cm: 25.4, spread: 0 });
    receiver.emit('close', 0);
    expect(events.at(-1)?.type).toBe('complete');
    expect(receiver.stdin.writableEnded).toBe(true);
  });
  it('rejects inconsistent turns without emitting a result', async () => {
    await arm();
    finishTurn();
    finishTurn();
    finishTurn(32000);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('5%') });
    expect(events.some((event) => event.type === 'complete')).toBe(false);
  });
  it('handles unavailable F11 and startup timeouts', async () => {
    const start = controller.start(request);
    receiver.packet({ type: 'error', message: 'F11 is already in use.' });
    await expect(start).rejects.toThrow('F11');
    receiver = new Receiver();
    spawn.mockReturnValue(receiver);
    const timeout = controller.start(request);
    const assertion = expect(timeout).rejects.toThrow('did not start');
    vi.advanceTimersByTime(10000);
    await assertion;
  });
  it('ignores cancellation for another session and discards events after cancellation', async () => {
    await arm();
    controller.cancel('other');
    finishTurn();
    expect(events.at(-1)?.type).toBe('sample');
    controller.cancel(request.id);
    finishTurn();
    receiver.emit('close', 1);
    expect(events.at(-1)?.type).toBe('cancelled');
    vi.advanceTimersByTime(1000);
    expect(receiver.kill).not.toHaveBeenCalled();
  });
  it('terminates a helper that does not respond to cancellation', async () => {
    await arm();
    controller.cancel(request.id);
    vi.advanceTimersByTime(1000);
    expect(receiver.kill).toHaveBeenCalledOnce();
  });
  it('cleans up cancelled startup and process crashes', async () => {
    const start = controller.start(request);
    controller.cancel(request.id);
    await expect(start).rejects.toThrow('cancelled');
    receiver = new Receiver();
    spawn.mockReturnValue(receiver);
    await arm();
    receiver.emit('error', new Error('spawn failed'));
    expect(events.at(-1)?.type).toBe('error');
  });
  it('rejects invalid requests and out-of-order native messages', async () => {
    expect(() => controller.start({ ...request, dpi: 0 })).toThrow();
    expect(spawn).not.toHaveBeenCalled();
    await arm();
    receiver.packet(turn);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('start marker'),
    });
  });
});
