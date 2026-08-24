export type PageViewRecord = {
  generation: number;
  pathname: string;
};

export function nextMeasurementGrantGeneration(
  generation: number,
  previouslyAllowed: boolean,
  nowAllowed: boolean,
): number {
  return !previouslyAllowed && nowAllowed ? generation + 1 : generation;
}

export function shouldRecordPageViewForGrant(
  recorded: PageViewRecord | null,
  generation: number,
  pathname: string,
): boolean {
  return recorded?.generation !== generation || recorded.pathname !== pathname;
}

export function pageViewRecordAfterSend(
  recorded: PageViewRecord | null,
  generation: number,
  pathname: string,
  sendSucceeded: boolean,
): PageViewRecord | null {
  return sendSucceeded ? { generation, pathname } : recorded;
}