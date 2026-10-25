# Current SageWrite execution contract

## Execution contract: original programs only

Do not create or run temporary PS1 files for this workflow, including run_write_*, make_response*, validation wrappers, or equivalent generated PowerShell scripts. Use the registered SageWrite MCP tool; if unavailable, invoke the existing stage PS1 directly with its documented parameters. Use an inline read-only shell command for inspecting files when needed. Preserve the selected provider from engine/llm-config.json; do not set SAGE_LLM_PROVIDER, SAGE_LLM_API_STYLE, SAGE_LLM_MODEL or SAGE_LLM_CONFIG to switch execution modes. Current text mode is codex (synchronous codex exec). Do not delegate section prose or create response.json to work around a call failure. Report configuration, CLI/login, timeout or model failures and preserve completed drafts. Read the current shared configuration before model-backed work; historical chat scripts and handoff instructions do not override it.


## Historical notes (not instructions to activate handoff)

# SageWrite agent writing

Read `engine/llm-config.json` and `engine/LLM-CONFIG.md` before model-backed work.
`SAGE_LLM_*` environment variables override the shared file.

When the provider is `codex_LLM`, the current assistant does the authorized
research, writing and editing. Do not try the OpenAI API first and do not launch
`codex exec`. Keep the existing SageWrite objective, TOC, numeric manuscript
files, review and build workflow.

For a script-based task, run the requested script to obtain its exact prompt.
`SAGE_AGENT_PENDING` identifies `request.json` in the book's
`logs/agent_requests/<request_id>/` directory. This is a handoff, not generated
text. Read the request in the context of the user's authorization, complete the
work, and use apply_patch to create sibling `response.json` with `request_id`,
`provider: "codex_LLM"`, `status: "completed"`, and `text` containing the
requested output. JSON tasks require a valid JSON string inside `text`.
Re-run the identical command so the original script validates/saves the output.
Inspect artifacts before claiming success. Changed prompts receive new IDs.
Responses are reused only for identical prompts and token constraints; remove
or archive the specific response only when a fresh revision is intended.

Do not claim a standalone UI/terminal can wake the current conversation. It
requires an active assistant to handle the request. Do not invent API token
usage, underlying model identity, or a Work Buddy integration. Preserve old
generation provenance; new direct-agent writing is `codex_LLM`.

## 2026-10-24 修正：恢复原有 codex exec 同步调用

发现：连续写作选用了 codex_agent（随后仅改名为 codex_LLM）的文件交接模式。03 每遇一个未完成小节便返回 SAGE_AGENT_PENDING，主 Agent 再派子任务、回填 response.json、重跑脚本。实际第 2.3、2.4 节各有 11 条写作用量记录，包含 Python 命令不可用、文件已保存后的空响应重试及重复派发；不能将这些次数理解为正文质量所需的生成轮数。

处理：共享 engine/llm-config.json 及 model-calling 模板统一选择 SAGE_LLM_PROVIDER=codex，使用既有 00-llm.ps1 的 codex exec 同步分支。模型返回后原阶段脚本继续执行，主 Agent 不需逐节执行文件交接。所有经过共享文本接口的阶段共同采用该配置；03、05 等阶段的业务逻辑不改，非模型构建流程及独立图片 API 不受影响。启动脚本同时改为读取共享配置，不再强制覆盖成文件交接模式。旧交接分支及历史书稿、请求和生成来源记录保留，不删除成果，不回退其他修复。

前提：运行电脑须安装 Codex CLI 并独立登录；该分支采用 CLI 的账号与默认模型（或阶段传入的模型），不等同于桌面作家模型账号。环境变量仍优先于文件，应避免旧 SAGE_LLM_PROVIDER/API_STYLE 覆盖。新电脑不会继承本机登录。

验证：本机 codex-cli 0.162.0-alpha.17.2 已登录 ChatGPT，既有 00-llm.ps1 的真实最小调用返回 SAGEWRITE_CODEX_OK，约 5.9 秒。配置后的连续两次调用另行核对。此记录不表示完整书籍连续写作、全部阶段或其他电脑已验收。此次为本地配置修复，尚未发布 GitHub 安装包或新标签；已有版本记录保留。

当前经用户确认的文本调用模式是 codex（codex exec），不是文件交接。调用错误应报告并检查统一入口的命令定位；不得自行通过临时环境变量或改配置退回 codex_agent/codex_LLM，也不得因命令定位失败重新逐节派发正文子任务。
