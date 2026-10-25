
## 2026-10-25 · 0.1.3 固定写作 CLI 精简配置（Mac协作 B-14）

发现问题：写作提示词估算4397 token，CLI每节报告输入20292；请求包含通用Codex指令、Skills目录、协作和工具定义。本次只在共享00-llm.ps1固定writer profile v1，原03循环和提示词不变；全部codex模式调用共用配置，API模式不变。

固定内容：进程使用--ignore-user-config；保留CLI登录；SAGE_LLM_MODEL默认gpt-6.1-sol，低推理；engine/codex-writer-instructions.md替换通用指令，关闭Skills目录、协作、环境说明、浏览器、应用、插件、图像和shell等能力。保留code_mode_host避免实测不可用错误。用户.codex配置和主Agent模型设置不改。CLI仍携带functions工具定义，尚非无工具API。

同一第46节提示词：原输入20292、输出1438；有效精简测试输入7688、输出1368，输入降低62.1%。原缓存13312，测试缓存0，不能声称费用同比降低。两稿均完成同一小节，标题及四段结构相符，文字细节不同，未证明多样本质量等价；测试稿不覆盖正式稿。

0.1.3亦收纳此前本地已实施的同步codex调用、PATH自动定位、CLI JSON用量账本、最近生成范围检查、写作Skill简化、Skill升级同步、可关闭的测试原文记录。历史说明全部保留。完整测试原文、作者资料和认证不得入Git或升级包。测试tokenizer是本机可选依赖，缺少时记录unavailable，不影响写作。

升级修复：旧升级清单未覆盖采用的PS1和Skill源文件，本次纳入agent、assets、docs等程序文件，带哈希校验和备份。保护data、workspace、既有模型；未知源码修改停止，不盲目覆盖。0.1.1及0.1.2分别使用对应升级包，完整安装器用于新安装。旧版本和旧标签不覆盖。

Mac协作 B-14：同步共享00-llm.ps1、新增codex-writer-instructions.md、llm-config.json和B-08至B-13变更；按Mac CLI验证参数与登录。不复制Windows二进制。指令路径按脚本目录生成，不硬编码Windows安装目录。不支持参数时明确回报，不静默退回完整Agent调用。Windows实测不表示Mac已验收。
