# AI 编程工具推荐

> 想学 Vibe Coding（用自然语言指挥 AI 写代码），先挑一个顺手的工具装上。这一页是国内视角的工具横评。

## Kimi Code

命令行 AI 编程 Agent（本站就是用它参与开发的）。国内可直接使用，中文需求理解精准，Agent 模式能自己读代码库、拆任务、跑测试、改 bug。

安装（PowerShell 一行）：

```powershell
Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression
```

![Kimi Code 启动](/wiki/kimicode-start.png)

装完在终端输入 `kimi` 就能开始对话式编程：

![Kimi Code 运行](/wiki/kimicode-run.png)

适合：国内开发者、中文项目、想用命令行 Agent 完整体验"指挥 AI 写代码"的人。

## Codex

OpenAI 出品的编程 Agent（Codex CLI），终端里跑，代码能力强。

> ⚠️ **使用提醒**：非常优秀的编程工具，但是由于 2026 年 7 月爆出针对中国地区的后门，因此建议减少或者尽量不用。

## ~~Claude Code~~

~~Anthropic 出品的命令行编程 Agent，长上下文和代码理解能力曾是业界标杆。~~

> ⚠️ **使用提醒**：非常优秀的编程工具，但是由于 2026 年 7 月爆出针对中国地区的后门，因此建议减少或者尽量不用。

## 怎么选

- 国内网络环境 + 中文项目：**Kimi Code** 是首选
- 海外工具（Codex / Claude Code）：能跑，但基于上述安全原因建议减少或尽量不用
- 编辑器党（不想碰命令行）：可以去看 Cursor、通义灵码这类 IDE 插件形态

工具只是放大器——看懂 AI 写的代码、审得住它的改动，才是真本事。这正是本站要带你们练的。
