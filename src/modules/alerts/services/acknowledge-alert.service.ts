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
      throw new TriggeredAlertNotFoundError();
    }

    return acknowledged;
  }
}
