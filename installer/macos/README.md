# macOS 安装包

给终端用户用的 `.dmg`：拖进「应用程序」就装好，不用先装 Node，也不用拉代码。

## 构建

```bash
pnpm installer:mac
```

产物在 `installer/macos/out/LemonRiver-<core版本>-arm64.dmg`，不入库。

构建做的事：

1. 从 npmmirror 拉官方 Node 22 LTS 的 darwin-arm64 包，用官方 `SHASUMS256.txt` 校验后放进 app。
   包缓存到 `installer/macos/.cache/`，重复构建不再下载。
2. 用本仓库的 `@lemonriver/cli init` 建一份工作区，连 `node_modules` 一起装好
   （`@lemonriver` 走 npmjs，其它走 npmmirror），放进 app。
3. 用 Playwright 把 `app-icon.svg` 渲成 1024 PNG，`sips` 出各尺寸，`iconutil` 打成 icns。
4. `osacompile` 编 AppleScript 启动器成 `LemonRiver.app`，把上面几样塞进 `Contents/Resources/`。
5. ad-hoc 签名（`codesign -s -`），然后 `hdiutil create` 出 dmg。

依赖：`pnpm`、Playwright 的 Chromium（`pnpm --filter @lemonriver/core exec playwright install chromium`）、
macOS 自带的 `osacompile` / `sips` / `iconutil` / `hdiutil` / `codesign`。

## 安装

打开 dmg，把 `LemonRiver` 拖到旁边的「应用程序」，**从「应用程序」里打开**。
直接在安装盘里双击是不行的：那时的路径在 `/Volumes/` 下或者一个随机的临时目录里，
初始化会把桌面快捷方式、程序坞图标和后台服务指到一个过会儿就消失的位置，所以 App 会拒绝并提示先拖进去。

**第一次打开要走系统的放行流程**：包是 ad-hoc 签名的，没做公证，Gatekeeper 会拦。
macOS 15 起「右键 → 打开」已经不放行没公证的 App，正确做法是：

1. 双击一次，弹出拦截提示，点「完成」。
2. 打开「系统设置 → 隐私与安全性」，拉到「安全性」那一栏，点「仍要打开」。
3. 输入开机密码确认，再点一次「打开」。

用户没有 Apple 开发者账号；以后换成 Developer ID 签名 + 公证，这三步就不需要了。

第一次打开会做一次性初始化：工作区复制到 `~/LemonRiver`、桌面建快捷方式、加进程序坞、
装一个用户级 launchd 任务 `com.lemonriver.app`（端口从 5273 起，被占就试到 5279）。

之后每次点开：服务没跑就启动、等页面能访问再打开浏览器；已经在跑就弹「打开页面 / 停止服务 / 取消」。
再点一次不会重复建工作区、桌面快捷方式或程序坞图标。

## 行为

| 位置 | 说明 |
| --- | --- |
| `~/LemonRiver` | 工作区。已存在就不动。 |
| `~/Desktop/LemonRiver.app` | 桌面快捷方式（Finder 替身）。 |
| 程序坞 | 没有才加，加完重启 Dock。 |
| `~/Library/Application Support/LemonRiver/state.json` | 是否初始化过、用的端口。 |
| `~/Library/LaunchAgents/com.lemonriver.app.plist` | 用户级 launchd 任务。 |
| `~/Library/Logs/LemonRiver/` | 服务日志。 |

## 只在这台机器上测试时

以下环境变量把会碰真实环境的地方改到别处，测试一律走临时目录：

| 变量 | 作用 |
| --- | --- |
| `LEMONRIVER_HOME` | 当 `HOME` 用。工作区、桌面、LaunchAgents、日志全在它下面。 |
| `LEMONRIVER_DOCK_PLIST` | Dock 的 plist 路径（默认 `com.apple.dock`）。 |
| `LEMONRIVER_DRY_DOCK=1` | 完全不碰程序坞。 |
| `LEMONRIVER_RELOAD_DOCK=0` | 改了 Dock 但不重启它。 |
| `LEMONRIVER_DRY_DESKTOP=1` | 桌面快捷方式用符号链接，不调 Finder。 |
| `LEMONRIVER_DRY_LAUNCHD=1` | 不装 launchd 任务，服务由 `start.sh` 前台拉起、用 pid 文件管。 |

`app/setup.sh` 和 `app/start.sh` 都读这些变量。

## 还没做

- Intel（x64）：现在只出 arm64。要做就按架构各下一份 Node、各出一份 `node_modules`。
- 正式签名和公证：需要 Apple 开发者账号。
- 自动更新：现在靠工作区里的「立即更新」，用的是 app 自带的 npm。
