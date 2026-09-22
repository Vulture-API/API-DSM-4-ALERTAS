import { AlertAlreadyAcknowledgedError } from "@/modules/alerts/errors/alert-already-acknowledged.error.js";
import { TriggeredAlertNotFoundError } from "@/modules/alerts/errors/triggered-alert-not-found.error.js";
import type { TriggeredAlertRepository } from "@/modules/alerts/repositories/alert.repository.js";
import type { TriggeredAlert } from "@/modules/alerts/types/alert.type.js";

export class AcknowledgeAlertService {
  constructor(
    private readonly triggeredAlertRepository: TriggeredAlertRepository,
  ) {}

  async execute(id: number, userId: number): Promise<TriggeredAlert> {
    const alert = await this.triggeredAlertRepository.findById(id);

    if (!alert) {
      throw new TriggeredAlertNotFoundError();
    }

    if (alert.acknowledged_at !== null) {
      throw new AlertAlreadyAcknowledgedError();
    }

    const acknowledged = await this.triggeredAlertRepository.acknowledge(
      id,
      userId,
    );

    if (!acknowledged) {
      // A escrita é condicional: se outra requisição reconheceu entre a leitura
      // acima e o UPDATE, a linha já não casa e cai aqui. Relendo, dá para
      // devolver o 409 correto em vez de sobrescrever quem reconheceu primeiro.
      const current = await this.triggeredAlertRepository.findById(id);

      if (current?.acknowledged_at) {
        throw new AlertAlreadyAcknowledgedError();
      }

      throw new TriggeredAlertNotFoundError();
    }

    return acknowledged;
  }
}
