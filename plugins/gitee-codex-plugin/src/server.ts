import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ConfirmationStore } from "./confirmation.js";
import { GiteeClient } from "./gitee-client.js";
import { previewUpload, uploadProject, type UploadPlan } from "./project-upload.js";

const server = new McpServer({
  name: "gitee-codex-plugin",
  version: "0.1.0"
});
const client = new GiteeClient();
const confirmations = new ConfirmationStore();

const ownerSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/, "Use a Gitee user or organization path.");
const repositorySchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/, "Use a valid repository name.");
const branchSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9._/-]+$/, "Use a valid Git branch name.");

server.registerTool(
  "gitee_get_authenticated_user",
  {
    title: "Get authenticated Gitee user",
    description: "Returns the Gitee account associated with the configured access token.",
    annotations: { readOnlyHint: true }
  },
  async () => asResult(() => client.whoAmI())
);

server.registerTool(
  "gitee_list_repositories",
  {
    title: "List Gitee repositories",
    description: "Lists repositories available to the configured Gitee account.",
    inputSchema: {
      page: z.number().int().positive().default(1),
      per_page: z.number().int().min(1).max(100).default(30)
    },
    annotations: { readOnlyHint: true }
  },
  async ({ page, per_page }) => asResult(() => client.listRepositories(page, per_page))
);

server.registerTool(
  "gitee_get_repository",
  {
    title: "Get Gitee repository",
    description: "Returns repository metadata, including its default branch and clone URLs.",
    inputSchema: { owner: ownerSchema, repository: repositorySchema },
    annotations: { readOnlyHint: true }
  },
  async ({ owner, repository }) => asResult(() => client.getRepository(owner, repository))
);

server.registerTool(
  "gitee_list_branches",
  {
    title: "List Gitee branches",
    description: "Lists branches for a Gitee repository.",
    inputSchema: {
      owner: ownerSchema,
      repository: repositorySchema,
      page: z.number().int().positive().default(1),
      per_page: z.number().int().min(1).max(100).default(30)
    },
    annotations: { readOnlyHint: true }
  },
  async ({ owner, repository, page, per_page }) => asResult(() => client.listBranches(owner, repository, page, per_page))
);

server.registerTool(
  "gitee_read_file",
  {
    title: "Read a Gitee repository file",
    description: "Reads one file from a repository and optional branch or commit ref.",
    inputSchema: {
      owner: ownerSchema,
      repository: repositorySchema,
      path: z.string().min(1).max(1024).refine((path) => !path.includes(".."), "Path traversal is not allowed."),
      ref: z.string().min(1).max(255).optional()
    },
    annotations: { readOnlyHint: true }
  },
  async ({ owner, repository, path, ref }) => asResult(() => client.readFile(owner, repository, path, ref))
);

server.registerTool(
  "gitee_prepare_create_repository",
  {
    title: "Preview Gitee repository creation",
    description: "Previews a repository creation. This does not create anything; pass its confirmation token to gitee_confirm_create_repository after user approval.",
    inputSchema: {
      name: repositorySchema,
      description: z.string().max(500).optional(),
      private: z.boolean().default(true),
      auto_initialize: z.boolean().default(false),
      default_branch: branchSchema.optional()
    },
    annotations: { destructiveHint: true }
  },
  async (input) => asResult(() => {
    const action = {
      name: input.name,
      description: input.description,
      private: input.private,
      autoInitialize: input.auto_initialize,
      defaultBranch: input.default_branch
    };
    const confirmation = confirmations.issue("create_repository", action);
    return {
      action: "create_repository",
      preview: action,
      confirmation_token: confirmation.token,
      expires_at: confirmation.expiresAt,
      note: "No repository has been created. Obtain explicit user approval before confirmation."
    };
  })
);

server.registerTool(
  "gitee_confirm_create_repository",
  {
    title: "Create a Gitee repository",
    description: "Creates the repository represented by a previously issued confirmation token.",
    inputSchema: { confirmation_token: z.string().uuid() },
    annotations: { destructiveHint: true }
  },
  async ({ confirmation_token }) => asResult(async () => {
    const pending = confirmations.consume<Parameters<GiteeClient["createRepository"]>[0]>(confirmation_token, "create_repository");
    return client.createRepository(pending.payload);
  })
);

