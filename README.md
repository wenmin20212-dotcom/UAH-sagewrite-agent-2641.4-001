# SageWrite 长篇书籍创作 Agent

ESCO: 2641.4-001
Version: 0.1.0
Type: prototype

This repository publishes the prototype definition and release installer for the standalone SageWrite professional Agent. It preserves the existing SageWrite PowerShell workflow, unified model layer, MCP service and Skills.

本仓库发布 SageWrite 长篇书籍创作 Agent 原型定义及完整 Windows 安装器。当前为 prototype；九视图设计形成不等于具体书籍业务或出版质量已经专业验收。

## Install

Download the Setup.exe from Releases. New instances configure their own model provider and credentials. No model keys, accounts, author manuscripts or prior authorizations are bundled.

## Licenses

SageWrite source files retain the MIT license in LICENSE-SageWrite. The desktop host retains Goose Apache-2.0 notices in LICENSE-Goose.

## 发布源码与移植依据

已补齐 v0.1.0 原始 agent.json、191 个采用源码文件及清单引用的九视图资料。移植请使用本仓库 `agent/portable-source/sagewrite/` 快照，不要只使用 SageWrite 的基础提交号。源文件按原字节保存，哈希可与采用清单核对。详见[恢复说明](docs/source-recovery-v0.1.0.md)和[逐项核对](docs/source-audit-v0.1.0.json)。原 v0.1.0 安装包与标签保持不变；Mac 兼容性仍需单独验证。
