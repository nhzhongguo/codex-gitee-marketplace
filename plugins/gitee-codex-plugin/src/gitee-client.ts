const API_BASE_URL = "https://gitee.com/api/v5";

export type GiteeRepository = {
  full_name: string;
  name: string;
  namespace: { path: string };
  html_url: string;
  ssh_url?: string;
  private: boolean;
  default_branch?: string;
  description?: string | null;
};

export class GiteeClient {
  public constructor(private readonly accessToken = process.env.GITEE_ACCESS_TOKEN) {}

  public async whoAmI() {
    return this.request("/user");
  }

  public async listRepositories(page: number, perPage: number) {
    return this.request("/user/repos", {
      query: { page, per_page: perPage, visibility: "all", sort: "updated", direction: "desc" }
    });
  }

  public async getRepository(owner: string, repo: string): Promise<GiteeRepository> {
    return this.request(`/repos/${encodePath(owner)}/${encodePath(repo)}`);
  }

  public async listBranches(owner: string, repo: string, page: number, perPage: number) {
    return this.request(`/repos/${encodePath(owner)}/${encodePath(repo)}/branches`, {
      query: { page, per_page: perPage }
    });
  }

  public async readFile(owner: string, repo: string, path: string, ref?: string) {
    return this.request(`/repos/${encodePath(owner)}/${encodePath(repo)}/contents/${encodeFilePath(path)}`, {
      query: ref ? { ref } : undefined
    });
  }

  public async createRepository(input: {
    name: string;
    description?: string;
    private: boolean;
    autoInitialize: boolean;
    defaultBranch?: string;
  }): Promise<GiteeRepository> {
    return this.request("/user/repos", {
      method: "POST",
      body: {
        name: input.name,
        description: input.description,
        private: input.private,
        auto_init: input.autoInitialize,
        default_branch: input.defaultBranch
      }
    });
  }

  public async createBranch(owner: string, repo: string, branchName: string, fromRef: string) {
    return this.request(`/repos/${encodePath(owner)}/${encodePath(repo)}/branches`, {
      method: "POST",
      body: { refs: fromRef, branch_name: branchName }
    });
  }

  public async createPullRequest(input: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }) {
    return this.request(`/repos/${encodePath(input.owner)}/${encodePath(input.repo)}/pulls`, {
      method: "POST",
      body: { title: input.title, head: input.head, base: input.base, body: input.body }
    });
  }

  private async request(path: string, options: RequestOptions = {}) {
    if (!this.accessToken) {
      throw new Error("GITEE_ACCESS_TOKEN is not configured. Set it in the Codex plugin environment before using Gitee tools.");
    }

    const url = new URL(`${API_BASE_URL}${path}`);
    url.searchParams.set("access_token", this.accessToken);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const detail = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
      throw new Error(`Gitee API request failed (${response.status}): ${redact(detail, this.accessToken)}`);
    }

    return responseBody;
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
};

function encodePath(value: string) {
  return encodeURIComponent(value);
}

function encodeFilePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function redact(value: string, secret: string) {
  return value.replaceAll(secret, "[REDACTED]");
}
