# LemonRiver

**给 Agent 用的幻灯片框架。** 一句话说清你要的幻灯片，先看大纲、点头之后，让 Agent 一页一页排出来，最后直接演示或者导出。

[English](README.md) · 简体中文

![LemonRiver](apps/web/public/assets/screenshots/lemonriver-cover.webp)

每一页都渲染在固定的 **1920 × 1080** 画布上。页面就是普通的 React 组件，Agent 写的是真代码，不是往模板里填空。

## 特性

### 一句话就能开始

说说这份幻灯片讲什么，或者加上要依据的 PDF、Word、Excel、PowerPoint 文件，它会先列一份大纲给你看。你改到满意再开始排版。排版是一页一页做的，旁边有团队面板显示谁在做什么；随时能暂停，之后接着做，也能一路撤销回大纲。幻灯片里的数字和你给的文件对不上时，它会停下来问用哪个。

### 用你已经在用的 Agent

Claude Code、Codex、WorkBuddy 都能从浏览器里的 Agent 面板驱动整份幻灯片：新建会话、看着它干活、回答它的问题、中途叫停、离开再回来。面板默认跟着你客户端自己的模型和设置走，和在终端里用是同一个体验。

### 整份幻灯片一眼看完

故事看板把每一页按章节铺开。拖动排序、增删章节、把章节折叠起来、一次选中多张卡、筛选、撤销都支持。大纲和看板是同一份东西，改了一边另一边就跟着变。

### 在浏览器里直接改

切到评论模式，点任意元素、或者框选一块区域，写下你的意见。意见会一直挂在它指的那块内容旁边，等 Agent 处理；面板里点一下就能把所有待处理的意见一次改完。也可以选中元素，用一句话说清要怎么改。

### 用久了也不乱

四套主题：跟随系统、清爽白、夜间果园、青柠沉浸。删掉的幻灯片在回收站里留 30 天，点错了也能捞回来。有新版本时应用里会提示，点一下就能更新。

### 演示和导出

全屏演示，带演讲者视图：当前页和下一页、备注、计时器。导出可以是静态 HTML 网站、适合打印的 PDF，也可以是文字还能继续编辑的 PowerPoint。

## 上手

```bash
npx @lemonriver/cli init my-slide --use-pnpm
cd my-slide
pnpm dev
```

init 会顺手把依赖装好（npm、pnpm、yarn、bun 都支持，加 `--no-install` 就跳过）。打开终端里显示的地址，点「新幻灯片」，告诉 Agent 这份幻灯片讲什么。之后的每一步都在浏览器里完成。

## 仓库结构

这是一个 pnpm + Turbo 的 monorepo。

| 路径 | 说明 |
| --- | --- |
| [packages/core](packages/core) | `@lemonriver/core` —— 运行时（首页、幻灯片查看器、故事看板、演示模式、编辑检查器）、Vite 插件，以及 `lemonriver` 的 dev/build/preview 命令。 |
| [packages/cli](packages/cli) | `@lemonriver/cli` —— `npx @lemonriver/cli init` 脚手架和工作区模板。 |
| [apps/demo](apps/demo) | 示例工作区，用的是本仓库里的 `@lemonriver/core`，开发框架时跑它。 |

## 开发

```bash
pnpm install
pnpm dev      # 用本地 @lemonriver/core 跑 demo
pnpm build    # 构建所有包
pnpm check    # 用 biome 检查和格式化
pnpm test     # 跑 vitest
```

## 和 open-slide 的关系

LemonRiver 从 [open-slide](https://github.com/1weiho/open-slide) fork 出来，并把它的 `upstream` 持续合并进来。改名之前建的工作区照旧能用，不用改任何东西。

## License

MIT，原版权声明保留在 [LICENSE](LICENSE) 里。
