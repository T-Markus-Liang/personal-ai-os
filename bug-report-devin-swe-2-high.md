# Devin/Cognition 故障诊断报告（v2，复核后更正）

时间：2026-10-11　账号：liangweiyu_work@163.com（TEAMS_TIER_DEVIN_PRO）

## 最终结论（v1 中的"预算耗尽"判断已被证伪并撤回）

报错 `There is an issue with this request, please try a different model.` 的根因是
**客户端身份/协议门禁**：Cognition 把 swe-2 全系、swe-1-7-lightning、Claude Opus 5 等
新模型限定给 Devin Desktop/Local 客户端身份（metadata 的 ide 字段 = `devin-desktop`）
及新版请求格式（system prompt 独立字段、trajectory reference 等）。旧包用
ide=`windsurf` + 旧格式发聊天请求，非门禁模型照常工作，门禁模型被网关拒绝。

决定性对照（同一账号、同一小时、pi 真实代码路径端到端）：

| 包 | 聊天身份 | swe-1-7 | swe-2-high | swe-2-medium/max | swe-1-7-lightning | claude-opus-5-5-medium |
|---|---|---|---|---|---|---|
| pi-devin-auth 0.1.2（旧） | windsurf+旧格式 | ✅ | ❌ | ❌ | ❌ | ❌(UID退役) |
| pi-devin-oauth 0.1.5（新） | devin-desktop+新格式 | ✅ | ✅ | ✅ | ✅ | ✅ |

补充确认：
- 两个目录接口（GetCascadeModelConfigs / GetCliModelConfigs）都把 swe-2 标为
  enabled——目录标志不能反映门禁，Cognition 侧错误消息也不透明（issue #14 同款）。
- v1 中"ACU 预算耗尽"的推断被证伪：若预算耗尽，新包跑付费模型也应失败，实测全部通过。
  GetUserStatus 里的 `{status:3, "Ask your account admin to raise it"}` 是团队预算配置
  字段的通用提示文案，账期时间戳 2026-09-19→10-19 只是账期边界，均非故障原因。
- 用户原始 trace IDs（8da1fbef…, f2af7707…）是 windsurf 身份被门禁拒绝的记录，
  已可通过换包解决，无需再报障；如要找 Cognition，可说明"旧 IDE 身份无法访问
  swe-2 系列"。

## 时间线与修复动作

1. 10-11 18:00：pi-devin-auth 0.1.2 重装；19:50 其 models.ts 被本地手改
   （FALLBACK_MODELS 清空 + 加入 swe-2 前缀）→ 曾导致 CLI 下 devin 注册 0 模型。
   已还原（npm 原版），但该包随后整体被替换，此修复不再相关。
2. 10-11 22:08：包切换为 `npm:pi-devin-oauth` 0.1.5（作者 ttttmr，2026-10 维护中，
   使用 devin-desktop 身份 + 新版请求格式 + GetCliModelConfigs 目录）。
   切换后实测：swe-2 全系、swe-1-7(-lightning)、claude-opus-5-5、glm-5-2 全部 ✅。
3. 目录缓存 `~/.pi/agent/cache/devin-oauth-catalog.json` 已生成，`pi --list-models`
   现列出完整 devin 模型（claude/gpt/gemini/deepseek/glm/grok/kimi/swe 全系）。

## 当前状态

已修复。`devin/swe-2-high` 等在 pi 中可直接使用（TUI 里 `/model` 选择；
CLI 里 `--model devin/swe-2-high`）。无需提额、无需等账期重置。

## 教训

- Cognition 云端演进快，逆向协议类扩展会随服务端变更失效；优先用近期维护的包。
- 勿在 `~/.pi/agent/npm/node_modules/` 手改包文件（会产生难追踪漂移）。
- 目录接口的 enabled 标志 ≠ 真实可调用；端到端实测才是准。
