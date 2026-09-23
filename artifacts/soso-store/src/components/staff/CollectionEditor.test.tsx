import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { PlatformCollection } from "../../data/platformContent";
import { CollectionEditor } from "./CollectionEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseCollection: PlatformCollection = {
  slug: "tailored-occasionwear",
  label: "Tailored occasionwear",
  category: "Occasionwear",
  department: "women",
  h1: "Tailored occasionwear",
  intro: "Made for significant days.",
  showCover: false,
  seo: {
    title: "Tailored occasionwear | SOSO Africa",
    description: "Explore tailored occasionwear.",
  },
};

const existingCover = {
  src: "/objects/collections/old-cover.webp",
  alt: "Model wearing a blue tailored suit",
  provenance: {
    source: "SOSO campaign shoot",
    rights: "Owned by SOSO Africa",
    credit: "Studio One",
    sourceUrl: "https://example.com/source",
  },
};

function fileInputs(root: ReactTestInstance) {
  return root.findAll((node) => node.type === "input" && node.props.type === "file");
}

function buttonText(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : buttonText(child)).join("");
}

async function renderEditor(
  collections: PlatformCollection[],
  onChange: (next: PlatformCollection[]) => void,
  onUploadMedia: (file: File) => Promise<string>,
) {
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CollectionEditor
        collections={collections}
        onChange={onChange}
        onUploadMedia={onUploadMedia}
      />,
    );
  });
  return renderer!;
}

async function selectFile(input: ReactTestInstance, file: File) {
  await act(async () => {
    input.props.onChange({
      target: { files: [file] },
      currentTarget: { value: file.name },
    });
  });
}

describe("CollectionEditor cover controls", () => {
  test("uploads a cover and includes the returned managed-media path in the collection update", async () => {
    const firstCollection = { ...baseCollection, slug: "first", label: "First" };
    const targetCollection = { ...baseCollection, slug: "target", label: "Target" };
    const file = new File(["cover"], "cover.webp", { type: "image/webp" });
    const changes: PlatformCollection[][] = [];
    const renderer = await renderEditor(
      [firstCollection, targetCollection],
      (next) => changes.push(next),
      async (uploadedFile) => {
        assert.equal(uploadedFile, file);
        return "/objects/collections/uploaded-cover.webp";
      },
    );

    await selectFile(fileInputs(renderer.root)[1]!, file);

    assert.equal(changes.length, 1);
    assert.equal(changes[0]![0], firstCollection);
    assert.equal(changes[0]![1]?.cover?.src, "/objects/collections/uploaded-cover.webp");
    assert.deepEqual(changes[0]![1]?.cover?.provenance, { source: "", rights: "" });
  });

  test("replace preserves authored alt text and provenance while changing only the image path", async () => {
    const collection = { ...baseCollection, showCover: true, cover: existingCover };
    const changes: PlatformCollection[][] = [];
    const renderer = await renderEditor(
      [collection],
      (next) => changes.push(next),
      async () => "/objects/collections/replacement.png",
    );

    await selectFile(
      fileInputs(renderer.root)[0]!,
      new File(["replacement"], "replacement.png", { type: "image/png" }),
    );

    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0]![0]?.cover, {
      ...existingCover,
      src: "/objects/collections/replacement.png",
    });
  });

  test("remove disables the cover and clears its metadata", async () => {
    const collection = { ...baseCollection, showCover: true, cover: existingCover };
    const changes: PlatformCollection[][] = [];
    const renderer = await renderEditor(
      [collection],
      (next) => changes.push(next),
      async () => {
        throw new Error("Upload should not be called.");
      },
    );
    const remove = renderer.root
      .findAllByType("button")
      .find((button) => buttonText(button).trim() === "Remove");
    assert.ok(remove);

    await act(async () => {
      remove.props.onClick();
    });

    assert.equal(changes.length, 1);
    assert.equal(changes[0]![0]?.showCover, false);
    assert.equal(changes[0]![0]?.cover, undefined);
  });

  test("upload failures leave the existing cover unchanged and expose the error", async () => {
    const collection = { ...baseCollection, showCover: true, cover: existingCover };
    const failure = new Error("The image upload was rejected.");
    const changes: PlatformCollection[][] = [];
    const alerts: string[] = [];
    const previousAlert = globalThis.alert;
    globalThis.alert = (message) => {
      alerts.push(String(message));
    };
    try {
      const renderer = await renderEditor(
        [collection],
        (next) => changes.push(next),
        async () => {
          throw failure;
        },
      );

      await selectFile(
        fileInputs(renderer.root)[0]!,
        new File(["bad image"], "bad.webp", { type: "image/webp" }),
      );
    } finally {
      globalThis.alert = previousAlert;
    }

    assert.deepEqual(changes, []);
    assert.deepEqual(alerts, ["The image upload was rejected."]);
    assert.deepEqual(collection.cover, existingCover);
  });
});