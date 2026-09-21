import type { ProcessReadingsService } from "@/modules/rules-engine/services/process-readings.service.js";
import type { ProcessingResult } from "@/modules/rules-engine/types/reading.type.js";

export type RulesEngineWorkerOptions = {
  intervalMs: number;
  onCycle?: (result: ProcessingResult) => void;
  onError?: (error: unknown) => void;
};

/**
 * `setTimeout` reagendado em vez de `setInterval`: com `setInterval` um ciclo
 * mais lento que o intervalo se sobreporia ao próximo.
 */
export class RulesEngineWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  constructor(
    private readonly processReadingsService: ProcessReadingsService,
    private readonly options: RulesEngineWorkerOptions,
  ) {}

  get isRunning(): boolean {
    return !this.stopped;
  }

  start(): void {
    if (!this.stopped) return;

    this.stopped = false;
    this.scheduleNext(0);
  }

  stop(): void {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<ProcessingResult | null> {
    if (this.running) return null;

    this.running = true;

    try {
      const result = await this.processReadingsService.execute();
      this.options.onCycle?.(result);

      return result;
    } catch (error) {
      this.options.onError?.(error);

      return null;
    } finally {
      this.running = false;
    }
  }

  private scheduleNext(delay: number): void {
    if (this.stopped) return;

    this.timer = setTimeout(() => {
      void this.runOnce().finally(() => {
        this.scheduleNext(this.options.intervalMs);
      });
    }, delay);

    // unref: o timer pendente não deve impedir o processo de encerrar.
    this.timer.unref?.();
  }
}
