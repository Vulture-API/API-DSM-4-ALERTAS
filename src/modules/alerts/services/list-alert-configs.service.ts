import type { AlertConfigRepository } from "@/modules/alerts/repositories/alert.repository.js";
import type { ListAlertConfigsQuery } from "@/modules/alerts/schemas/alert.schema.js";
import type { AlertConfig } from "@/modules/alerts/types/alert.type.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

export class ListAlertConfigsService {
  constructor(private readonly alertConfigRepository: AlertConfigRepository) {}

  async execute(query: ListAlertConfigsQuery): Promise<Paginated<AlertConfig>> {
    const { data, total_records: totalRecords } =
      await this.alertConfigRepository.findMany({
        page: query.page,
        limit: query.limit,
        sensor_id: query.sensor_id,
        manager_user_id: query.manager_user_id,
      });

    return {
      data,
      meta: buildPaginationMeta(totalRecords, query.page, query.limit),
    };
  }
}
