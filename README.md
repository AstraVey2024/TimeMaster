# TimeMaster / OSA Timeline

企业项目时间轴编辑器。原生 HTML、CSS 和 JavaScript ES modules，无需安装第三方依赖或构建。

## 开发与验证

需要 Node.js 22+（测试）和 Python 3（本地静态服务器）。

```sh
node --test tests/*.test.mjs
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

浏览器访问 http://127.0.0.1:5173 。不要通过 file:// 直接打开 ES module 页面。

## 文件结构

- `dist/`：可直接托管的完整前端源文件。
- `tests/`：Node.js 回归测试；DOM harness 不等于真实浏览器验收。
- `AGENTS.md`：Codex 开发约定及检查命令。

公开仓库使用通用演示数据，不包含业务项目备份、浏览器数据或原托管站点绑定。

## 数据存储与迁移

浏览器 localStorage 保存当前草稿，IndexedDB 保存历史快照。本地 JSON 文件通过“本地项目”菜单打开、保存或下载。源码仓库不包含用户浏览器中的实时项目或附件数据。

切换网站域名会使用独立的浏览器存储。请先在旧网站导出 JSON，再在新环境导入。命名版本可随 JSON 携带；用户新建项目时旧项目以“新建项目前备份”TAG保留。目前尚未实现多项目列表。

## 当前能力与验证范围

时间轴、里程碑、时间段、分组、悬浮标签、批量格式、50层撤销、命名版本、本地文件操作、图片管理、导入检查、PDF/Excel/PNG导出、裁剪、透明背景。

最近验证：106项逻辑回归测试通过。真实浏览器交互和最终 PNG 视觉效果尚待验收。文件系统选择器需浏览器支持，兼容模式使用文件选择及下载。

## Codex 云端

在 Codex 中选择 `AstraVey2024/TimeMaster` 仓库及 `main` 分支。无需依赖安装；测试命令为 `npm test`（或上面的 node 命令）。应用没有后端服务。开发服务可用 `npm run dev`。
