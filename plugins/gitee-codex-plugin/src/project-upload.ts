import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ALWAYS_EXCLUDED_DIRECTORIES = new Set([".git"]);
const SENSITIVE_FILE_NAMES = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|p12|pfx|key))$/i;

export type UploadPlan = {
  sourcePath: string;
  owner: string;
  repository: string;
  branch: string;
  commitMessage: string;
  fileCount: number;
  totalBytes: number;
  sensitiveFiles: string[];
  sourceFingerprint: string;
};

export async function previewUpload(input: {
  sourcePath: string;
  owner: string;
  repository: string;
  branch: string;
  commitMessage: string;
}): Promise<UploadPlan> {
  const sourcePath = resolve(input.sourcePath);
  const sourceStats = await stat(sourcePath).catch(() => undefined);
  if (!sourceStats?.isDirectory()) {
    throw new Error(`source_path must be an existing directory: ${sourcePath}`);
  }

  const files: ScannedFile[] = [];
  await scanDirectory(sourcePath, sourcePath, files);
  const stagedFiles = await findStagedFiles(sourcePath);
  const stagedFileSet = new Set(stagedFiles);
  const filesToUpload = files.filter((file) => stagedFileSet.has(file.relativePath));
  if (filesToUpload.length === 0) {
    throw new Error("No files remain after applying .gitignore. Nothing would be uploaded.");
  }
  const sourceFingerprint = createHash("sha256")
    .update(filesToUpload.map((file) => `${file.relativePath}:${file.size}:${file.modifiedAt}`).join("\n"))
    .digest("hex")
    .slice(0, 16);

  return {
    sourcePath,
    owner: input.owner,
    repository: input.repository,
    branch: input.branch,
    commitMessage: input.commitMessage,
    fileCount: filesToUpload.length,
    totalBytes: filesToUpload.reduce((total, file) => total + file.size, 0),
    sensitiveFiles: filesToUpload.filter((file) => SENSITIVE_FILE_NAMES.test(basename(file.relativePath))).map((file) => file.relativePath),
    sourceFingerprint
  };
}

export async function uploadProject(plan: UploadPlan, gitUsername: string | undefined, accessToken: string | undefined) {
  if (!accessToken) {
    throw new Error("GITEE_ACCESS_TOKEN is not configured.");
  }
  if (!gitUsername) {
    throw new Error("GITEE_GIT_USERNAME is required for project upload. Set it to your Gitee login name.");
  }
  if (plan.sensitiveFiles.length > 0) {
    throw new Error("The preview contains potentially sensitive files. Add them to .gitignore, then generate a new upload preview.");
  }

  const currentPlan = await previewUpload(plan);
  if (currentPlan.sourceFingerprint !== plan.sourceFingerprint) {
    throw new Error("The source project changed after preview. Run gitee_prepare_upload_project again before uploading.");
  }

  const workDir = await mkdtemp(join(tmpdir(), "gitee-upload-"));
  const projectDir = join(workDir, "project");
  const askPassPath = join(workDir, "askpass.cmd");
  const remoteUrl = `https://gitee.com/${encodeURIComponent(plan.owner)}/${encodeURIComponent(plan.repository)}.git`;

  try {
    await copyProjectSource(plan.sourcePath, projectDir);
    await writeFile(
      askPassPath,
      "@echo off\r\necho %~1 | findstr /B /I Username >nul\r\nif %errorlevel% equ 0 (echo %GITEE_GIT_USERNAME%) else (echo %GITEE_ACCESS_TOKEN%)\r\n",
      "utf8"
    );

    const environment = {
      ...process.env,
      GIT_ASKPASS: askPassPath,
      GIT_ASKPASS_REQUIRE: "force",
      GIT_TERMINAL_PROMPT: "0",
      GITEE_ACCESS_TOKEN: accessToken,
      GITEE_GIT_USERNAME: gitUsername
    };

    await runGit(["init", `--initial-branch=${plan.branch}`], projectDir, environment);
    await runGit(["add", "--all"], projectDir, environment);
    const stagedCount = (await runGit(["diff", "--cached", "--name-only"], projectDir, environment)).trim();
    if (!stagedCount) {
      throw new Error("No files remain after applying .gitignore. Nothing was uploaded.");
    }
    await runGit(["-c", "user.name=Gitee Codex Plugin", "-c", "user.email=codex@gitee.local", "commit", "-m", plan.commitMessage], projectDir, environment);
    await runGit(["remote", "add", "origin", remoteUrl], projectDir, environment);

    const remoteBranch = (await runGit(["ls-remote", "--heads", "origin", plan.branch], projectDir, environment)).trim();
    if (remoteBranch) {
      throw new Error(`Remote branch ${plan.branch} already exists. The plugin will not overwrite remote history.`);
    }

    await runGit(["push", "--set-upstream", "origin", plan.branch], projectDir, environment);
    return { remoteUrl, branch: plan.branch, committedFiles: stagedCount.split(/\r?\n/).length };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

type ScannedFile = { relativePath: string; size: number; modifiedAt: number };

async function scanDirectory(root: string, current: string, files: ScannedFile[]) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || ALWAYS_EXCLUDED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(root, absolutePath, files);
      continue;
    }
    if (entry.isFile()) {
      const details = await lstat(absolutePath);
      files.push({
        relativePath: absolutePath.slice(root.length + 1).replaceAll("\\", "/"),
        size: details.size,
        modifiedAt: details.mtimeMs
      });
    }
  }
}

async function findStagedFiles(sourcePath: string) {
  const workDir = await mkdtemp(join(tmpdir(), "gitee-preview-"));
  const projectDir = join(workDir, "project");
  try {
    await copyProjectSource(sourcePath, projectDir);
    await runGit(["init", "--quiet"], projectDir, process.env);
    await runGit(["add", "--all"], projectDir, process.env);
    const output = await runGit(["diff", "--cached", "--name-only", "-z"], projectDir, process.env);
    return output.split("\0").filter(Boolean);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function copyProjectSource(sourcePath: string, destinationPath: string) {
  await cp(sourcePath, destinationPath, {
    recursive: true,
    filter: async (source) => {
      const details = await lstat(source);
      return !details.isSymbolicLink() && !ALWAYS_EXCLUDED_DIRECTORIES.has(basename(source));
    }
  });
}

function runGit(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<string>((resolvePromise, reject) => {
    // Ignore any persisted credential helper so this isolated upload uses only
    // the temporary GIT_ASKPASS credentials supplied by the plugin.
    const child = spawn("git", ["-c", "credential.helper=", ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
      } else {
        reject(new Error(`git ${args[0]} failed: ${stderr.trim() || `exit code ${code}`}`));
      }
    });
  });
}
