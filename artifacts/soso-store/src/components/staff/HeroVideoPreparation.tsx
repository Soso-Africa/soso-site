import React, { useEffect, useRef, useState } from "react";
import {
  previewMatchesEvidence, verifyPreparedHero, type HeroPreparationReport,
} from "../../lib/heroPreparation";

type Review = {
  report: HeroPreparationReport;
  sourceUrl: string;
  candidateUrl: string;
};

/** All preparation and comparison reads stay local. Only explicit adoption uploads. */
export function HeroVideoPreparation({ target, currentPath, onUploadMedia, onAdopt }: {
  target: "desktop" | "mobile";
  currentPath: string;
  onUploadMedia: (file: File) => Promise<string>;
  onAdopt: (path: string) => void;
}) {
  const [source, setSource] = useState<File>();
  const [candidate, setCandidate] = useState<File>();
  const [reportFile, setReportFile] = useState<File>();
  const [review, setReview] = useState<Review>();
  const [verified, setVerified] = useState({ source: false, candidate: false });
  const [played, setPlayed] = useState({ source: false, candidate: false });
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const selectFile = (setFile: (file: File | undefined) => void, file: File | undefined) => {
    // Invalidate approval in the selection event itself, not only in a later effect.
    setApproved(false);
    setReview(undefined);
    setFile(file);
  };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sourceUrl: string | undefined;
    let candidateUrl: string | undefined;
    setReview(undefined);
    setVerified({ source: false, candidate: false });
    setPlayed({ source: false, candidate: false });
    setApproved(false);
    setStatus("");
    if (source && candidate && reportFile) {
      setStatus("Verifying local file hashes and preparation evidence…");
      void verifyPreparedHero(source, candidate, reportFile).then((report) => {
        if (cancelled) return;
        sourceUrl = URL.createObjectURL(source);
        candidateUrl = URL.createObjectURL(candidate);
        setReview({ report, sourceUrl, candidateUrl });
        setStatus("Files match the offline report. Play both previews and check the entire clip before approving.");
      }).catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Local files could not be verified.");
      });
    }
    return () => {
      cancelled = true;
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
    };
  }, [source, candidate, reportFile]);

  const canApprove = Boolean(review && verified.source && verified.candidate && played.source && played.candidate);
  const adopt = async () => {
    if (!canApprove || !approved || !candidate || busy) return;
    setBusy(true);
    setStatus("Uploading only the approved smaller file; existing hero files remain untouched…");
    try {
      const path = await onUploadMedia(candidate);
      if (!mounted.current) return;
      if (!/^\/api\/storage\/objects\/.+\.mp4$/i.test(path)) throw new Error("Upload did not return a governed MP4 path.");
      onAdopt(path);
      setApproved(false);
      setStatus("Replacement added to this draft only. Save, review and publish normally. Keep the original.");
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : "Upload failed; the hero has not changed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return <section className="mt-4 border border-border p-4" data-testid={`hero-preparation-${target}`}>
    <h4 className="text-sm font-semibold">Prepare a smaller {target} hero</h4>
    <p className="mt-2 break-all text-xs text-muted-foreground">Current draft path: {currentPath || "Not selected"}</p>
    <p className="mt-2 text-sm text-muted-foreground">
      Use the actual source for this {target} slot, not different footage. Run the downloaded tool on your own computer with Node.js 20+ and FFmpeg 6+.
      No Cloudinary transformations or server encoding. It preserves dimensions, frame count and colour metadata; it never crops, trims or substitutes artwork.
      HDR, rotated and incompatible colour sources are refused rather than silently converted.
    </p>
    <a className="mt-2 inline-block text-sm underline" href={`${import.meta.env?.BASE_URL ?? "/"}media-tools/prepare-hero.mjs`} download="prepare-hero.mjs">Download offline preparation tool</a>
    <pre className="mt-2 overflow-x-auto bg-muted p-3 text-xs">node prepare-hero.mjs "/path/source.mp4" "/path/new-{target}-folder" 24</pre>
    <p className="mt-2 text-xs text-muted-foreground">
      Run separately for desktop and mobile. The output folder must be new. Lower CRF (18–23) improves quality; higher CRF (25–28) reduces size.
      Retain your original. Select that original, hero-prepared.mp4 and hero-preparation.json below.
      Local source comparison is limited to 256 MiB; prepared uploads must be smaller and at most 8 MiB.
      The report verifies file identity, not visual quality or approval.
    </p>
    <fieldset disabled={busy} className="mt-3 space-y-3">
      <label className="block text-sm">Actual original {target} source
        <input aria-label={`Original ${target} video`} className="mt-1 block w-full text-xs" type="file" accept="video/*,.mov" onChange={(event) => selectFile(setSource, event.target.files?.[0])} />
      </label>
      <label className="block text-sm">Smaller prepared MP4
        <input aria-label={`Prepared ${target} video`} className="mt-1 block w-full text-xs" type="file" accept="video/mp4,.mp4" onChange={(event) => selectFile(setCandidate, event.target.files?.[0])} />
      </label>
      <label className="block text-sm">Offline preparation report
        <input aria-label={`${target} preparation report`} className="mt-1 block w-full text-xs" type="file" accept="application/json,.json" onChange={(event) => selectFile(setReportFile, event.target.files?.[0])} />
      </label>
    </fieldset>
    {review && <>
      <p className="mt-3 text-sm" data-testid="hero-byte-comparison">
        Before: {review.report.before.bytes.toLocaleString()} bytes · After: {review.report.after.bytes.toLocaleString()} bytes ·
        Saved: {(review.report.before.bytes - review.report.after.bytes).toLocaleString()} bytes
        {" "}({(100 * (1 - review.report.after.bytes / review.report.before.bytes)).toFixed(1)}%).
        {" "}{review.report.after.width} × {review.report.after.height}; {review.report.after.duration.toFixed(2)} seconds.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(["source", "candidate"] as const).map((kind) => <div key={kind}>
          <p className="mb-1 text-sm font-semibold">{kind === "source" ? "Original source" : "Smaller candidate"}</p>
          <video
            key={`${kind}:${kind === "source" ? review.sourceUrl : review.candidateUrl}`}
            aria-label={`${target} ${kind} quality preview`}
            src={kind === "source" ? review.sourceUrl : review.candidateUrl}
            controls playsInline preload="metadata"
            className="max-h-80 w-full bg-neutral-800 object-contain"
            onLoadedMetadata={(event) => {
              const valid = previewMatchesEvidence(event.currentTarget, kind === "source" ? review.report.before : review.report.after);
              setVerified((value) => ({ ...value, [kind]: valid }));
              if (!valid) {
                setApproved(false);
                setStatus("Preview dimensions or duration do not match the report. Do not adopt this file.");
              }
            }}
            onPlaying={() => setPlayed((value) => ({ ...value, [kind]: true }))}
            onError={() => {
              setVerified((value) => ({ ...value, [kind]: false }));
              setApproved(false);
              setStatus("This browser cannot preview the selected file. Use a compatible browser/source; adoption stays blocked.");
            }}
          />
        </div>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Previews are local, manual-play and uncropped, with no unrelated poster. Inspect the full clip, fabric detail, genuine colours and composition at the intended {target} size. Nothing plays automatically, including with reduced motion or data saving.</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" disabled={!canApprove || busy} checked={approved} onChange={(event) => setApproved(event.target.checked)} />
        I compared both full clips, confirm this is the same approved {target} footage, and approve its detail, colours and composition.
      </label>
      <button type="button" className="mt-3 border border-border px-3 py-2 text-sm disabled:opacity-40" disabled={!canApprove || !approved || busy} onClick={() => void adopt()}>
        {busy ? "Uploading…" : `Upload approved replacement to ${target} draft`}
      </button>
    </>}
    <p className="mt-3 text-sm" role="status">{status}</p>
    <p className="mt-2 text-xs text-muted-foreground">Upload finalization and normal Staff publication still enforce stored bytes, MIME, extension and size checks. This does not save or publish automatically, delete existing files or change shopper playback/preferences.</p>
  </section>;
}
