import React, { useEffect, useRef, useState } from "react";
import { previewMatchesEvidence } from "../../lib/heroPreparation";
import { verifyHeroWebm, type HeroWebmReport } from "../../lib/heroWebmPreparation";
import type { HeroWebmAlternative as Alternative } from "../../lib/heroMedia";

export function HeroWebmAlternative({ target, sourcePath, value, onUploadMedia, onChange }: {
  target: "desktop" | "mobile"; sourcePath: string; value?: Alternative;
  onUploadMedia: (file: File) => Promise<string>; onChange: (value?: Alternative) => void;
}) {
  const [files, setFiles] = useState<{ source?: File; webm?: File; report?: File }>({});
  const [review, setReview] = useState<{ report: HeroWebmReport; source: string; webm: string }>();
  const [played, setPlayed] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    setReview(undefined); setPlayed(false); setMetadata(false); setApproved(false);
    if (files.source && files.webm && files.report) {
      void verifyHeroWebm(files.source, files.webm, files.report).then((report) => {
        if (cancelled) return;
        urls = [URL.createObjectURL(files.source!), URL.createObjectURL(files.webm!)];
        setReview({ report, source: urls[0]!, webm: urls[1]! });
        setStatus("Hashes verified locally. Compare the complete clips before approving.");
      }).catch((error: Error) => { if (!cancelled) setStatus(error.message); });
    }
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [files]);
  const adopt = async () => {
    if (!review || !files.webm || !approved || !played || !metadata || busy) return;
    setBusy(true);
    try {
      const webmUrl = await onUploadMedia(files.webm);
      if (!mounted.current) return;
      if (!/^\/api\/storage\/objects\/.+\.webm$/i.test(webmUrl)) throw new Error("Expected a governed WebM upload.");
      onChange({
        sourceUrl: sourcePath, webmUrl, sourceSha256: review.report.before.sha256,
        webmSha256: review.report.after.sha256, sameFootageApproved: true,
      });
      setApproved(false);
      setStatus("Alternative added to draft. Save verifies the actual stored hashes and VP9 codec. Normal owner publication is still required.");
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : "Upload failed; original unchanged.");
    } finally { if (mounted.current) setBusy(false); }
  };
  return <section className="mt-4 border border-border p-4" data-testid={`hero-webm-${target}`}>
    <h4 className="font-semibold">Same-footage {target} WebM alternative</h4>
    {value && <div className="mt-2 break-all text-sm">Approved draft alternative: {value.webmUrl}
      <button type="button" className="ml-3 underline" disabled={busy} onClick={() => onChange(undefined)}>Remove alternative</button>
    </div>}
    <p className="mt-2 text-sm">Use the exact configured MP4. Download both tools into one folder and run locally with Node.js 20+ and FFmpeg 6+. This generates VP9 without cropping, trimming or replacing footage, and checks both files decode. No server encoding or automatic publication.</p>
    {["prepare-hero.mjs", "prepare-hero-webm.mjs"].map((name) => <a key={name} className="mr-4 mt-2 inline-block text-sm underline" href={`${import.meta.env?.BASE_URL ?? "/"}media-tools/${name}`} download={name}>{name}</a>)}
    <pre className="mt-2 overflow-x-auto text-xs">node prepare-hero-webm.mjs "/path/configured.mp4" "/path/new-{target}-webm"</pre>
    <fieldset disabled={busy} className="mt-3 space-y-3">
      {(["source", "webm", "report"] as const).map((kind) => <label key={kind} className="block text-sm">
        {target} {kind === "source" ? "configured original MP4" : kind === "webm" ? "hero-alternative.webm" : "hero-webm.json"}
        <input type="file" className="mt-1 block text-xs" accept={kind === "source" ? "video/mp4,.mp4" : kind === "webm" ? "video/webm,.webm" : ".json"} onChange={(event) => {
          setReview(undefined); setApproved(false); setPlayed(false); setMetadata(false); setStatus("");
          setFiles({ ...files, [kind]: event.target.files?.[0] });
        }} />
      </label>)}
    </fieldset>
    {review && <>
      <p className="mt-3 text-xs">Original {review.report.before.bytes.toLocaleString()} bytes · WebM {review.report.after.bytes.toLocaleString()} bytes. Only one supported file downloads per storefront viewport.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><p>Configured MP4 (local)</p><video src={review.source} controls muted playsInline preload="metadata" className="max-h-80 w-full bg-neutral-800 object-contain" onError={() => setStatus("MP4 preview unavailable here. Browser codec support is not a corruption verdict: the offline tool decoded both files. Compare the original in a compatible player before attesting.")} /></div>
        <div><p>VP9 alternative (local)</p><video src={review.webm} controls muted playsInline preload="metadata" className="max-h-80 w-full bg-neutral-800 object-contain"
          onLoadedMetadata={(event) => setMetadata(previewMatchesEvidence(event.currentTarget, review.report.after))}
          onPlaying={() => setPlayed(true)}
          onError={() => { setMetadata(false); setPlayed(false); setApproved(false); setStatus("VP9 playback failed. Approval stays blocked; check decoder support and the offline decode report separately."); }} /></div>
      </div>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" disabled={!played || !metadata || busy} checked={approved} onChange={(event) => setApproved(event.target.checked)} />
        I compared the complete original and alternative (using a compatible player if needed), confirm identical footage, framing, timing and genuine colours, and approve this {target} alternative.
      </label>
      <button type="button" className="mt-3 border border-border px-3 py-2 text-sm disabled:opacity-40" disabled={!approved || !played || !metadata || busy} onClick={() => void adopt()}>Upload approved WebM to draft</button>
    </>}
    <p role="status" className="mt-2 text-sm">{status}</p>
  </section>;
}
