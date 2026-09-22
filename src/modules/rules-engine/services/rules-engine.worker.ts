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
  private current: Promise<ProcessingResult> | null = null;
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

  /**
   * Para o agendamento e espera o ciclo que estiver em andamento terminar.
   * Quem desliga o serviço precisa aguardar isto antes de fechar o pool do
   * banco: senão o ciclo em voo consulta um pool fechado e perde o checkpoint.
   */
  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.current?.catch(() => undefined);
  }

  /**
   * Roda um ciclo. Devolve `null` só quando já existe um ciclo em andamento
   * (ocupado). Falha de processamento é repassada como exceção — assim a rota
   * manual responde 500, e não 409 "ocupado", quando o banco cai.
   */
  async runOnce(): Promise<ProcessingResult | null> {
    if (this.current) return null;

    this.current = this.processReadingsService.execute();

    try {
      const result = await this.current;
      this.options.onCycle?.(result);

      return result;
    } catch (error) {
      this.options.onError?.(error);

      throw error;
    } finally {
      this.current = null;
    }
  }

  private scheduleNext(delay: number): void {
    if (this.stopped) return;

    this.timer = setTimeout(() => {
      // Erro já foi reportado via onError; o agendamento segue no próximo ciclo.
      void this.runOnce()
        .catch(() => undefined)
        .finally(() => {
          this.scheduleNext(this.options.intervalMs);
        });
    }, delay);

    // unref: o timer pendente não deve impedir o processo de encerrar.
    this.timer.unref?.();
  }
}
