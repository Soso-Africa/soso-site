import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { HeroWebmAlternative } from "./HeroWebmAlternative";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
test("WebM adoption requires verified local evidence, real preview events and explicit approval; changing files revokes it", async () => {
  let renderer: ReactTestRenderer | undefined;
  const source = new File(["mp4"], "original.mp4", { type: "video/mp4" });
  const webm = new File(["webm"], "hero-alternative.webm", { type: "video/webm" });
  const evidence = async (file: File) => ({
    bytes: file.size, sha256: createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"),
    width: 320, height: 240, frames: 30, frameRate: "30/1", duration: 1,
    colour: ["unknown", "unknown", "unknown", "unknown"], audioStreams: 0,
  });
  const report = new File([JSON.stringify({
    version: 1, tool: "soso-offline-webm", codec: "vp9", before: await evidence(source), after: await evidence(webm),
  })], "hero-webm.json");
  let uploads = 0;
  const adopted: unknown[] = [];
  try {
    await act(async () => {
      renderer = create(<HeroWebmAlternative target="desktop" sourcePath="/api/storage/objects/uploads/original.mp4"
        onUploadMedia={async () => { uploads++; return "/api/storage/objects/uploads/alternate.webm"; }}
        onChange={(value) => adopted.push(value)} />);
    });
    const root = renderer!.root;
    const inputs = root.findAllByType("input");
    for (const [index, file] of [source, webm, report].entries()) {
      await act(async () => inputs[index]!.props.onChange({ target: { files: [file] } }));
    }
    // WebCrypto completes outside the React update; wait for its real result.
    for (let i = 0; root.findAllByType("video").length < 2 && i < 20; i++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    assert.equal(root.findAllByType("video").length, 2);
    const button = () => root.findAllByType("button").find((node) => node.children.includes("Upload approved WebM to draft"))!;
    const checkbox = () => root.findAllByType("input").find((node) => node.props.type === "checkbox")!;
    assert.equal(button().props.disabled, true);
    const preview = root.findAllByType("video")[1]!;
    await act(async () => {
      preview.props.onLoadedMetadata({ currentTarget: { videoWidth: 320, videoHeight: 240, duration: 1 } });
      preview.props.onPlaying();
    });
    assert.equal(checkbox().props.disabled, false);
    assert.equal(button().props.disabled, true, "Playing alone is not owner approval");
    await act(async () => checkbox().props.onChange({ target: { checked: true } }));
    await act(async () => button().props.onClick());
    assert.equal(uploads, 1);
    assert.equal(adopted.length, 1);
    assert.equal((adopted[0] as { sourceUrl: string }).sourceUrl, "/api/storage/objects/uploads/original.mp4");
    await act(async () => checkbox().props.onChange({ target: { checked: true } }));
    await act(async () => preview.props.onError());
    assert.equal(button().props.disabled, true);
    await act(async () => inputs[0]!.props.onChange({ target: { files: [] } }));
    assert.equal(root.findAllByType("video").length, 0, "Changing local files destroys previous approval/evidence");
    assert.equal(uploads, 1);
  } finally { if (renderer) await act(async () => renderer!.unmount()); }
});
