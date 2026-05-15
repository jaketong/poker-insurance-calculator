# GITHUB_NETLIFY_RELEASE_FLOW.md

## 1. 文件目的

本文件用于**固定**扑克保险工具项目在 **GitHub / Netlify** 上的发布与验收流程，减少「该不该 push、谁 push、部署了没有」的混乱。

- **GitHub** 是**版本保险箱**：提交历史、对比、回滚都依赖它。  
- **Netlify** 是**部署器**：在已连接 GitHub 的前提下，通常由推送触发构建与发布。  
- **push 到 `master`** 会触发 Netlify **自动生产部署**（以当前 Netlify 项目配置为准）。  
- **未经用户明确确认**，不得执行 `git push`。  
- **未经用户明确确认**，不得**手动**在 Netlify 控制台触发 Deploy（避免与 Git 记录脱节）。

本文件与 `AI_DEV_RULES.md` 中「GitHub 与 Netlify 发布规则」章节**互相印证**；冲突时以**用户最新口头/书面决策**为准，并应回写文档。

---

## 2. 当前发布原则

1. **修改完成后必须先验收**（功能、边界、截图或文案等，按任务约定）。  
2. **验收通过后才考虑 commit**；未完成验收不堆积「待定提交」。  
3. **commit 后不等于可以 push**；提交只表示本地已落盘。  
4. **push 前必须做最小发布检查**（见 §4）。  
5. **push 必须由用户明确确认**；AI 或执行者不得默认代 push。  
6. **push 到 `master` 会触发 Netlify 自动部署**（生产站点）。  
7. **不允许手动触发 Netlify deploy**，除非用户**单独**明确确认（例如紧急热修且已约定流程）。  
8. **push 后必须检查 Netlify Deploys** 页面或等价信息源。  
9. Netlify 部署状态应为 **Published**（或团队约定的等价成功态）。  
10. Netlify 上显示的 **部署 commit** 应与本次 **push 所携带的最新 commit** 一致（或落在本次推送的提交链上，无「旧代码新发」错觉）。  
11. **线上人工验收通过**后，本轮发布才算完成；再进入复盘与文档沉淀。

---

## 3. 标准发布流程

以下为推荐的标准流水线（角色名可按实际替换）：

1. **Cursor** 完成任务并返回结果（含 `git status`、构建结果等约定输出）。  
2. **ChatGPT** 做初步验收（对照任务书与项目规则）。  
3. **必要时 Codex** 审查（高风险、大范围或易越界改动）。  
4. **ChatGPT** 判断是否**建议** commit（文件范围、风险项对照）。  
5. **用户**确认可以 **commit**。  
6. **Cursor** 执行 `git commit`（信息清晰、范围与任务一致）。  
7. **commit 后**执行 `git status --short`，确认工作区干净或仅有预期未跟踪项。  
8. **ChatGPT** 判断是否进入 **push / 发布** 流程（是否已具备 push 前检查条件）。  
9. **push 前**执行 **最小检查**（§4）。  
10. **用户**明确确认可以 **`git push origin master`**。  
11. **Cursor** 执行 `git push origin master`（或用户指定的受控分支策略）。  
12. **push 后**再次 `git status --short`，确认本地干净。  
13. **用户**打开 Netlify **Deploys**，查看最新一次部署。  
14. 确认状态为 **Published**（或约定成功态）。  
15. 确认部署 **commit** 与本次 **push** 的 **HEAD** 一致（或符合本次推送批次）。  
16. **用户**做**线上人工验收**（关键路径、移动端、主要文案）。  
17. **ChatGPT** 生成本轮**收尾记录**（可选：更新规则文档、审计表中的「是否已固定」列）。

---

## 4. push 前最小检查

push 前至少执行（在仓库根目录）：

```bash
git status --short
git log --oneline -2
git diff --name-only HEAD~N..HEAD
git diff --stat HEAD~N..HEAD
```

**说明：**

- `git status --short`：**必须无输出**，表示无未提交改动、无不期望的未跟踪文件。  
- `git log --oneline -2`：用于快速确认**最近提交信息**与任务书一致（若本次推送含多个提交，可把 `-2` 改为 `-N`）。  
- `HEAD~N..HEAD`：其中的 **`N` 等于本次准备推送到远端的提交个数**。例如本地比远端多 **2** 个 commit，则使用 **`HEAD~2..HEAD`**。  
- `git diff --name-only` / `--stat`：确认改动文件列表**仅包含预期路径**，未混入例如 `package.json`、锁文件、`src/`、Netlify/GitHub Actions 配置、`.env` 等（除非本轮任务明示允许）。

**若任一步不符合预期：停止 push**，回到开发或拆分提交，直至检查通过且用户再次确认。

---

## 5. push 执行规则

**允许在「用户已明确确认 push」且 §4 检查通过后执行的命令示例：**

```bash
git status --short
git log --oneline -2
git push origin master
git status --short
```

