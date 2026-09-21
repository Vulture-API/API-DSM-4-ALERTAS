import { ApplicationError } from "@/errors/application.error.js";

export class AlertAlreadyAcknowledgedError extends ApplicationError {
  constructor() {
    super(
      409,
      "ALERT_ALREADY_ACKNOWLEDGED",
      "This alert has already been acknowledged.",
    );
  }
}
