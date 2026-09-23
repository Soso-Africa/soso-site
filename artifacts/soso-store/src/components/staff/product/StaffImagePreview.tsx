import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

export function StaffImagePreview({
  src,
  alt,
  label = "Staff preview",
  testId,
}: {
  src?: string;
  alt?: string;
  label?: string;
  testId?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src) {
    return (
      <div className="flex min-h-40 items-center justify-center border border-dashed border-border bg-muted/20 p-4 text-center" data-testid={testId}>
        <div className="space-y-2 text-muted-foreground">
          <ImageOff className="mx-auto h-6 w-6" />
          <p className="text-[10px] font-semibold uppercase tracking-wider">No image uploaded yet</p>
        </div>
      </div>
    );
  }

  return (
    <figure className="overflow-hidden border border-border bg-muted/20" data-testid={testId}>
      <div className="flex min-h-48 items-center justify-center bg-[linear-gradient(45deg,#f2f2f2_25%,transparent_25%),linear-gradient(-45deg,#f2f2f2_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f2f2f2_75%),linear-gradient(-45deg,transparent_75%,#f2f2f2_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]">
        {failed ? (
          <div role="alert" className="space-y-2 p-4 text-center text-destructive">
            <ImageOff className="mx-auto h-6 w-6" />
            <p className="text-xs font-semibold">This image could not be previewed.</p>
            <p className="text-[10px]">Check the uploaded file or source path before approval.</p>
          </div>
        ) : (
          <img
            src={src}
            alt={alt || "Uploaded product image preview"}
            className="max-h-80 w-full object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 border-t border-border bg-background px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{label}</span>
        <span className="truncate text-[10px] text-muted-foreground">{alt || "Add alt text before publishing"}</span>
      </figcaption>
    </figure>
  );
}