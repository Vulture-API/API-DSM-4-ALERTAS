import type { Pool } from "pg";

import type {
  CheckpointRepository,
  ReadingRepository,
} from "@/modules/rules-engine/repositories/reading.repository.js";
import type { Reading } from "@/modules/rules-engine/types/reading.type.js";

const CHECKPOINT_KEY = "rules_engine_last_reading_id";

export class PgReadingRepository implements ReadingRepository {
  constructor(private readonly database: Pool) {}

  async findUnprocessed(afterId: number, limit: number): Promise<Reading[]> {
    const result = await this.database.query<Reading>(
      `
        SELECT
          id,
          sensor_id,
          value::float8 AS value,
          unix_time::bigint AS unix_time,
          data_consistent,
          created_at
        FROM readings
        WHERE id > $1
        ORDER BY id ASC
        LIMIT $2
      `,
      [afterId, limit],
    );

    return result.rows;
  }
}

export class PgCheckpointRepository implements CheckpointRepository {
  constructor(private readonly database: Pool) {}

  async getLastProcessedReadingId(): Promise<number> {
    const result = await this.database.query<{ value: string }>(
      `SELECT value FROM processing_checkpoints WHERE key = $1`,
      [CHECKPOINT_KEY],
    );

    return Number(result.rows[0]?.value ?? 0);
  }

  async setLastProcessedReadingId(readingId: number): Promise<void> {
    await this.database.query(
      `
        INSERT INTO processing_checkpoints (key, value, updated_at)
        VALUES ($1, $2, current_timestamp)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = current_timestamp
      `,
      [CHECKPOINT_KEY, String(readingId)],
    );
  }
}
