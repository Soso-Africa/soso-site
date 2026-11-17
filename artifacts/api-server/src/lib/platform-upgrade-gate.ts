export type PlatformUpgradeState = {
  draftVersion: string | null;
  publishedVersion: string | null;
  publishedEmpty: boolean;
  hasLegacyFaqItems: boolean;
} | undefined;

/**
 * Validated writers stamp contentVersion. Compatibility work needs full
 * documents only for old/unknown versions or a pending embedded FAQ migration.
 * This is not a content/stock/checkout approval: those readers remain live.
 */
export function needsPlatformUpgrade(state: PlatformUpgradeState, currentVersion: number): boolean {
  return !state
    || state.draftVersion !== String(currentVersion)
    || (!state.publishedEmpty && state.publishedVersion !== String(currentVersion))
    || state.hasLegacyFaqItems;
}
