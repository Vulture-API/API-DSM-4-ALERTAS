import { ApplicationError } from "@/errors/application.error.js";

export class TriggeredAlertNotFoundError extends ApplicationError {
  constructor() {
    super(404, "TRIGGERED_ALERT_NOT_FOUND", "Triggered alert not found.");
  }
}
