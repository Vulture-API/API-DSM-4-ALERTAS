import type {
  AlertConfigRepository,
  TriggeredAlertRepository,
} from "@/modules/alerts/repositories/alert.repository.js";
import type {
  CheckpointRepository,
  ReadingRepository,
} from "@/modules/rules-engine/repositories/reading.repository.js";
import { RuleEvaluator } from "@/modules/rules-engine/services/rule-evaluator.service.js";
import type { ProcessingResult } from "@/modules/rules-engine/types/reading.type.js";

export type ProcessReadingsOptions = {
  batchSize?: number;
};

/**
 * O checkpoint só avança depois de gravar os alertas do lote. Se o processo
 * cair no meio, o ciclo seguinte reprocessa as mesmas leituras — a checagem
 * de duplicidade (e o índice único reading_id+alert_config_id) é o que torna
 * o reprocessamento seguro.
 */
export class ProcessReadingsService {
  private readonly batchSize: number;

  constructor(
    private readonly readingRepository: ReadingRepository,
    private readonly checkpointRepository: CheckpointRepository,
    private readonly alertConfigRepository: AlertConfigRepository,
    private readonly triggeredAlertRepository: TriggeredAlertRepository,
    options: ProcessReadingsOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 500;
  }

  async execute(): Promise<ProcessingResult> {
    const lastProcessedId =
      await this.checkpointRepository.getLastProcessedReadingId();

    const readings = await this.readingRepository.findUnprocessed(
      lastProcessedId,
      this.batchSize,
    );

    if (readings.length === 0) {
      return {
        readings_processed: 0,
        alerts_triggered: 0,
        last_reading_id: lastProcessedId,
      };
    }

    // Um lote traz muitas leituras do mesmo sensor; sem cache seria uma
    // consulta de regras por leitura.
    const configsBySensor = new Map<
      number,
      Awaited<ReturnType<AlertConfigRepository["findActiveBySensorId"]>>
    >();

    const pendingByConfig = new Map<number, boolean>();

    let alertsTriggered = 0;

    for (const reading of readings) {
      let configs = configsBySensor.get(reading.sensor_id);

      if (!configs) {
        configs = await this.alertConfigRepository.findActiveBySensorId(
          reading.sensor_id,
        );
        configsBySensor.set(reading.sensor_id, configs);
      }

      for (const config of configs) {
        if (!RuleEvaluator.violates(reading, config)) continue;

        // Enquanto a regra tiver um alerta pendente, novas leituras fora do
        // limite não geram outro: sem isso, uma condição que persiste cria um
        // alerta por leitura (um por minuto) até alguém reconhecer.
        // O cache vale só para este lote: um reconhecimento feito durante o
        // lote passa a valer no ciclo seguinte (atraso de no máximo um ciclo).
        let pending = pendingByConfig.get(config.id);
        if (pending === undefined) {
          pending = await this.triggeredAlertRepository.hasPendingForConfig(
            config.id,
          );
          pendingByConfig.set(config.id, pending);
        }
        if (pending) continue;

        const alreadyTriggered =
          await this.triggeredAlertRepository.existsForReadingAndConfig(
            reading.id,
            config.id,
          );

        if (alreadyTriggered) continue;

        const created = await this.triggeredAlertRepository.create({
          alert_config_id: config.id,
          reading_id: reading.id,
        });
        pendingByConfig.set(config.id, true);
        // null: outra instância do motor criou o pendente antes (o índice
        // único do banco recusou este).
        if (!created) continue;

        alertsTriggered++;
      }
    }

    const lastReadingId = readings[readings.length - 1]!.id;

    await this.checkpointRepository.setLastProcessedReadingId(lastReadingId);

    return {
      readings_processed: readings.length,
      alerts_triggered: alertsTriggered,
      last_reading_id: lastReadingId,
    };
  }
}
