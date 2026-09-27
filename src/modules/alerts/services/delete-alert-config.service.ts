import { AlertConfigNotFoundError } from "@/modules/alerts/errors/alert-config-not-found.error.js";
import type { AlertConfigRepository } from "@/modules/alerts/repositories/alert.repository.js";

export class DeleteAlertConfigService {
  constructor(private readonly alertConfigRepository: AlertConfigRepository) {}

  async execute(id: number): Promise<void> {
    const deleted = await this.alertConfigRepository.delete(id);

    if (!deleted) {
      throw new AlertConfigNotFoundError();
    }
  }
}
