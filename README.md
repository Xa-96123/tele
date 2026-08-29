# 影渠

从 Telegram 电影频道提取影视资源信息，去重后汇总成可搜索片库。

Mac 上已经登录 Telegram 时，优先用账号授权：验证码会出现在桌面版官方账号对话里。也可以导入桌面版官方导出的 `result.json`，或读取公开频道的网页预览。

本工具只做索引与汇总，不下载、不托管视频文件。请只处理你有权查看的频道，并遵守当地法律与版权规定。

## 能做什么

- 用已登录的 Telegram 账号读取你加入的频道（含无私密预览的频道）
- 导入 Telegram 桌面版 JSON/HTML 导出
- 添加公开频道用户名，抓取 t.me/s 网页预览
- 粘贴频道帖子原文
- 按类型、年份、画质、来源、频道筛选
- 同一部影片的多频道版本合并到一张卡片
- 导出 JSON / CSV
- 首次打开带有演示片库

## 本地运行

需要 Node.js 20+。

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:43141](http://127.0.0.1:43141)。

```bash
npm test
npm run build
```

### 可选：把 API 凭证写进环境变量

1. 用与 Mac Telegram **相同的手机号**打开 [my.telegram.org](https://my.telegram.org)
2. 进入 API development tools，创建一个应用
3. 复制 `.env.example` 为 `.env.local`，填入 `TELEGRAM_API_ID` 和 `TELEGRAM_API_HASH`

不填也可以，界面里手动输入即可。

## 使用说明（Mac 已登录 Telegram）

1. 打开影渠「频道」→「已登录账号」。
2. 填写 api_id / api_hash（若未配置环境变量）和带区号的手机号。
3. 点「发送验证码到 Telegram」，回到 Mac 桌面版，在与 **Telegram 官方账号** 的对话里复制数字。
4. 若开启了两步验证，再填云密码。
5. 登录成功后会列出你加入的频道，点「提取」即可写入片库。

这会在 Telegram 里多一台名为 Yingqu 的设备，可随时在 **设置 → 设备和会话** 里注销。

### 不想授权时：导出聊天

1. Mac Telegram → 设置 → 高级 → 导出 Telegram 数据
2. 格式选 JSON，勾选电影频道
3. 把每个频道目录中的 `result.json` 拖进「桌面导出」

## 限制

- 账号登录需要向 Telegram 申请自己的 API ID/Hash，影渠不会替你保管密码。
- 网页预览只能读公开频道。
- 解析依赖帖子写法，广告和纯新闻会被跳过。
- 不会下载视频文件。
