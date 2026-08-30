# 影渠

从 Telegram 电影频道提取影视资源信息，去重后汇总成可搜索片库。

不一定要在 my.telegram.org 创建应用程序。Mac 上已经登录 Telegram 时，优先用桌面版官方导出的 `result.json`；公开频道也可以直接填用户名。账号授权是可选项，验证码会出现在桌面版官方账号对话里。

本工具只做索引与汇总，不下载、不托管视频文件。请只处理你有权查看的频道，并遵守当地法律与版权规定。

## 能做什么

- 用已登录的 Telegram 账号读取你加入的频道（含无私密预览的频道）
- 导入 Telegram 桌面版 JSON/HTML 导出
- 添加公开频道用户名，抓取 t.me/s 网页预览
- 粘贴频道帖子原文
- 按类型、年份、画质、来源、频道筛选
- 同一部影片的多频道版本合并到一张卡片
- 汇总页用表格列出全部影片字段，支持搜索
- 导出 JSON / CSV / Excel（影片汇总 + 版本明细两个工作表）
- 首次打开带有演示片库

## 本地运行

需要 Node.js 20+。在项目目录里安装并启动（不要在上层 `code` 目录执行）：

```bash
cd ~/Desktop/code/tele
rm -rf node_modules .next
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:43141](http://127.0.0.1:43141)。

Mac 上如果出现 `@next/swc-darwin-arm64` 损坏或 Turbopack 不可用，多半是 `node_modules` 不完整，或上层目录有多余的 `package-lock.json`。删掉依赖后在 **tele** 目录重新 `npm install`。开发脚本已改用 Webpack，不依赖 Turbopack 原生绑定。

如果提示 lockfile 在 `/Users/你的用户名/Desktop/code`：

```bash
rm -f ~/Desktop/code/package-lock.json ~/Desktop/code/package.json
```

```bash
npm test
npm run build
```

### 创建不了应用程序时

[my.telegram.org/apps](https://my.telegram.org/apps) 点「Create application」报 ERROR、空白或没反应很常见。影渠**不依赖**这一步。

1. Mac Telegram → 设置 → 高级 → 导出 Telegram 数据
2. 格式选 JSON，只勾选电影频道
3. 把每个频道目录中的 `result.json` 拖进「频道 → 桌面导出」

若仍想用账号登录，先打开 `/apps` 看是否已经有 api_id（每个账号通常只能有一个应用）。新建时：名称用英文、短名称只要字母数字、平台选 Desktop、关掉翻译插件和 VPN 再试。

### 可选：把 API 凭证写进环境变量

1. 用与 Mac Telegram **相同的手机号**打开 [my.telegram.org/apps](https://my.telegram.org/apps)
2. 若已有应用，直接复制 api_id / api_hash；没有的再创建
3. 复制 `.env.example` 为 `.env.local`，填入 `TELEGRAM_API_ID` 和 `TELEGRAM_API_HASH`

不填也可以。创建不了就用桌面导出。

## 使用说明（Mac 已登录 Telegram）

**推荐：桌面导出（不需要创建应用）**

1. 打开影渠「频道」→「桌面导出」
2. Mac Telegram → 设置 → 高级 → 导出 Telegram 数据
3. 格式选 JSON，勾选电影频道
4. 把 `result.json` 拖进页面

**可选：账号授权**

1. 打开「频道」→「已登录账号」
2. 填写 api_id / api_hash（若未配置环境变量）和带区号的手机号
3. 点「发送验证码到 Telegram」，回到 Mac 桌面版，在与 **Telegram 官方账号** 的对话里复制数字
4. 若开启了两步验证，再填云密码
5. 登录成功后会列出你加入的频道，点「提取」即可写入片库

这会在 Telegram 里多一台名为 Yingqu 的设备，可随时在 **设置 → 设备和会话** 里注销。

## 限制

- 账号登录需要向 Telegram 申请自己的 API ID/Hash，影渠不会替你保管密码。
- 网页预览只能读公开频道。
- 解析依赖帖子写法，广告和纯新闻会被跳过。
- 不会下载视频文件。
