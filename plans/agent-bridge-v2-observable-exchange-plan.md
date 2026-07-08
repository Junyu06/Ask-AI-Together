# Agent Bridge v2：可观测 exchange 状态机 + 4 provider 并发

日期：2026-07-07。分支：`agent/bridge-mvp`（active deploy branch，不 merge main）。

## 动机（用户原话归纳）

1. 现状对调用方（pi companion / 任何 agent）是黑盒：只知道「发出去了」和「收尾拿到文本」，中间是发送中/生成中/已返回完全不可见。`getProviderStatus` 的 generation 字段字面返回 `generation-state-not-exposed`。
2. 4 个 provider 希望并发跑。现状 pi 侧 `CONCURRENCY=1` 串行（4 家全量 49s），且 extension 侧有全局 newChat 串行链、targets 读改写竞态等并发不安全点。
3. 顺带全面复查与优化。

## 现状断点（调研结论）

- **黑盒根因 1**：collectResponse 是一次长阻塞 CDP evaluate（poll 至 180s），期间无任何中间态；靠文本 placeholder 正则 + 短回复稳定性 hack 判断「生成完没有」，脆弱（Grok 中间态硬编码正则一大串）。
- **黑盒根因 2**：content 层其实已有 `OA_SEND_PROGRESS`（injecting/submitted/acknowledged/failed）进度事件，只广播给 extension pages，bridge 从未暴露。
- **黑盒根因 3**：页面 DOM 本来就有确定的生成态信号（Claude `data-is-streaming`、各家 Stop 按钮），完全没用上。
- **并发点 1**：`newChatOnTargets` 全局串行链 `__oaNewChatChain`（历史上防窗口抢焦点；现实现已是纯 URL 导航，无焦点操作，串行只剩坏处）。
- **并发点 2**：`syncTargetsFromTabsForSites`/`ensureTargetsForAction` 对 targets 的 load-modify-save 无锁（缓解：`targetsCache` 共享同一对象引用，实际并发合并大多无害，但删除/重绑交错仍有窗口）。
- **并发点 3**：长阻塞 collect 的 CDP evaluate 超时语义混乱（`--timeout-ms` 同时管 CDP 超时和 collect poll 预算），已经咬过一次（sendPrompt 10s 误判，pi commit a928d69 打了 45s 补丁）。
- 每个 primitive 一次 node spawn + CDP ws：一次 4-provider 全量 ≥16 个进程往返，浪费但不是主要矛盾。

## 设计：poll 驱动的 exchange 状态机（extension 内编排）

把「一次外部查询」（fresh → send → 监控生成 → 收文本）整体挪进 extension background，作为持久化状态机；4 家在 extension 内部天然并发；调用方一次 `startExchange`，之后用便宜的 `getExchangeStatus` 轮询——**每次轮询同时推进（pump）状态机**，这让 MV3 service worker 被杀也不影响正确性（状态存 `chrome.storage.session`，poll 即恢复）。

### 新 bridge actions（保留旧 primitives 与 compat actions 不动）

- `startExchange { providerIds, prompt, options{ newChatBeforeSend, newChatSettleMs, collectTimeoutMs }, providerOptions{ [id]: { newChatBeforeSend } } }`
  → 建 exchange 记录，**并行**发起各 provider 链（bind tab → fresh → send），立刻返回 `exchangeId` + 初始 per-provider 状态。
- `getExchangeStatus { exchangeId }`
  → pump + 返回快照：每家 `phase`、`generation`（DOM 信号）、`textLength`、时间戳、完成后带最终 `text` + `conversation` marker。
- `cancelExchange { exchangeId }`。
- `getProviderStatus` 顺带接上真实 generation 探测（黑盒字段修掉）。

### per-provider phase 状态机

```
pending → opening → fresh-conversation → sending → sent
        → generating → stabilizing → completed
任意点 → failed { errorCode, reason }（retryable 标注）
```

- 链阶段（startExchange 内并发执行）：opening（openOrReuseWindows / 复用绑定 tab）→ fresh（per-provider 串行链，不再全局串行）→ sending（注入+点击）→ sent（ack 或 submitted-unacknowledged）。
- 监控阶段（getExchangeStatus pump 驱动）：对 sent/generating/stabilizing 的 provider 用 `chrome.scripting.executeScript`（isolated world，直接调 content 全局 `extractLatestResponseText`）探测：
  - **busy 信号**（新增 provider catalog `busySelectors`：chatgpt `[data-testid="stop-button"]`、claude `[data-is-streaming="true"]`、gemini/grok Stop 按钮等）为真 → `generating`；
  - busy 假/未知 → 取最新回复文本：和 pre-send baseline 相同或 placeholder → 继续等；相比上次采样有变化 → `generating`（text-growth）；无变化 → `stabilizing`，连续 2 次稳定 → `completed`（存 text + conversation marker）；
  - 超过 `collectTimeoutMs`（默认 180s，自 submittedAt 起算）→ `failed: response-timeout`。
  - 采样最小间隔 1s（防过快轮询空转）。
- SW 重启恢复：prompt 只存内存（隐私 metadata-only 不变）；pump 发现 pre-send 阶段 `phaseUpdatedAt` 停滞 >20s → 标 `failed: service-worker-restarted`（不盲目重发，防 double-send）；sent 之后的监控不受 SW 重启影响（poll 即恢复）。

### 并发安全修理（同批）

- `__oaNewChatChain` 全局串行 → per-provider 串行链（Map by siteId）；exchange 与 UI 路径共用。
- targets load-modify-save 用单一 mutation 队列（`withTargetsMutation`）串行化。
- bridge 路径跳过 initiator 焦点恢复（CDP headless 场景无意义）。

### bridge 脚本（agent-skills repo）

- ACTIONS 增加三个新 action + `--exchange-id`；startExchange 走 `--prompt-file`；所有新调用都是短往返（CDP 默认 10s 超时够用），**长阻塞 evaluate 从热路径消失**，a928d69 那类超时误判类 bug 根除。

### pi 侧（pi_personal_assistant repo）

- `bridge-client.mjs` 新增 exchange 路径：health 探测 extension 是否支持（`exchangeActions` 字段）→ 支持则 startExchange（全 provider 一次）+ 每 ~3s poll getExchangeStatus；不支持自动 fallback 旧串行 primitives 路径。
- per-provider session 连续性保持 pi 侧决策：有 saved marker 的 provider 先 getProviderStatus 比对，把 per-provider `newChatBeforeSend` 传进 startExchange。
- 新增 `onProgress` 回调：worker 把 phase 变化写日志（+ 可选 job 进度），部分失败照常汇报成功家。
- 结果映射保持现有 shape（{provider_id, status, continuity, response}），tool/delivery 层零改动。

## 验收

1. extension 单测：新增 validate-agent-exchange.js（vm + fake chrome，覆盖：并行 4 家 phase 演进、pump 收敛、placeholder/baseline 拒收旧答案、超时、cancel、SW-restart 语义）；existing validate-agent-bridge.js 继续 pass。
2. pi 单测：exchange 路径 fake bridgeRequest（含 fallback 检测）。
3. Mac mini 实机：4 provider 并行真实查询，期望墙钟从 49s（串行）降到 ~最慢单家（15-25s 简单问题）；轮询日志能看到每家 sending→generating→completed 的真实相位。
