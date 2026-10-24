# 配套原生引擎改动

补丁来自 Boss 通用宿主源码，基线提交见 source.json。补丁在 Boss 仓库根目录应用，路径以 source/goose-1.52.0/ 开头；不会修改旧 GooseAgent。此文件保存源代码，不是可直接安装的更新包。

在纯净的匹配基线上，先 git apply --check <此补丁路径>，再 git apply；使用 Boss/tools/cargo-local.ps1 构建和测试。source.json 记录补丁后源码的哈希。发布新孵化师时必须把编译后的配套引擎一起装入宿主，不能继续使用只有比例配置的旧二进制。

回归入口：cargo test -p goose context_mgmt:: --lib；状态机 compaction_lifecycle；tests/compaction.rs 中的 configured_token_budgets_work_in_both_loops 在合成 GOOSE_PATH_ROOT 中显式运行 --ignored --test-threads=1。固定量先到样例：GOOSE_CONTEXT_LIMIT=1000000，比例0.8，固定30000，目标3000，UAH_TEST_TRIGGER_TOKENS=30000；比例先到样例：GOOSE_CONTEXT_LIMIT=100000，比例0.2，固定50000，目标3000，UAH_TEST_TRIGGER_TOKENS=20000。该测试同时调用旧循环和新状态机，检查边界前/边界点和超长当前问题不丢失、不重复压缩。

摘要目标只约束历史摘要（本地分词估算），不是含当前问题、系统提示和工具描述的整个请求。摘要超过目标，或保留的当前问题使上下文仍超触发点时，返回错误并保留原对话，不截断内容。
source.json 的文件哈希按 LF 换行规范化计算，避免 Windows 换行格式造成差异。

0.9.12 构建使用正式 release 配置：goose-cli --no-default-features --features live-voice,rustls-tls,system-keyring。生成的 goose.exe 哈希记录于 runtime.json。构建完整程序时使用 tools/build.cjs --base <干净运行时> --backend <配套 goose.exe> --output build/<新目录>；不匹配的引擎将被拒绝。
