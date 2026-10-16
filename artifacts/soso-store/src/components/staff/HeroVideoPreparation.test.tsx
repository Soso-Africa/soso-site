import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { preparationFixture } from "../../lib/heroPreparation.test";
import { HeroVideoPreparation } from "./HeroVideoPreparation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function setup(upload: (file: File) => Promise<string>) {
  const adopted: string[] = [];
  let view!: ReturnType<typeof create>;
  await act(async () => {
    view = create(<HeroVideoPreparation target="mobile" currentPath="/media/approved-mobile.mp4" onUploadMedia={upload} onAdopt={(path) => adopted.push(path)} />);
  });
  const fixture = preparationFixture();
  await act(async () => {
    const inputs = view.root.findAllByProps({ type: "file" });
    inputs[0]!.props.onChange({ target: { files: [fixture.source] } });
    inputs[1]!.props.onChange({ target: { files: [fixture.candidate] } });
    inputs[2]!.props.onChange({ target: { files: [fixture.reportFile] } });
  });
  // SHA-256 is asynchronous; wait for the local report comparison to finish.
  for (let i = 0; i < 30 && !view.root.findAllByType("video").length; i++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  assert.equal(view.root.findAllByType("video").length, 2);
  return { view, adopted, fixture };
}

async function approve(view: ReturnType<typeof create>) {
  await act(async () => {
    for (const video of view.root.findAllByType("video")) {
      assert.equal(video.props.autoPlay, undefined);
      assert.equal(video.props.poster, undefined);
      video.props.onLoadedMetadata({ currentTarget: { videoWidth: 320, videoHeight: 180, duration: 2 } });
      video.props.onPlaying();
    }
  });
  await act(async () => { view.root.findByProps({ type: "checkbox" }).props.onChange({ target: { checked: true } }); });
}

test("adoption requires both valid manual previews and an explicit quality approval; only the candidate uploads", async () => {
  const uploads: File[] = [];
  const { view, adopted, fixture } = await setup(async (file) => { uploads.push(file); return "/api/storage/objects/uploads/new.mp4"; });
  assert.equal(view.root.findByType("button").props.disabled, true);
  await act(async () => { await view.root.findByType("button").props.onClick(); });
  assert.equal(uploads.length, 0);
  await approve(view);
  assert.equal(view.root.findByType("button").props.disabled, false);
  await act(async () => { await view.root.findByType("button").props.onClick(); });
  assert.deepEqual(uploads, [fixture.candidate]);
  assert.deepEqual(adopted, ["/api/storage/objects/uploads/new.mp4"]);
  await act(async () => view.unmount());
});

test("changing a file or a failed preview clears approval; failed upload leaves the draft intact", async () => {
  const { view, adopted, fixture } = await setup(async () => { throw new Error("Upload rejected"); });
  await approve(view);
  await act(async () => { await view.root.findByType("button").props.onClick(); });
  assert.deepEqual(adopted, []);
  assert.match(view.root.findByProps({ role: "status" }).children.join(""), /Upload rejected/);
  await act(async () => view.root.findAllByType("video")[1]!.props.onError());
  assert.equal(view.root.findByProps({ type: "checkbox" }).props.checked, false);
  assert.equal(view.root.findByType("button").props.disabled, true);
  await act(async () => {
    view.root.findAllByProps({ type: "file" })[1]!.props.onChange({ target: { files: [new File([fixture.candidate], "different.mp4", { type: "video/mp4" })] } });
  });
  assert.equal(view.root.findAllByProps({ type: "checkbox" }).some((input) => input.props.checked), false);
  assert.equal(view.root.findAllByType("button").some((button) => !button.props.disabled), false);
  await act(async () => view.unmount());
});

test("a late completed upload cannot adopt after this slot is unmounted", async () => {
  let finish!: (path: string) => void;
  const { view, adopted } = await setup(() => new Promise((resolve) => { finish = resolve; }));
  await approve(view);
  await act(async () => view.root.findByType("button").props.onClick());
  await act(async () => view.unmount());
  await act(async () => { finish("/api/storage/objects/uploads/late.mp4"); });
  assert.deepEqual(adopted, []);
});
