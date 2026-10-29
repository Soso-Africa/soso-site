import React from "react";
import type { UpdateMode, UpdateReview } from "./update-model";

export function UpdateReviewSummary({ review, mode }: { review: UpdateReview; mode: UpdateMode }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider" data-testid="update-review-summary">
        <span className="border border-primary/40 bg-accent px-2 py-1">{review.changes.length} proposed</span>
        <span className="border border-border px-2 py-1">{review.unchanged} unchanged</span>
        <span className="border border-border px-2 py-1">{review.skipped.length} supplied edits skipped</span>
        <span className="border border-border px-2 py-1">{review.blankCells} blank cells kept</span>
        {review.errors.length > 0 && <span className="border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">{review.errors.length} blocking</span>}
      </div>
      {review.blankVariantPrices > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="update-blank-size-prices">
          {review.blankVariantPrices} blank size-price {review.blankVariantPrices === 1 ? "cell was" : "cells were"} left unchanged.
          {" "}These are not failed updates. No price was cleared, set to zero or copied from the base price.
        </p>
      )}
      {review.changes.length === 0 && review.errors.length === 0 && (
        <p className="border border-border bg-muted/30 px-3 py-4 text-xs" data-testid="update-review-empty">
          {mode === "fill" && review.skipped.length > 0
            ? "No changes are proposed. Some supplied edits target fields that already have saved values. Review the skipped edits below; choose Replace supplied fields only for intentional corrections."
            : "No new or edited values to apply. Blank cells and unchanged downloaded values keep saved data unchanged. Enter the values you want to update in the spreadsheet, upload it again and rebuild the review. Selecting download columns alone does not change product data."}
        </p>
      )}
    </>
  );
}
