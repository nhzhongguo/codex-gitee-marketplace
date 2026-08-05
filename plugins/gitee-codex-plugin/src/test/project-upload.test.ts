import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { previewUpload } from "../project-upload.js";

test("project upload preview skips .git and reports likely secret files", async () => {
  const source = await mkdtemp(join(tmpdir(), "gitee-preview-test-"));
  try {
    await writeFile(join(source, "README.md"), "hello");
    await writeFile(join(source, ".env"), "DATABASE_URL=not-a-real-secret");
    await mkdir(join(source, ".git"));
    await writeFile(join(source, ".git", "config"), "[core]");

    const preview = await previewUpload({
      sourcePath: source,
      owner: "example-owner",
      repository: "example-repo",
      branch: "main",
      commitMessage: "Initial project upload"
    });

    assert.equal(preview.fileCount, 2);
    assert.deepEqual(preview.sensitiveFiles, [".env"]);
    assert.match(preview.sourceFingerprint, /^[a-f0-9]{16}$/);
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});

test("project upload preview honors .gitignore before checking sensitive files", async () => {
  const source = await mkdtemp(join(tmpdir(), "gitee-preview-ignore-test-"));
  try {
    await writeFile(join(source, "README.md"), "hello");
    await writeFile(join(source, ".env"), "DATABASE_URL=not-a-real-secret");
    await writeFile(join(source, ".gitignore"), ".env\n");

    const preview = await previewUpload({
      sourcePath: source,
      owner: "example-owner",
      repository: "example-repo",
      branch: "main",
      commitMessage: "Initial project upload"
    });

    assert.equal(preview.fileCount, 2);
    assert.deepEqual(preview.sensitiveFiles, []);
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});
