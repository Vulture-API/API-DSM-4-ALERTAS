export type PaginationMeta = {
  total_records: number;
  total_pages: number;
  current_page: number;
};

export type Paginated<T> = {
  data: T[];
  meta: PaginationMeta;
};

export function buildPaginationMeta(
  totalRecords: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    total_records: totalRecords,
    total_pages: limit > 0 ? Math.ceil(totalRecords / limit) : 0,
    current_page: page,
  };
}
