import z from "zod";

import { COMPARISON_OPERATORS } from "@/modules/alerts/types/alert.type.js";
import { paginationQuerySchema } from "@/shared/schemas/pagination.schema.js";

export const alertConfigBodySchema = z.object({
  manager_user_id: z.coerce.number().int().positive().nullable().default(null),
  sensor_id: z.coerce.number().int().positive(),
  reference_value: z.coerce.number(),
  comparison_operator: z.enum(COMPARISON_OPERATORS),
  message: z.string().trim().max(200).nullable().default(null),
  active: z.coerce.boolean().default(true),
});

export const listAlertConfigsQuerySchema = paginationQuerySchema.extend({
  sensor_id: z.coerce.number().int().positive().optional(),
  manager_user_id: z.coerce.number().int().positive().optional(),
});

export const listTriggeredAlertsQuerySchema = paginationQuerySchema.extend({
  acknowledged: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const acknowledgeBodySchema = z.object({
  // TODO: remover quando o serviço de autenticação existir. Pelo contrato de
  // API o corpo é vazio e o id vem do JWT (request.user.id).
  acknowledged_by: z.coerce.number().int().positive(),
});

export type AlertConfigBodyInput = z.infer<typeof alertConfigBodySchema>;
export type ListAlertConfigsQuery = z.infer<typeof listAlertConfigsQuerySchema>;
export type ListTriggeredAlertsQuery = z.infer<
  typeof listTriggeredAlertsQuerySchema
>;
export type IdParam = z.infer<typeof idParamSchema>;
export type AcknowledgeBodyInput = z.infer<typeof acknowledgeBodySchema>;
