import { ApplicationError } from "@/errors/application.error.js";

export class AlertConfigNotFoundError extends ApplicationError {
  constructor() {
    super(404, "ALERT_CONFIG_NOT_FOUND", "Alert configuration not found.");
  }
}
