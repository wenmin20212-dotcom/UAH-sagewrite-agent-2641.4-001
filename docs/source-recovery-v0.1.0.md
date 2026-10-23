# v0.1.0 发布源码补齐

本次补齐原有 Windows v0.1.0 发布时的产品源码，不改变原安装包，也不把当前电脑的 0.1.1 Token 控制升级混入历史版本。

- 根目录 agent.json：原 v0.1.0 打包清单，包含 8 个 Skills 和 sagewrite MCP 服务。
- agent/portable-source/sagewrite/：191 个原始采用文件，每个字节哈希均符合采用清单。
- agent/exports/：清单引用的九视图和原始参考资料，保持原相对路径。
- agent/sagewrite-adoption-manifest.json：原始采用清单；根目录原清单继续保留。
- docs/source-audit-v0.1.0.json：与 SageWrite 提交 1136f9744c7aed8fc252afcf74922e61779145ac 的比较。GitHub 与本地提交树一致：30 个字节一致、157 个仅 CRLF/LF 不同、4 个内容不同。

4 个内容不同文件是 engine/01b-import-structure.ps1、engine/04F.ps1、engine/04f-format-common.ps1、engine/05-build.ps1。来源是当时工作树快照，不是仅凭提交号重建。agent/** 使用 -text 保留发布字节，避免再次自动转换换行符。

Mac 移植应以本次恢复的快照为对照，另外实现并测试 Windows 路径、PowerShell 和宿主差异；源码补齐不代表 Mac 版已经同步或验收。完整 Windows 桌面宿主仍通过原 v0.1.0 Setup.exe 提供，本仓库不包含宿主二进制或离线模型，也不包含用户账号、模型授权、聊天和书稿。