server.registerTool(
  "gitee_prepare_create_branch",
  {
    title: "Preview Gitee branch creation",
    description: "Previews a branch creation. Confirm it only after user approval.",
    inputSchema: {
      owner: ownerSchema,
      repository: repositorySchema,
      branch_name: branchSchema,
      from_ref: branchSchema
    },
    annotations: { destructiveHint: true }
  },
  async (input) => asResult(() => {
    const confirmation = confirmations.issue("create_branch", input);
    return {
      action: "create_branch",
      preview: input,
      confirmation_token: confirmation.token,
      expires_at: confirmation.expiresAt,
      note: "No branch has been created. Obtain explicit user approval before confirmation."
    };
  })
);

server.registerTool(
  "gitee_confirm_create_branch",
  {
    title: "Create a Gitee branch",
    description: "Creates the branch represented by a previously issued confirmation token.",
    inputSchema: { confirmation_token: z.string().uuid() },
    annotations: { destructiveHint: true }
  },
  async ({ confirmation_token }) => asResult(async () => {
    const pending = confirmations.consume<{ owner: string; repository: string; branch_name: string; from_ref: string }>(confirmation_token, "create_branch");
    return client.createBranch(pending.payload.owner, pending.payload.repository, pending.payload.branch_name, pending.payload.from_ref);
  })
);

server.registerTool(
  "gitee_prepare_create_pull_request",
  {
    title: "Preview Gitee pull request creation",
    description: "Previews a pull request. Confirm it only after user approval.",
    inputSchema: {
      owner: ownerSchema,
      repository: repositorySchema,
      title: z.string().min(1).max(255),
      head: branchSchema,
      base: branchSchema,
      body: z.string().max(65_535).optional()
    },
    annotations: { destructiveHint: true }
  },
  async (input) => asResult(() => {
    const confirmation = confirmations.issue("create_pull_request", input);
    return {
      action: "create_pull_request",
      preview: input,
      confirmation_token: confirmation.token,
      expires_at: confirmation.expiresAt,
      note: "No pull request has been created. Obtain explicit user approval before confirmation."
    };
  })
);

server.registerTool(
  "gitee_confirm_create_pull_request",
  {
    title: "Create a Gitee pull request",
    description: "Creates the pull request represented by a previously issued confirmation token.",
    inputSchema: { confirmation_token: z.string().uuid() },
    annotations: { destructiveHint: true }
  },
  async ({ confirmation_token }) => asResult(async () => {
    const pending = confirmations.consume<{ owner: string; repository: string; title: string; head: string; base: string; body?: string }>(confirmation_token, "create_pull_request");
    return client.createPullRequest({
      owner: pending.payload.owner,
      repo: pending.payload.repository,
      title: pending.payload.title,
      head: pending.payload.head,
      base: pending.payload.base,
      body: pending.payload.body
    });
  })
);

server.registerTool(
  "gitee_prepare_upload_project",
  {
    title: "Preview project upload to Gitee",
    description: "Scans a local project and previews a new Git push to a Gitee branch. The current repository is never modified. Sensitive files are identified but not automatically excluded.",
    inputSchema: {
      source_path: z.string().min(1),
      owner: ownerSchema,
      repository: repositorySchema,
      branch: branchSchema.default("main"),
      commit_message: z.string().min(1).max(500).default("Initial project upload")
    },
    annotations: { destructiveHint: true }
  },
  async (input) => asResult(async () => {
    const plan = await previewUpload({
      sourcePath: input.source_path,
      owner: input.owner,
      repository: input.repository,
      branch: input.branch,
      commitMessage: input.commit_message
    });
    const confirmation = confirmations.issue("upload_project", plan);
    return {
      action: "upload_project",
      preview: plan,
      confirmation_token: confirmation.token,
      expires_at: confirmation.expiresAt,
      warning: plan.sensitiveFiles.length
        ? "Potentially sensitive files were found. The plugin will refuse the upload until they are excluded through .gitignore and a new preview is created."
        : "The source directory has no detected secret-key or .env filenames.",
      note: "The upload creates a temporary Git repository. It does not change the source directory, and it refuses to overwrite an existing remote branch."
    };
  })
);

server.registerTool(
  "gitee_confirm_upload_project",
  {
    title: "Upload a project to Gitee",
    description: "Pushes the project represented by a previously issued confirmation token to a new remote branch.",
    inputSchema: { confirmation_token: z.string().uuid() },
    annotations: { destructiveHint: true }
  },
  async ({ confirmation_token }) => asResult(async () => {
    const pending = confirmations.consume<UploadPlan>(confirmation_token, "upload_project");
    return uploadProject(pending.payload, process.env.GITEE_GIT_USERNAME, process.env.GITEE_ACCESS_TOKEN);
  })
);

await server.connect(new StdioServerTransport());

async function asResult<T>(action: () => Promise<T> | T) {
  try {
    const result = await action();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
      isError: true
    };
  }
}
