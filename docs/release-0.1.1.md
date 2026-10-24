# 作家 Agent 0.1.1 · Token 自动压缩控制

本版包含配套原生引擎和菜单“Agent 工具 → 自动压缩设置…”。支持比例、固定 Token 触发量及历史摘要目标；比例和固定量取较早到达的一项。新实例默认 30%、20000 Token、3000 Token，已有非空设置保留。设置保存后重启生效，不立即压缩或删除聊天。摘要目标只针对历史摘要；超标或当前问题过长时报告错误并保留原对话，不直接截断。

## 下载与升级

- 新安装：下载 Setup-0.1.1.exe，Windows 10/11 x64，无需编译；自动创建桌面和开始菜单快捷方式。首次使用配置自己的模型账号。完整程序包含 Node 与原生引擎，不含离线模型。
- 已有 0.1.0：退出作家 Agent 并暂停其手机后端，下载对应 Upgrade.zip，解压到程序目录之外，运行 Upgrade.cmd，选择原安装目录和外部备份位置。程序和资料先完整备份，哈希未知改动会阻止覆盖。保留职业定义、模型、账号授权、聊天、Skills 与 workspace 书稿。升级后用原快捷方式启动，再恢复手机服务。
- 已在本机升级到 0.1.1：无需重复安装 0.1.0 升级包。

本版先发布完整安装包和手动升级包；GitHub Release 不等于已投放统一签名更新通道。手机网页版本独立管理。

## 源码和构建

根 agent.json 与 agent/ 是产品定义与采用源码，继续保持 191 项原始采用哈希。execution/、updater/、host/ 包含桌面控制及设置源码。native/context-budget/ 保存配套原生补丁、来源和二进制哈希；宿主完整上游源码仍是独立依赖，不将源码快照补齐描述为 Mac 已适配。

安装 Node 后 npm ci。使用 tools/build.cjs --base <匹配的桌面运行时目录> --backend <匹配的 goose.exe> --output .release-work/<新目录> 构建干净程序。依赖目录必须含 app、runtime、execution/node_modules；构建只复制程序运行时，不复制实例 data、workspace、updates 或账号。原生引擎必须匹配 runtime.json 的 SHA256，不能继续使用旧二进制。Inno Setup 7.1.0 编译 installer/sagewrite.iss，传 /DPayload=<干净程序> /DOutput=<输出目录>。

验证范围为程序启动、设置窗口及参数保存、模型和资料保留、原生压缩触发边界；不表示书籍创作质量验收或 Mac 验证完成。

MCP 运行依赖固定为 @modelcontextprotocol/server 2.0.0 与 zod 4.6.5，并携带传递依赖，位于 agent/portable-source/sagewrite/engine/mcp-server/node_modules。构建前另执行 npm ci --prefix packaging/mcp-runtime --ignore-scripts。根目录和安装包中的 package-receipt.json 可逐个核对已发布程序；清单自身与 release-manifest.json 排除，避免循环哈希。
