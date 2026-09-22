import { AlertConfigNotFoundError } from "@/modules/alerts/errors/alert-config-not-found.error.js";
import type { AlertConfigRepository } from "@/modules/alerts/repositories/alert.repository.js";
import type { AlertConfig } from "@/modules/alerts/types/alert.type.js";

export class GetAlertConfigService {
  constructor(private readonly alertConfigRepository: AlertConfigRepository) {}

  async execute(id: number): Promise<AlertConfig> {
    const config = await this.alertConfigRepository.findById(id);

    if (!config) {
      throw new AlertConfigNotFoundError();
    }

    return config;
  }
}
