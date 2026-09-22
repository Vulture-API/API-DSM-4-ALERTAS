import type { Reading } from "@/modules/rules-engine/types/reading.type.js";

export interface ReadingRepository {
  // Retorno obrigatoriamente ordenado por id crescente: o checkpoint do motor
  // assume que o último item do lote é o maior id processado.
  findUnprocessed(afterId: number, limit: number): Promise<Reading[]>;
}

export interface CheckpointRepository {
  getLastProcessedReadingId(): Promise<number>;
  setLastProcessedReadingId(readingId: number): Promise<void>;
}
