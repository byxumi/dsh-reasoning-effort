# Security Policy / 安全政策

## Supported Versions / 支持的版本

| Version | Supported |
|---------|-----------|
| 1.2.x   | ✅ 支持 |
| < 1.2   | ❌ 不再支持 |

## Reporting a Vulnerability / 报告漏洞

请**不要**将安全漏洞发布到公开的 GitHub Issues。

请通过邮件或私有渠道报告安全漏洞：

- **GitHub 安全披露**：https://github.com/byxumi/dsh-reasoning-effort/security/advisories
- 或通过任何 DSH / DeepSeek Harness 社区维护者的私有联系方式

我们会在收到报告后 **48 小时内**响应，并尽快发布修复版本。

## 本插件的安全说明

`dsh-reasoning-effort` 是一个 DSH (Cordis) 插件，需要修改 `dsh-llm-pi-ai` 的适配器代码来透传 reasoning effort 配置。请知悉：

1. **补丁修改 node_modules 文件**：脚本会为 `dsh-llm-pi-ai/lib/index.js` 创建 `.dsh-reasoning.bak` 备份，
   卸载时可还原。请勿删除备份文件，否则无法自动还原。
2. **不要提交真实 API Key**：`settings.yaml` 中的 `apiKeyEnv` 应引用环境变量名，而不是直接写入密钥。
3. **只从受信来源安装**：`dsh plugin add` 安装的包会执行其 `install` 脚本，请仅从官方仓库安装。

## 免责声明 / Disclaimer

本插件按现状（AS-IS）提供，不附带任何明示或暗示的担保。
使用本插件修改 DSH 适配器代码的风险由使用者自行承担。