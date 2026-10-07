import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import binary from "@sparticuz/chromium";

const publicDir = new URL("../public/", import.meta.url);
const logo = await readFile(new URL("images/soso/logo.png", publicDir));
const browser = await chromium.launch({
  executablePath: await binary.executablePath(),
  args: binary.args.filter((arg) => arg !== "--single-process"),
  headless: true,
});
try {
  const page = await browser.newPage();
  for (const size of [192, 512]) {
    const png = await page.evaluate(async ({ source, size }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const original = document.createElement("canvas");
      original.width = image.width;
      original.height = image.height;
      const context = original.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let radius = 0;
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          if (pixels[(y * image.width + x) * 4 + 3] === 0) continue;
          radius = Math.max(radius, Math.hypot(x + 0.5 - image.width / 2, y + 0.5 - image.height / 2));
        }
      }
      // Keep all original artwork inside the maskable 40%-radius safe circle.
      const scale = size * 0.375 / radius;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const output = canvas.getContext("2d");
      output.fillStyle = "#ffffff";
      output.fillRect(0, 0, size, size);
      output.imageSmoothingEnabled = true;
      output.imageSmoothingQuality = "high";
      output.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2,
        image.width * scale, image.height * scale);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { source: `data:image/png;base64,${logo.toString("base64")}`, size });
    const bytes = Buffer.from(png, "base64");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    // Retain gold compatibility files for older manifest references as well.
    for (const name of [`pwa-icon-gold-${size}.png`, `pwa-icon-${size}.png`]) {
      await writeFile(new URL(name, publicDir), bytes);
    }
    console.log(`Generated ${size}px gold SOSO icon from the existing brand logo.`);
  }
} finally {
  await browser.close();
}
