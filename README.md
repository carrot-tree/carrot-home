# Carrot Home

适用于 Obsidian 的单页首页，基于 Hearth 定制。将时钟、日历、书签、最近笔记、TaskNotes 看板和项目甘特图放在一个工作台中。

## 仓库迁移状态（2026-10-29）

本仓库由已 Fork 的 `carrot-tree/carrothome` 改名而来，保留与 [ondreu/Hearth](https://github.com/ondreu/Hearth) 的 Fork 关系，已迁入 Carrot Home 2.0.1 代码。旧独立仓库保留在 [carrot-tree/carrot-home-legacy](https://github.com/carrot-tree/carrot-home-legacy)，旧 Release 与 Issue 等记录仍属于旧仓库。

**本次只迁移代码，尚未在新仓库发布 Release。** 下方 BRAT 安装与更新步骤须等本仓库提供对应 Release 和三个安装附件后才可用；根目录中的 2.0.1 代码不代表已发布版本。旧 1.1.3 安装附件仍可从[旧仓库 Release](https://github.com/carrot-tree/carrot-home-legacy/releases/tag/1.1.3)取得。

已有 BRAT 条目若跟踪 `carrot-tree/carrot-home`，现在会指向这个新 Fork；发布前无法从这里取得更新。固定旧版本的条目也无法在新仓库找到旧 Release。已安装的本地插件仍保留，可继续使用。待新 Release 单独确认发布后，再核对 BRAT 跟踪地址与版本；本次不改动已有库的 BRAT 配置或插件数据。

## 通过 BRAT 安装与更新

1. 在 Obsidian 社区插件中安装并启用 **BRAT**。
2. 在 BRAT 设置选择 **Add Beta plugin**，输入 `carrot-tree/carrot-home`。
3. 选择跟踪最新版本，添加后在社区插件列表启用 **Carrot Home**。

仓库地址：<https://github.com/carrot-tree/carrot-home>。BRAT 会检查本仓库的新 Release；开启 BRAT 的自动检查设置即可自动检查后续更新。固定历史版本时不会跟随最新版本。

## 配套插件

| 首页内容 | 需要的插件 |
| --- | --- |
| 项目甘特图 | [Carrot Gantt](https://github.com/carrot-tree/carrot-gantt)，通过 BRAT 添加 `carrot-tree/carrot-gantt` |
| 任务看板、任务日历 | 社区插件 **TaskNotes** |
| Dataview 查询卡片 | 社区插件 **Dataview**，按需启用其 JavaScript 查询 |
| 书签、白板、日记、录音 | 启用对应 Obsidian 核心插件 |

推荐同时安装 TaskNotes 与 Carrot Gantt，以显示完整的示例首页。依赖插件需要各自安装和启用，BRAT 添加本仓库时不会替你修改其他插件配置。

最低 Obsidian 版本：**1.12.2**。已验证桌面端；手机尚未完成真机验收。

## 首次打开

从侧边栏或命令面板打开 **Carrot Home**。新安装提供单个 Home 页面和六个板块，示例文件集中在 `Carrot Home 示例/`，包含 10 个虚构任务、3 个项目、1 条选题和使用说明。

- 示例日期在首次创建时设为当天附近，可编辑、删除或替换。
- 同路径已存在的笔记会保留，不覆盖其内容。
- 重载和更新保留已有设置与修改，不补回已删除的示例。
- 已有 Carrot Home 配置的库沿用现有布局，升级时不自动添加示例。
- 任务仍由 TaskNotes 管理；甘特图可跟随当前 Tasks 卡片的数据源。

云日历、微信读书等可选服务需要自行配置账号。此仓库不包含作者的笔记、账号凭据或个人 `data.json`。

## 手动安装与回滚

从 [Releases](https://github.com/carrot-tree/carrot-home/releases/latest) 下载三个独立附件 `main.js`、`manifest.json`、`styles.css`，放入 `.obsidian/plugins/carrot-home/`，重新加载插件。默认布局与示例已内置，无需其他资源文件。

升级前备份原插件目录，保留已有 `data.json`。回滚时恢复原插件文件；如需恢复显示偏好，可再恢复对应的设置备份。

## 构建与发布

`src/home-base.js` 保留原有 Home 运行代码；`src/tasks-workspace.js` 提供 Tasks 工作区；`src/brat-bootstrap.js` 提供分享版初始化逻辑。`resources/` 仅包含经过整理的默认布局和虚构示例。

Node.js 22 或以上运行：

```sh
node scripts/build-runtime.cjs
node --check main.js
node scripts/verify-release.cjs
node --test tests/*.test.cjs
```

构建将默认资源嵌入 `main.js`，使 BRAT 的三文件安装具备完整首页。测试在内存中验证新安装、升级、重载、文件保留和初始化失败重试，不访问真实笔记库。

发布新版时更新 `manifest.json`、`versions.json`、`resources/defaults.json` 中的 `lastSeenVersion`、`CHANGELOG.md` 和 `RELEASE_NOTES.md`，重新构建后提交。随后在 **Actions → Release plugin → Run workflow** 输入版本号，或推送同名版本标签。GitHub Actions 会验证构建、执行测试并上传三个 BRAT 安装附件。

标签与 manifest 版本完全一致，例如 `1.1.3`，不加 `v` 前缀。[BRAT 官方发布规范](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)。

## 署名与许可

基于 **Hearth** 定制，保留 [ondreu](https://github.com/ondreu) 的 MIT 许可证和原有 manifest 署名。此发行版由 [carrot-tree](https://github.com/carrot-tree) 维护，见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。

问题反馈请提交 [Issue](https://github.com/carrot-tree/carrot-home/issues)，注明 Obsidian、Carrot Home、TaskNotes 与 Carrot Gantt 版本，并使用虚构笔记说明复现步骤。

## Tasks 内容账号工作区（1.2.0）

TaskNotes 看板的筛选只影响这张卡片，不联动甘特图。账号和项目支持多选，同一维度内按任一匹配，不同维度之间同时满足。计划开始与截止分别筛选；本周从周一开始。

- 「⋯ → 管理内容账号」添加或改名；「设置项目账号」设置项目归属。
- 点击任务卡片底部账号标签，可选择继承项目，或明确指定账号；明确不选表示未分配。
- 多个关联项目的账号取并集，每条任务只计一次。筛选不会补写旧笔记。
- 「工作视图」保存筛选、排序和完成项显示；调整后显示“已修改”，只有显式更新才覆盖原视图。搜索词不保存。
- 新建窗口支持账号、项目、状态、优先级和日期；仍可从更多菜单打开 TaskNotes 完整新建窗口。

账号目录保存在 Home 设置的 `contentAccounts`，任务／项目使用 `content_accounts` 数组关联稳定账号 ID。字段缺失代表继承；空数组代表明确未分配。工作视图保存在对应 Tasks 卡片的 `workspace`。账户目录只需在本地添加，不包含在公开默认数据中。

## Tasks 工作区（2.0.1）

筛选栏合并了任务数量、卡片大小和“显示已完成”，搜索框宽度为 160px。窄区域自动换行，任务内容始终在卡片内部滚动。

清单以紧凑任务行显示：标题下方集中排列项目、日期、状态和账号，日期编辑按钮保持在右侧。看板的卡片大小选择不改变清单密度。

- 快捷聚焦提供“全部／待办／今天／逾期／未排期”，与当前账号、项目、搜索及其他筛选共同生效。重复点击当前聚焦会回到“全部”，不会清除其他条件。
- “今天”包括今天计划或今天截止的未完成任务；循环任务使用当前实例日期。“逾期”按截止日期／时间判断。“未排期”指没有计划开始时间，任务仍可能有截止时间。
- “清单”按已逾期、今天、待跟进、未来 7 天、以后、无日期、已完成分组；分组优先判断逾期和今天，其余按较早的有效日期判断。默认组内按日期排序，也支持筛选面板中的指定排序。清单保留 TaskNotes 的任务操作，拖动清单行不会修改状态。
- 看板与清单的展示选择、卡片大小独立于常用视图。常用视图可保存快捷聚焦；清除筛选保留排序、展示方式和卡片大小。
- 当前会话分别保留两种视图的滚动位置，任务更新不会跳回顶部；更换筛选范围后从顶部开始。

升级不迁移或批量回写历史任务。旧账号、常用视图、卡片大小和其他设置继续有效；设置写入失败会提示并回退到修改前状态。
