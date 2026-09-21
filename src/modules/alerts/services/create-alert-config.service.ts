import { SensorNotFoundError } from "@/modules/alerts/errors/sensor-not-found.error.js";
import type { AlertConfigRepository } from "@/modules/alerts/repositories/alert.repository.js";
import type { AlertConfigBodyInput } from "@/modules/alerts/schemas/alert.schema.js";
import type { AlertConfig } from "@/modules/alerts/types/alert.type.js";

export class CreateAlertConfigService {
  constructor(private readonly alertConfigRepository: AlertConfigRepository) {}

  async execute(input: AlertConfigBodyInput): Promise<AlertConfig> {
    const sensorExists = await this.alertConfigRepository.sensorExists(
      input.sensor_id,
    );

    if (!sensorExists) {
      throw new SensorNotFoundError();
    }

    return this.alertConfigRepository.create(input);
  }
}