**规则说明：**

1. **第一次** `git status --short`：确认工作区干净；有输出则**不执行** `git push`。  
2. `git log --oneline -2`：再次确认即将离开本地的最近提交信息（若本次推送多于 2 个 commit，可改为 `-N`）。  
3. **`git push origin master`**：为本项目当前约定的**默认**上线路径；若将来改为其它分支策略，须先更新本文件与 `AI_DEV_RULES.md` 并由用户确认。  
4. **第二次** `git status --short`：push 成功后本地仍应干净；若有意外未跟踪文件，应记录原因，避免下次误提交。  

**禁止（除非用户单独立项并书面/对话明确确认）：**

- `git push --force`、`git push -f` 等**强推**改写远端历史。  
- 推送到**非约定分支**却期望 Netlify 生产站点更新（易与 Netlify「部署分支」配置不一致）。  
- 在 push 前后**顺手** `git commit` 夹带未验收改动。  

---

## 6. Netlify 部署后检查清单

push 完成后，**用户**（或受权成员）在 Netlify **Deploys** 至少核对：

1. **最新一条**部署是否由本次 **Git 推送**触发（时间、触发源与分支）。  
2. 状态为 **Published**（或团队约定的绿色成功态）。  
3. 部署详情中的 **commit** 与本地 `git log -1` / GitHub 上 `master` **HEAD** 一致。  
4. **Build log** 末尾无未解释的 Error（必要时全文搜索 `error` / `failed`）。  
5. 若 Netlify 有 **Preview / Production** 多环境，确认检查的是**生产**站点。  

若任一项异常：**不要**在未定位原因前连续重复 push；先读日志、对照 §8。

---

## 7. 线上人工验收要点

生产站点 **Published** 之后，建议至少快速验收：

1. **首页可打开**，无白屏、无长时间转圈。  
2. **三种玩法入口**可切换，无明显布局崩坏（尤其手机宽度）。  
3. **各玩法各选一条最小路径**：能完成一次「输入 → 计算 → 出结果」；结果数值与本轮改动预期一致。  
4. **复制结果**按钮仍可用，粘贴文本可读。  
5. 若本轮改动了**错误提示 / 文案**，刻意触发一条轻量错误，确认提示友好、无英文堆栈外露。  

验收通过再在聊天或文档中标记「线上 OK」。

---

## 8. 失败、阻塞与回滚原则

| 情况 | 建议动作 | 禁止动作 |
|------|----------|----------|
| `git push` 被拒绝（权限、冲突、非 FF） | 保留终端完整输出；向用户说明；必要时先 `git fetch` 对照本地与远端 | 擅自 `--force`、擅自改远端保护规则 |
| Netlify **Build failed** | 只读 Build log；对照本次 `git diff` 文件列表；回到小步修复 | 未定位就大面积重构、手动点 Deploy「碰运气」 |
| Netlify **Published 但线上异常** | 浏览器硬刷新、无痕窗口复现；对照本次变更范围 | 立刻改 Netlify 环境变量 / Build 配置「试错」 |
| 确认线上坏版本需撤回 | 使用 GitHub **revert** 产生新 commit 或按团队回滚规范执行 | 强推删除历史、无记录地改生产文件 |

核心：**先证据、后小改；配置类变更永远高风控、要用户确认。**

---

## 9. 需用户单独立项的高风险操作

以下操作**默认不做**；若任务书未写明，须停止并向用户确认：

- 修改 Netlify：**Build command、Publish directory、部署分支、环境变量、域名、Deploy hooks、Plugins** 等。  
- 新增或修改 **GitHub Actions** workflow。  
- 在 Netlify / GitHub 上**手动触发**与本次 Git 记录不一致的生产部署。  
- 向仓库或 CI 写入 **`.env`、Token、私钥** 等秘密信息。  
- 修改 **`package.json` / 锁文件 / 依赖`** 作为「顺便修复部署」的手段。  

---

## 10. 文档维护与结论

- 本文件为 **V1.1 发布流程固定稿**；流程或分支策略变更时，应**更新对应章节**并在聊天中留一句「已同步 GITHUB_NETLIFY_RELEASE_FLOW」。  
- 与 `AI_DEV_RULES.md`（发布规则）、`LOBSTER_SYSTEM_RULES_AUDIT.md`（总控审计）、`REMOTE_AI_DEV_TOOL_STACK.md`（工具栈规划）**一起阅读**，避免只看单篇。  
- **结论**：遵守 §2–§9 时，GitHub 负责版本真相、Netlify 负责托管构建、人用检查清单收口，可把误发布、误配置、误强推的概率压到最低。

---

*文档版本：V1.1 发布流程固定稿（含 §1–§10）· 与 `AI_DEV_RULES.md`、`LOBSTER_SYSTEM_RULES_AUDIT.md`、`REMOTE_AI_DEV_TOOL_STACK.md` 配合使用*
