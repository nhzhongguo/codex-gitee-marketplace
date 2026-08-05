---
name: gitee-workflow
description: Use Gitee repositories, branches, project uploads, and pull requests safely through the Gitee MCP tools.
---

# Gitee Workflow

Use this workflow when a user asks to inspect, create, upload to, or collaborate through a Gitee repository.

## Read-only work

- Use `gitee_get_authenticated_user` first when the user needs account context.
- Use `gitee_list_repositories`, `gitee_get_repository`, `gitee_list_branches`, and `gitee_read_file` for inspection.
- Never expose the configured Gitee access token in tool output, conversation text, commands, or committed files.

## Remote changes

All remote writes use a preview and confirmation pair.

1. Call the matching `gitee_prepare_*` tool.
2. Show the repository, branch, content summary, and any relevant warnings.
3. Ask the user to explicitly approve the exact action.
4. Only after approval, call its `gitee_confirm_*` tool with the returned token.

Never call a confirmation tool merely because a user made a broad request such as "upload this project". A preview must occur in the current conversation first.

## Project uploads

- Use `gitee_prepare_upload_project` before every local project push.
- Review detected sensitive filenames. If one is reported, ask the user to remove it or add a suitable `.gitignore` rule, then generate a new preview.
- The plugin copies the project to a temporary directory, never modifies the source directory, and refuses to push to a remote branch that already exists.
- Do not suggest force-push or bypass the existing-branch safeguard.

## Pull requests

Before a pull request preview, inspect the repository and branches when the intended head or base branch is unclear. Keep the title concrete and summarize the change in the PR body.
