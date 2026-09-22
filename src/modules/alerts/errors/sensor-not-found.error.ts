import { ApplicationError } from "@/errors/application.error.js";

export class SensorNotFoundError extends ApplicationError {
  constructor() {
    super(409, "SENSOR_NOT_FOUND", "The referenced sensor does not exist.");
  }
}
