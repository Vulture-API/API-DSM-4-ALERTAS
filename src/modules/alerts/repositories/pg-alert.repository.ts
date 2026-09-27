import type { Pool } from "pg";

import type {
  AlertConfigRepository,
  TriggeredAlertRepository,
} from "@/modules/alerts/repositories/alert.repository.js";
import type {
  AlertConfig,
  CreateAlertConfigData,
  ListAlertConfigsFilters,
  ListTriggeredAlertsFilters,
  PaginatedResult,
  TriggeredAlert,
  UpdateAlertConfigData,
} from "@/modules/alerts/types/alert.type.js";

const CONFIG_COLUMNS = `
  id,
  manager_user_id,
  sensor_id,
  reference_value::float8 AS reference_value,
  comparison_operator,
  message,
  active,
  created_at
`;

// reading_value / reading_unix_time: o valor lido que disparou o alerta, para
// a tela não precisar de outra chamada. Subconsulta (e não JOIN) porque a
// mesma lista de colunas serve ao INSERT/UPDATE ... RETURNING.
const TRIGGERED_COLUMNS = `
  id,
  alert_config_id,
  reading_id,
  acknowledged_by,
  triggered_at,
  acknowledged_at,
  (SELECT r.value::float8 FROM readings r WHERE r.id = triggered_alerts.reading_id) AS reading_value,
  (SELECT r.unix_time::float8 FROM readings r WHERE r.id = triggered_alerts.reading_id) AS reading_unix_time
`;

type WithTotal<T> = T & { total_records: string };

/**
 * Página + total a partir de um CTE `filtered`. O total vem de uma subconsulta
 * própria e a página entra por LEFT JOIN: numa página além da última ainda sai
 * uma linha (com o registro nulo) carregando o total real. Com COUNT(*) OVER()
 * direto na página, uma página vazia não tinha de onde ler o total e ele virava 0.
 */
function pageWithTotal(orderAndLimit: string): string {
  return `
    SELECT page.*, total.total_records
    FROM (SELECT COUNT(*) AS total_records FROM filtered) AS total
    LEFT JOIN LATERAL (SELECT * FROM filtered ${orderAndLimit}) AS page ON true
  `;
}

function stripTotal<T extends object>(rows: WithTotal<T>[]): T[] {
  return rows
    .filter((row) => (row as { id?: unknown }).id != null)
    .map(({ total_records: _ignored, ...row }) => row as unknown as T);
}

export class PgAlertConfigRepository implements AlertConfigRepository {
  constructor(private readonly database: Pool) {}

  async create(data: CreateAlertConfigData): Promise<AlertConfig> {
    const result = await this.database.query<AlertConfig>(
      `
        INSERT INTO alert_configs
          (manager_user_id, sensor_id, reference_value, comparison_operator, message, active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ${CONFIG_COLUMNS}
      `,
      [
        data.manager_user_id,
        data.sensor_id,
        data.reference_value,
        data.comparison_operator,
        data.message,
        data.active,
      ],
    );

    return result.rows[0]!;
  }

  async findMany(
    filters: ListAlertConfigsFilters,
  ): Promise<PaginatedResult<AlertConfig>> {
    const offset = (filters.page - 1) * filters.limit;

    const result = await this.database.query<WithTotal<AlertConfig>>(
      `
        WITH filtered AS (
          SELECT ${CONFIG_COLUMNS}
          FROM alert_configs
          WHERE ($1::int IS NULL OR sensor_id = $1::int)
            AND ($2::int IS NULL OR manager_user_id = $2::int)
        )
        ${pageWithTotal("ORDER BY id ASC LIMIT $3 OFFSET $4")}
      `,
      [
        filters.sensor_id ?? null,
        filters.manager_user_id ?? null,
        filters.limit,
        offset,
      ],
    );

    return {
      data: stripTotal(result.rows),
      total_records: Number(result.rows[0]?.total_records ?? 0),
    };
  }

