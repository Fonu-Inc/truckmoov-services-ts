const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function pageOf(query: { page?: number; limit?: number }) {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_SIZE)));
  return { page, limit };
}
