# Gitee Codex Plugin

A local Codex plugin that connects Codex to [Gitee](https://gitee.com) through a Model Context Protocol (MCP) server. It supports repository inspection, repository and branch creation, isolated project upload, and pull-request creation.

## Safety model

- Read-only operations run directly.
- Every remote write is a `prepare` then `confirm` operation. Confirmation tokens are action-bound, one-time, and expire after 10 minutes.
- Project uploads clone the source files into a temporary directory. Preview applies the project's `.gitignore`; a detected `.env` or private-key file blocks the upload until it is excluded. The source working tree, its Git configuration, and existing remotes are not changed.
- Existing remote branches are never overwritten. Force pushes are not supported.
- The access token is read only from the local process environment and is never persisted by this plugin.

## Requirements

- Node.js 20 or later
- Git 2.x available on `PATH` for project upload
- A Gitee personal access token with the repository permissions needed for your intended operations
- Your Gitee login name in `GITEE_GIT_USERNAME` for HTTPS Git upload

## Local setup

From the plugin directory: 

```powershell
npm ci
npm run build
$env:GITEE_ACCESS_TOKEN = "your-gitee-access-token"
$env:GITEE_GIT_USERNAME = "your-gitee-login-name"
```

Then enable the plugin from this directory in Codex. Its MCP manifest is [`.mcp.json`](.mcp.json); it starts the self-contained `dist/mcp-server.js` over stdio. Restart or open a new Codex task after installation so Codex discovers the MCP server.

For the Codex desktop app, add these values as user environment variables and restart Codex so its child MCP process receives them. Keep the token out of terminal history and out of this repository.

Do not put a token into `.mcp.json`, source code, Git remotes, or a committed `.env` file.

## Tools

| Tool family | Operation |
| --- | --- |
| `gitee_get_authenticated_user` | Verify the configured account |
| `gitee_list_repositories`, `gitee_get_repository` | Inspect repositories |
| `gitee_list_branches`, `gitee_read_file` | Inspect repository content |
| `gitee_prepare_create_repository`, `gitee_confirm_create_repository` | Create a repository |
| `gitee_prepare_create_branch`, `gitee_confirm_create_branch` | Create a branch |
| `gitee_prepare_upload_project`, `gitee_confirm_upload_project` | Push a local project to a new remote branch |
| `gitee_prepare_create_pull_request`, `gitee_confirm_create_pull_request` | Open a pull request |

## Example interaction

```text
User: Preview uploading C:\work\billing-service to gitee-user/billing-service on main.
Codex: Calls gitee_prepare_upload_project and reports the file count, detected sensitive files, target branch, and confirmation token.
User: I reviewed the preview. Upload it.
Codex: Calls gitee_confirm_upload_project with that preview's token.
```

## Development

```powershell
npm run check
npm test
```

The MCP smoke test only lists tools. It does not call Gitee and does not require a Gitee token.

## OAuth roadmap

This first local version intentionally uses a local Gitee personal access token. A public multi-user release should replace it with Gitee OAuth, a HTTPS callback endpoint, encrypted per-user token storage, revocation, and audit logging.
