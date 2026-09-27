import { AlertConfigNotFoundError } from "@/modules/alerts/errors/alert-config-not-found.error.js";
import { SensorNotFoundError } from "@/modules/alerts/errors/sensor-not-found.error.js";
import type { AlertConfigRepository } from "@/modules/alerts/repositories/alert.repository.js";
import type { AlertConfigBodyInput } from "@/modules/alerts/schemas/alert.schema.js";
import type { AlertConfig } from "@/modules/alerts/types/alert.type.js";

export class UpdateAlertConfigService {
  constructor(private readonly alertConfigRepository: AlertConfigRepository) {}

  async execute(id: number, input: AlertConfigBodyInput): Promise<AlertConfig> {
    const config = await this.alertConfigRepository.findById(id);

    if (!config) {
      throw new AlertConfigNotFoundError();
    }

    const sensorExists = await this.alertConfigRepository.sensorExists(
      input.sensor_id,
    );

    if (!sensorExists) {
      throw new SensorNotFoundError();
    }

    const updated = await this.alertConfigRepository.update(id, input);

    if (!updated) {
      throw new AlertConfigNotFoundError();
    }

    return updated;
  }
}
