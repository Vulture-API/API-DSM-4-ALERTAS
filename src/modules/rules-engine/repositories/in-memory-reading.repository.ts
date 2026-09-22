import type {
  CheckpointRepository,
  ReadingRepository,
} from "@/modules/rules-engine/repositories/reading.repository.js";
import type { Reading } from "@/modules/rules-engine/types/reading.type.js";

export class InMemoryReadingRepository implements ReadingRepository {
  public readonly readings: Reading[] = [];

  private nextId = 1;

  add(data: {
    sensor_id: number;
    value: number;
    unix_time?: number;
    data_consistent?: boolean;
  }): Reading {
    const reading: Reading = {
      id: this.nextId++,
      sensor_id: data.sensor_id,
      value: data.value,
      unix_time: data.unix_time ?? 1_767_225_600,
      data_consistent: data.data_consistent ?? true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    this.readings.push(reading);

    return reading;
  }

  async findUnprocessed(afterId: number, limit: number): Promise<Reading[]> {
    return this.readings
      .filter((reading) => reading.id > afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }
}

export class InMemoryCheckpointRepository implements CheckpointRepository {
  private lastReadingId = 0;

  async getLastProcessedReadingId(): Promise<number> {
    return this.lastReadingId;
  }

  async setLastProcessedReadingId(readingId: number): Promise<void> {
    this.lastReadingId = readingId;
  }
}
