# SageWrite LLM configuration

All SageWrite scripts that generate text with an LLM read their model connection through `00-llm.ps1`. Settings are resolved from environment variables first, then `engine/llm-config.json`, then built-in defaults. `SAGE_LLM_CONFIG` can select a different JSON settings file. The shared file is read at call time by both CLI and UI-launched scripts:

- `02-structure.ps1`
- `02b-expand.ps1`
- `03-write.ps1`
- `03RW.ps1`
- `03t-translate.ps1`
- `03r-refine.ps1`
- `04b33-editorial-action-review.ps1`
- `04c-editorial-loop.ps1`
- `04c2-third-party-audit.ps1` (passes model selection to the shared writer)
- `04c3-accepted-audit-rewrite.ps1`
- `04c44-revision-executor.ps1`
- `07a-cover-assist.ps1`
- `08g-copy.ps1`
- `08n-midjourney-prompt.ps1`

Scripts that do not call an LLM are intentionally unchanged.
Image editing scripts continue to use the Images API because their multipart request and binary response contract is different from text generation.

## Current assistant (codex_LLM)

The installed shared configuration selects `SAGE_LLM_PROVIDER: "codex_LLM"`.
This is a writing execution mode, not a model ID. It uses the current assistant,
without making an HTTP model request or starting another Codex process.
Per-call model names (including UI defaults) do not select the current assistant's
model; the current conversation controls that. Image APIs are separate.

To switch all shared text calls, change `SAGE_LLM_PROVIDER` in `llm-config.json`.
Existing environment overrides still win. For an API provider, also configure its
model, endpoint and credentials as appropriate; do not store secrets in Git.

Scripts persist the prompt as `logs/agent_requests/<sha256>/request.json` under
the current book, emit `SAGE_AGENT_PENDING`, and stop without writing fabricated
output. The recorded state is `waiting_for_agent`; legacy script/GUI wrappers
may still display a nonzero exit or generic failure message. No background
conversation is automatically started. The active assistant must read the task,
write a sibling `response.json`, and rerun the original command:

```json
{
  "request_id": "copy the request_id from request.json",
  "provider": "codex_LLM",
  "status": "completed",
  "text": "The completed text, or serialized JSON required by the task"
}
```

The adapter checks ID, provider, completion state and nonempty text before
returning it to the original script. Prompt, system instructions and output
budget determine the ID. Identical requests reuse the answer; archive that
specific response before requesting a fresh revision with identical inputs.
The optional `SAGE_LLM_AGENT_REQUEST_ROOT` overrides the queue directory.
Without a book context it defaults to ignored `engine/work/agent_requests`.
This protocol does not certify factual accuracy; normal review still applies.

Other assistants could implement this handoff pattern, but Work Buddy support
has not been implemented or verified. The `codex` mode below is a separate CLI
execution mode, not the current conversation.

## OpenAI defaults

Select provider `openai` and supply an API key. The built-in model default is `gpt-5.6` and the default API style is Responses API.

```powershell
$env:SAGE_LLM_PROVIDER = "openai"
$env:SAGE_LLM_API_KEY = "your-api-key"
```

The existing `OPENAI_API_KEY` variable remains supported as a fallback.

## Local Codex execution

This mode does not call an LLM HTTP endpoint from SageWrite. It starts a temporary non-interactive Codex run and reuses the Codex CLI authentication already available on the machine.

```powershell
$env:SAGE_LLM_PROVIDER = "codex"
```

By default, Codex uses its configured model. To select a specific Codex model or working directory:

```powershell
$env:SAGE_LLM_MODEL = "model-name"
$env:SAGE_LLM_CODEX_WORKDIR = "D:\SageWrite"
```

`SAGE_LLM_CODEX_COMMAND` can point to a specific `codex.exe` when it is not available on `PATH`. Codex runs with a read-only sandbox and an ephemeral session because this adapter only needs generated text.

Token usage fields are recorded as `0` when the selected adapter returns text without usage metadata. This is expected for the current `codex-exec` integration.

## OpenAI-compatible provider

```powershell
$env:SAGE_LLM_PROVIDER = "openai-compatible"
$env:SAGE_LLM_BASE_URL = "https://provider.example/v1"
$env:SAGE_LLM_API_STYLE = "chat-completions"
$env:SAGE_LLM_MODEL = "provider-model-name"
$env:SAGE_LLM_API_KEY = "your-provider-api-key"
```

Use `SAGE_LLM_ENDPOINT` instead of `SAGE_LLM_BASE_URL` when the provider requires a complete custom endpoint.

## Optional settings

```powershell
$env:SAGE_LLM_SYSTEM_PROMPT = "Additional system-level instructions"
$env:SAGE_LLM_TIMEOUT_SEC = "180"
```

Supported HTTP API styles are `responses` and `chat-completions`. The `codex` provider automatically uses `codex-exec`. Providers with another native request schema require an additional adapter.

## 2026-10-24 修正：恢复原有 codex exec 同步调用

发现：连续写作选用了 codex_agent（随后仅改名为 codex_LLM）的文件交接模式。03 每遇一个未完成小节便返回 SAGE_AGENT_PENDING，主 Agent 再派子任务、回填 response.json、重跑脚本。实际第 2.3、2.4 节各有 11 条写作用量记录，包含 Python 命令不可用、文件已保存后的空响应重试及重复派发；不能将这些次数理解为正文质量所需的生成轮数。

处理：共享 engine/llm-config.json 及 model-calling 模板统一选择 SAGE_LLM_PROVIDER=codex，使用既有 00-llm.ps1 的 codex exec 同步分支。模型返回后原阶段脚本继续执行，主 Agent 不需逐节执行文件交接。所有经过共享文本接口的阶段共同采用该配置；03、05 等阶段的业务逻辑不改，非模型构建流程及独立图片 API 不受影响。启动脚本同时改为读取共享配置，不再强制覆盖成文件交接模式。旧交接分支及历史书稿、请求和生成来源记录保留，不删除成果，不回退其他修复。

前提：运行电脑须安装 Codex CLI 并独立登录；该分支采用 CLI 的账号与默认模型（或阶段传入的模型），不等同于桌面作家模型账号。环境变量仍优先于文件，应避免旧 SAGE_LLM_PROVIDER/API_STYLE 覆盖。新电脑不会继承本机登录。

验证：本机 codex-cli 0.162.0-alpha.17.2 已登录 ChatGPT，既有 00-llm.ps1 的真实最小调用返回 SAGEWRITE_CODEX_OK，约 5.9 秒。配置后的连续两次调用另行核对。此记录不表示完整书籍连续写作、全部阶段或其他电脑已验收。此次为本地配置修复，尚未发布 GitHub 安装包或新标签；已有版本记录保留。

## 2026-10-25 Token ledger

The shared text function keeps its string return contract. codex exec uses JSON events; only final agent text is returned to callers. Get-SageLastLlmUsage exposes reported counts or null/unavailable. Per-call metadata is appended to book/logs/llm_usage.jsonl; cache reads are a subset of input, not an extra chargeable token total. The CLI invocation/turn counters do not expose exact server request counts. Stage 03 reads these counts for its existing frontmatter and batch summary. Historical zero placeholders cannot be reconstructed.
