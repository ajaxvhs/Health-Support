export const PAGE_SIZE = 10;

export type PageItem = number | "ellipsis";

export function getPagination(currentPage: number, itemCount: number, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const page = Math.max(1, Math.min(currentPage, pageCount));
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, itemCount);

  return { page, pageCount, start, end };
}

export function getPaginationItems(currentPage: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", pageCount];
  if (currentPage >= pageCount - 3) {
    return [1, "ellipsis", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }
  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", pageCount];
}
