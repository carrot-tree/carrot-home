# Carrot Home

适用于 Obsidian 的单页首页，基于 Hearth 定制。将时钟、日历、书签、最近笔记、TaskNotes 看板和项目甘特图放在一个工作台中。

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

`src/home-base.js` 保留原有 Home 运行代码；`src/brat-bootstrap.js` 提供分享版初始化逻辑。`resources/` 仅包含经过整理的默认布局和虚构示例。

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
