Carrot Home 2.1.3 将右侧专注区域改成独立圆形计时盘，保留主页原有布局，并修正搜索区缩小时被过度挤压的问题。

- **圆形计时盘**：去掉长方形底板，任务名放下方，播放/暂停按钮嵌在圆盘边缘；倒计时与圆环进度来自同一个真实 TaskNotes 会话。
- **向右收起**：右侧双箭头沿用左侧便签按钮的造型，使用专注主题色；收起后留下真实倒计时胶囊，点击即可展开，计时持续，折叠状态会保存。
- **操作更集中**：换任务、确认结束、时长和 TaskNotes 原生面板入口集中在圆盘“…”中，原任务标题仍可打开原笔记。
- **搜索更好用**：三栏模式中间整组保持至少 480px；空间不足时两侧改为紧凑入口。快捷分类保持方形，放不下时横向滚动，不再挤成细条。
- 便签 Markdown、顺序、草稿、原有专注选择和首页卡片布局保持；完整显隐开关仍在主页原有“…”菜单与设置页。

### 圆盘展开

![圆形专注计时盘与主题色双箭头](https://raw.githubusercontent.com/carrot-tree/carrot-home/2.1.3/docs/images/focus-dial-expanded.png)

### 向右收起

![收起后保留真实倒计时和展开入口](https://raw.githubusercontent.com/carrot-tree/carrot-home/2.1.3/docs/images/focus-dial-folded.png)

图片来自独立桌面测试库的实际插件界面，使用虚构示例内容；PNG 为效果图，无需安装。

升级前备份插件目录，只替换 `main.js`、`manifest.json`、`styles.css` 后重载 Carrot Home，保留 `data.json`、`top-area.json`、备份与所有 Markdown。无需重启 TaskNotes。

94 项自动化测试通过；独立桌面实际验证开始、暂停、继续、菜单结束/取消、折叠/展开、重载保持同一会话，以及九档宽度的快捷图标与搜索区域。当前圆盘版另验收了实际圆按钮和菜单收放；未重新完成全套长休息到时、移动真机、其它 TaskNotes 版本或系统休眠专项测试。
