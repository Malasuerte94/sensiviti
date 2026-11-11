import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import {
  summarizeTurns,
  turnDistance,
  validateTurnSettings,
  type TurnCaptureEvent,
  type TurnCaptureRequest,
  type TurnSample,
} from '../src/core/turnMeasurement';

const requestSchema = z
  .object({ id: z.string().uuid(), dpi: z.number(), sensitivity: z.number() })
  .strict();
const packetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('measuring') }),
  z.object({ type: z.literal('error'), message: z.string().max(1000) }),
  z.object({
    type: z.literal('sample'),
    x: z.number(),
    y: z.number(),
    pathX: z.number(),
    pathY: z.number(),
    elapsedMs: z.number(),
  }),
]);
interface Run {
  request: TurnCaptureRequest;
  child: ChildProcessWithoutNullStreams;
  samples: TurnSample[];
  ready: boolean;
  measuring: boolean;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Owns a single short-lived receiver. No input data is written to the profile or disk. */
export class TurnCaptureController {
  private active: Run | null = null;
  constructor(
    private executable: string,
    private emit: (event: TurnCaptureEvent) => void,
  ) {}

  start(input: unknown): Promise<void> {
    const request = requestSchema.parse(input);
    validateTurnSettings(request.dpi, request.sensitivity);
    this.cancel();
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [String(process.pid)], {
        windowsHide: true,
        stdio: 'pipe',
      });
      const run: Run = {
        request,
        child,
        samples: [],
        ready: false,
        measuring: false,
        reject,
        timer: setTimeout(() => this.fail(run, 'Mouse capture did not start. Try again.'), 10000),
      };
      this.active = run;
      // Keep stderr drained, but do not expose process details in the renderer.
      child.stderr.resume();
      child.stdin.on('error', () =>
        this.fail(run, 'The mouse capture connection closed. Try again.'),
      );
      child.once('error', () =>
        this.fail(
          run,
          'Could not launch mouse capture. Reinstall the Windows desktop app or rebuild it.',
        ),
      );
      child.once('close', () =>
        this.fail(run, 'Mouse capture stopped before three turns were completed. Try again.'),
      );
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        if (this.active !== run) return;
        try {
          if (line.length > 4096) throw new Error('Invalid mouse capture response.');
          const event = packetSchema.parse(JSON.parse(line));
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'ready') {
            if (run.ready) throw new Error('Mouse capture restarted unexpectedly.');
            run.ready = true;
            clearTimeout(run.timer);
            run.timer = setTimeout(
              () => this.fail(run, 'Measurement expired. Arm it again when ready.'),
              610000,
            );
            this.emit({ id: request.id, type: 'ready' });
            resolve();
          } else if (event.type === 'measuring') {
            if (!run.ready || run.measuring) throw new Error('Invalid mouse capture sequence.');
            run.measuring = true;
            this.emit({ id: request.id, type: 'measuring' });
          } else {
            if (!run.measuring) throw new Error('A turn was received without a start marker.');
            const cm = turnDistance(event, request.dpi);
            run.samples.push(event);
            run.measuring = false;
            this.emit({ id: request.id, type: 'sample', count: run.samples.length, cm });
            if (run.samples.length === 3) {
              const result = summarizeTurns(run.samples, request.dpi);
              this.release(run);
              this.emit({ id: request.id, type: 'complete', ...result });
            }
          }
        } catch (error) {
          this.fail(
            run,
            error instanceof Error ? error.message : 'Invalid mouse capture response.',
          );
        }
      });
    });
  }

  cancel(id?: string) {
    const run = this.active;
    if (!run || (id !== undefined && run.request.id !== id)) return;
    this.release(run);
    run.reject(new Error('Measurement cancelled.'));
    this.emit({ id: run.request.id, type: 'cancelled' });
  }

  private fail(run: Run, message: string) {
    if (this.active !== run) return;
    this.release(run);
    run.reject(new Error(message));
    this.emit({ id: run.request.id, type: 'error', message });
  }

  private release(run: Run) {
    this.active = null;
    clearTimeout(run.timer);
    // Graceful EOF releases the hotkey; forced termination covers a stuck helper.
    run.child.stdin.end('\n');
    const kill = setTimeout(() => run.child.kill(), 1000);
    kill.unref();
    run.child.once('close', () => clearTimeout(kill));
  }
}
