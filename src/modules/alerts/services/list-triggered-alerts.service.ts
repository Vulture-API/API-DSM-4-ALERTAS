import type { TriggeredAlertRepository } from "@/modules/alerts/repositories/alert.repository.js";
import type { ListTriggeredAlertsQuery } from "@/modules/alerts/schemas/alert.schema.js";
import type { TriggeredAlert } from "@/modules/alerts/types/alert.type.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

export class ListTriggeredAlertsService {
  constructor(
    private readonly triggeredAlertRepository: TriggeredAlertRepository,
  ) {}

  async execute(
    query: ListTriggeredAlertsQuery,
  ): Promise<Paginated<TriggeredAlert>> {
    const { data, total_records: totalRecords } =
      await this.triggeredAlertRepository.findMany({
        page: query.page,
        limit: query.limit,
        acknowledged: query.acknowledged,
      });

    return {
      data,
      meta: buildPaginationMeta(totalRecords, query.page, query.limit),
    };
  }
}
