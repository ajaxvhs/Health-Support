import { PAGE_SIZE } from "./pagination";

export const FETCH_BATCH_SIZE = 30;
export const PAGES_PER_BATCH = FETCH_BATCH_SIZE / PAGE_SIZE;

export function fetchBatchOffset(page: number) {
  return Math.floor((Math.max(page, 1) - 1) / PAGES_PER_BATCH) * FETCH_BATCH_SIZE;
}

export function pageOffsetWithinBatch(page: number) {
  return ((Math.max(page, 1) - 1) % PAGES_PER_BATCH) * PAGE_SIZE;
}
