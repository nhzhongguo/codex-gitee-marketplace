# 豫晨 Gitee Codex 插件市场

这是豫晨发布的开源 Codex 插件市场。它通过本地 MCP 服务让 Codex 操作 Gitee：查看仓库和分支、创建仓库和分支、预览并上传本地项目，以及创建 Pull Request。

本仓库在 Gitee 与 GitHub 保持完全相同的提交内容。安装时任选一个地址添加，**不要同时添加两个地址**，以免重复注册同一个插件市场。

## 安装

### 使用 Gitee

```powershell
codex plugin marketplace add https://gitee.com/yuchen996/codex-gitee-marketplace.git --ref main
codex plugin add gitee-codex-plugin@yuchen-codex-marketplace
```

### 使用 GitHub

```powershell
codex plugin marketplace add https://github.com/nhzhongguo/codex-gitee-marketplace.git --ref main
codex plugin add gitee-codex-plugin@yuchen-codex-marketplace
```

安装完成后，新建一个 Codex 任务，再说“检查我的 Gitee 账号”。

## Gitee 授权

插件使用用户自己的 Gitee 个人访问令牌，仅从本机环境变量读取，插件不会保存令牌。不要把令牌发送到聊天窗口、写入仓库或提交到 Git。

为当前 Windows 用户设置以下变量后，重启 Codex：

```powershell
[Environment]::SetEnvironmentVariable('GITEE_ACCESS_TOKEN', 'your-gitee-access-token', 'User')
[Environment]::SetEnvironmentVariable('GITEE_GIT_USERNAME', 'your-gitee-login-name', 'User')
```

## 让 Codex 安装

把以下文字发送给 Codex，并把其中的地址保留为 Gitee 或 GitHub 二选一：

```text
请从 https://gitee.com/yuchen996/codex-gitee-marketplace.git 的 main 分支添加豫晨 Codex 插件市场，并安装 gitee-codex-plugin。安装后提示我新建任务验证 Gitee 账号。不要读取、显示、保存或要求我在对话中粘贴 Gitee 访问令牌。
```

## 更新

```powershell
codex plugin marketplace upgrade yuchen-codex-marketplace
codex plugin add gitee-codex-plugin@yuchen-codex-marketplace
```

## 开发与发布

插件源码位于 `plugins/gitee-codex-plugin/`。开发者安装依赖并验证：

```powershell
Set-Location plugins/gitee-codex-plugin
npm ci
npm test
```

发布前在仓库根目录运行 `scripts/publish.ps1 -Message "release: vX.Y.Z"`。该脚本会运行测试、提交变更、依次推送 Gitee 与 GitHub，并核验两个远程的 `main` 指向同一提交。

## 安全模型

- 所有远程写操作必须先预览、再由用户明确确认。
- 上传会在临时目录中执行，原项目、原 Git 配置和原远程地址不会被修改。
- 检测到 `.env` 或私钥等敏感文件时，上传会被阻止。
- 不支持强制推送，也不会覆盖已有远程分支。

## 许可证

[MIT](LICENSE)
