import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const consumers = [
  {
    name: "@workspace/soso-store",
    packagePath: "artifacts/soso-store/package.json",
    artifactPath: "artifacts/soso-store/.replit-artifact/artifact.toml",
  },
  {
    name: "@workspace/api-server",
    packagePath: "artifacts/api-server/package.json",
    artifactPath: "artifacts/api-server/.replit-artifact/artifact.toml",
  },
];

const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
const preparationCommand = "pnpm -w run dev:prepare-shared";

assert.equal(
  rootPackage.scripts?.["dev:prepare-shared"],
  "tsc --build --force",
  'The root "dev:prepare-shared" script must force a shared declaration rebuild.',
);

for (const consumer of consumers) {
  const packageJson = JSON.parse(await readFile(consumer.packagePath, "utf8"));
  const artifactToml = await readFile(consumer.artifactPath, "utf8");
  const expectedWorkflowCommand = `pnpm --filter ${consumer.name} run dev`;
  const developmentRun = artifactToml.match(
    /\[services\.development\][\s\S]*?^run\s*=\s*"([^"]+)"/m,
  )?.[1];

  assert.equal(
    packageJson.name,
    consumer.name,
    `${consumer.packagePath} must retain the package name used by its managed workflow.`,
  );
  assert.equal(
    developmentRun,
    expectedWorkflowCommand,
    `${consumer.artifactPath} must start through "${expectedWorkflowCommand}" so pnpm runs the predev lifecycle.`,
  );
  assert.equal(
    packageJson.scripts?.predev,
    preparationCommand,
    `${consumer.packagePath} must run "${preparationCommand}" before dev.`,
  );
  assert.ok(
    packageJson.scripts?.dev,
    `${consumer.packagePath} must define the dev script used by its managed workflow.`,
  );
}

console.log(
  "Verified storefront and API managed development startup rebuild shared declarations.",
);