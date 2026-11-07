Carrot Home 2.1.2 将左侧便签改为真正沿绳子向左收拢，收好后留下固定钉上的一小段单圈绳，点击单圈即可向右展开。

- 保留已选定的木夹、细麻绳和奶油纸样式；收起后使用简洁单圈，不是多层盘绳。
- 单圈本身就是展开入口，支持鼠标和键盘；折叠内容退出焦点顺序。
- 折叠与整个区域的显隐开关独立；不改变原首页布局、便签顺序与原文，也不操作 TaskNotes 会话。
- 设置和区域显示恢复仍在原有主页右上角“…”菜单及“设置 → Carrot Home → 顶部工具”。此前手动隐藏的区域可从这里重新显示。

### 展开状态

![展开：木夹、细麻绳和便签](https://github.com/carrot-tree/carrot-home/releases/download/2.1.2/sticky-notes-expanded.png)

### 向左收起

左端只留固定钉与单圈短绳；点击绳圈向右展开。

![收起：点击左侧单圈展开](https://github.com/carrot-tree/carrot-home/releases/download/2.1.2/sticky-notes-folded.png)

图片为独立桌面预览库的真实界面，使用虚构示例内容。

升级前备份插件目录，仅替换 `main.js`、`manifest.json`、`styles.css` 后重载 Carrot Home。保留 `data.json`、`top-area.json`、备份及所有笔记；两张 PNG 只是效果图，无需安装。

92 项自动化测试通过，独立预览中真实鼠标连续收起、展开、再收起均可命中展开入口，便签数据保持；正式桌面库亦已验证单圈收起/展开，原有番茄钟持续运行。移动端真机及其它 TaskNotes 版本未补充专项验收。
