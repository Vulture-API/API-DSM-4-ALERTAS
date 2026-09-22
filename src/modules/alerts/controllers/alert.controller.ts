import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  AcknowledgeBodyInput,
  AlertConfigBodyInput,
  IdParam,
  ListAlertConfigsQuery,
  ListTriggeredAlertsQuery,
} from "@/modules/alerts/schemas/alert.schema.js";
import type { AcknowledgeAlertService } from "@/modules/alerts/services/acknowledge-alert.service.js";
import type { CreateAlertConfigService } from "@/modules/alerts/services/create-alert-config.service.js";
import type { DeleteAlertConfigService } from "@/modules/alerts/services/delete-alert-config.service.js";
import type { GetAlertConfigService } from "@/modules/alerts/services/get-alert-config.service.js";
import type { ListAlertConfigsService } from "@/modules/alerts/services/list-alert-configs.service.js";
import type { ListTriggeredAlertsService } from "@/modules/alerts/services/list-triggered-alerts.service.js";
import type { UpdateAlertConfigService } from "@/modules/alerts/services/update-alert-config.service.js";

export class AlertController {
  constructor(
    private readonly createAlertConfigService: CreateAlertConfigService,
    private readonly listAlertConfigsService: ListAlertConfigsService,
    private readonly getAlertConfigService: GetAlertConfigService,
    private readonly updateAlertConfigService: UpdateAlertConfigService,
    private readonly deleteAlertConfigService: DeleteAlertConfigService,
    private readonly listTriggeredAlertsService: ListTriggeredAlertsService,
    private readonly acknowledgeAlertService: AcknowledgeAlertService,
  ) {}

  createConfig = async (
    request: FastifyRequest<{ Body: AlertConfigBodyInput }>,
    reply: FastifyReply,
  ) => {
    const config = await this.createAlertConfigService.execute(request.body);

    return reply.status(201).send(config);
  };

  listConfigs = async (
    request: FastifyRequest<{ Querystring: ListAlertConfigsQuery }>,
    reply: FastifyReply,
  ) => {
    const configs = await this.listAlertConfigsService.execute(request.query);

    return reply.status(200).send(configs);
  };

  getConfig = async (
    request: FastifyRequest<{ Params: IdParam }>,
    reply: FastifyReply,
  ) => {
    const config = await this.getAlertConfigService.execute(request.params.id);

    return reply.status(200).send(config);
  };

  updateConfig = async (
    request: FastifyRequest<{ Params: IdParam; Body: AlertConfigBodyInput }>,
    reply: FastifyReply,
  ) => {
    const config = await this.updateAlertConfigService.execute(
      request.params.id,
      request.body,
    );

    return reply.status(200).send(config);
  };

  deleteConfig = async (
    request: FastifyRequest<{ Params: IdParam }>,
    reply: FastifyReply,
  ) => {
    await this.deleteAlertConfigService.execute(request.params.id);

    return reply.status(204).send();
  };

  listTriggered = async (
    request: FastifyRequest<{ Querystring: ListTriggeredAlertsQuery }>,
    reply: FastifyReply,
  ) => {
    const alerts = await this.listTriggeredAlertsService.execute(request.query);

    return reply.status(200).send(alerts);
  };

  acknowledge = async (
    request: FastifyRequest<{ Params: IdParam; Body: AcknowledgeBodyInput }>,
    reply: FastifyReply,
  ) => {
    const alert = await this.acknowledgeAlertService.execute(
      request.params.id,
      request.body.acknowledged_by,
    );

    return reply.status(200).send(alert);
  };
}