  async findById(id: number): Promise<AlertConfig | null> {
    const result = await this.database.query<AlertConfig>(
      `SELECT ${CONFIG_COLUMNS} FROM alert_configs WHERE id = $1`,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async findActiveBySensorId(sensorId: number): Promise<AlertConfig[]> {
    const result = await this.database.query<AlertConfig>(
      `SELECT ${CONFIG_COLUMNS} FROM alert_configs WHERE sensor_id = $1 AND active = true`,
      [sensorId],
    );

    return result.rows;
  }

  async update(
    id: number,
    data: UpdateAlertConfigData,
  ): Promise<AlertConfig | null> {
    const result = await this.database.query<AlertConfig>(
      `
        UPDATE alert_configs
        SET manager_user_id = $2,
            sensor_id = $3,
            reference_value = $4,
            comparison_operator = $5,
            message = $6,
            active = $7
        WHERE id = $1
        RETURNING ${CONFIG_COLUMNS}
      `,
      [
        id,
        data.manager_user_id,
        data.sensor_id,
        data.reference_value,
        data.comparison_operator,
        data.message,
        data.active,
      ],
    );

    return result.rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.database.query(
      `DELETE FROM alert_configs WHERE id = $1`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async sensorExists(sensorId: number): Promise<boolean> {
    const result = await this.database.query(
      `SELECT 1 FROM sensors WHERE id = $1`,
      [sensorId],
    );

    return (result.rowCount ?? 0) > 0;
  }
}

export class PgTriggeredAlertRepository implements TriggeredAlertRepository {
  constructor(private readonly database: Pool) {}

  async create(data: {
    alert_config_id: number;
    reading_id: number;
  }): Promise<TriggeredAlert | null> {
    // ON CONFLICT sem alvo cobre os dois índices únicos: (leitura, regra) e
    // "um pendente por regra". É o que fecha a corrida entre instâncias do
    // motor: a checagem hasPendingForConfig sozinha não é atômica.
    const result = await this.database.query<TriggeredAlert>(
      `
        INSERT INTO triggered_alerts (alert_config_id, reading_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING ${TRIGGERED_COLUMNS}
      `,
      [data.alert_config_id, data.reading_id],
    );

    return result.rows[0] ?? null;
  }

  async findMany(
    filters: ListTriggeredAlertsFilters,
  ): Promise<PaginatedResult<TriggeredAlert>> {
    const offset = (filters.page - 1) * filters.limit;

    const result = await this.database.query<WithTotal<TriggeredAlert>>(
      `
        WITH filtered AS (
          SELECT ${TRIGGERED_COLUMNS}
          FROM triggered_alerts
          WHERE (
            $1::boolean IS NULL
            OR ($1::boolean = true AND acknowledged_at IS NOT NULL)
            OR ($1::boolean = false AND acknowledged_at IS NULL)
          )
        )
        ${pageWithTotal("ORDER BY triggered_at DESC, id DESC LIMIT $2 OFFSET $3")}
      `,
      [filters.acknowledged ?? null, filters.limit, offset],
    );

    return {
      data: stripTotal(result.rows),
      total_records: Number(result.rows[0]?.total_records ?? 0),
    };
  }

  async findById(id: number): Promise<TriggeredAlert | null> {
    const result = await this.database.query<TriggeredAlert>(
      `SELECT ${TRIGGERED_COLUMNS} FROM triggered_alerts WHERE id = $1`,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async acknowledge(
    id: number,
    userId: number,
  ): Promise<TriggeredAlert | null> {
    const result = await this.database.query<TriggeredAlert>(
      `
        UPDATE triggered_alerts
        SET acknowledged_by = $2, acknowledged_at = current_timestamp
        WHERE id = $1 AND acknowledged_at IS NULL
        RETURNING ${TRIGGERED_COLUMNS}
      `,
      [id, userId],
    );

    return result.rows[0] ?? null;
  }

  async hasPendingForConfig(alertConfigId: number): Promise<boolean> {
    const result = await this.database.query(
      `SELECT 1 FROM triggered_alerts
       WHERE alert_config_id = $1 AND acknowledged_at IS NULL
       LIMIT 1`,
      [alertConfigId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async existsForReadingAndConfig(
    readingId: number,
    alertConfigId: number,
  ): Promise<boolean> {
    const result = await this.database.query(
      `SELECT 1 FROM triggered_alerts WHERE reading_id = $1 AND alert_config_id = $2`,
      [readingId, alertConfigId],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
