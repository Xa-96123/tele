import { mergeTitles } from "@/lib/catalog";
import { parsePostToTitle } from "@/lib/parser";
import type { ChannelPost, ChannelRecord, TitleRecord } from "@/lib/types";

const NOW = "2026-03-12T09:00:00.000Z";

function demoPoster(title: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240" viewBox="0 0 180 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue} 32% 30%)"/><stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 36% 12%)"/></linearGradient></defs><rect width="180" height="240" fill="url(#g)"/><text x="16" y="210" fill="white" fill-opacity=".9" font-size="42" font-family="serif">${title.slice(0, 1)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function post(
  channel: string,
  id: number,
  text: string,
  postedAt: string,
  photoUrl?: string,
): ChannelPost {
  return {
    channel,
    messageId: id,
    postUrl: `https://t.me/${channel}/${id}`,
    postedAt,
    text,
    photoUrl,
    hrefs: [],
  };
}

const DEMO_POSTS: ChannelPost[] = [
  post(
    "demo_cine_4k",
    1201,
    `《沙丘2》 Dune: Part Two
年份：2024
类型：科幻/冒险
导演：丹尼斯·维伦纽瓦
主演：提莫西·查拉梅、赞达亚
豆瓣：8.3
IMDb：8.6
画质：2160p BluRay HDR 杜比视界
大小：42.6 GB
简介：保罗·厄崔迪踏上预言之路，在弗雷曼人中崛起。
夸克网盘：https://pan.quark.cn/s/demo-dune2
阿里云盘：https://www.alipan.com/s/demo-dune2`,
    "2026-03-10T11:20:00.000Z",
    demoPoster("沙", 28),
  ),
  post(
    "demo_cine_4k",
    1198,
    `🎬 奥本海默 Oppenheimer (2023)
⭐ 豆瓣 8.8  IMDb 8.3
📀 1080p WEB-DL
💾 12.4 GB
🎭 传记 / 历史 / 剧情
导演：克里斯托弗·诺兰
简介：美国原子弹计划负责人的崛起与审判。
百度网盘：https://pan.baidu.com/s/demo-oppenheimer`,
    "2026-03-08T08:10:00.000Z",
    demoPoster("奥", 18),
  ),
  post(
    "demo_cine_4k",
    1182,
    `【电影】《寄生虫》 Parasite (2019)
类型：剧情/喜剧/犯罪
豆瓣：8.8
画质：1080p BluRay
大小：8.7 GB
导演：奉俊昊
夸克：https://pan.quark.cn/s/demo-parasite`,
    "2026-02-22T16:40:00.000Z",
    demoPoster("寄", 8),
  ),
  post(
    "demo_cine_4k",
    1170,
    `《疯狂的石头》(2006) 1080p
类型：喜剧/犯罪
豆瓣：8.5
大小：2.1 GB
简介：重庆小工厂保卫翡翠展品的荒诞闹剧。
https://pan.quark.cn/s/demo-crazy-stone`,
    "2026-02-18T02:15:00.000Z",
    demoPoster("疯", 42),
  ),
  post(
    "demo_cine_4k",
    1164,
    `千与千寻 Spirited Away (2001)
动画电影
豆瓣 9.4
1080p BluRay 4.8 GB
https://www.alipan.com/s/demo-chihiro`,
    "2026-02-01T19:00:00.000Z",
    demoPoster("千", 160),
  ),
  post(
    "demo_series_vault",
    88,
    `【剧集】《漫长的季节》 第一季
年份：2023
类型：剧情/犯罪/悬疑
豆瓣：9.4
更新至全12集
1080p WEB-DL 18.6 GB
主演：范伟、秦昊、陈明昊
简介：一场十八年的凶案，把三个家庭重新拧在一起。
夸克网盘：https://pan.quark.cn/s/demo-season`,
    "2026-03-11T04:30:00.000Z",
    demoPoster("漫", 200),
  ),
  post(
    "demo_series_vault",
    76,
    `三体 第1季 (2023)
剧集 / 科幻
豆瓣 8.7
全30集
2160p WEB-DL HDR
大小：56.2 GB
https://www.alipan.com/s/demo-santi
https://pan.quark.cn/s/demo-santi`,
    "2026-03-04T13:12:00.000Z",
    demoPoster("三", 210),
  ),
  post(
    "demo_series_vault",
    61,
    `【动漫】《葬送的芙莉莲》 第一季
2023
类型：动漫/奇幻/冒险
豆瓣 9.0
全28集
1080p WEB-DL
https://pan.quark.cn/s/demo-frieren`,
    "2026-02-27T09:45:00.000Z",
    demoPoster("葬", 265),
  ),
  post(
    "demo_series_vault",
    44,
    `纪录片《地球脉动 第三季》 Planet Earth III (2023)
BBC
4K WEB-DL
全8集 31.0 GB
https://www.alipan.com/s/demo-earth`,
    "2026-02-12T21:05:00.000Z",
    demoPoster("地", 145),
  ),
  post(
    "demo_cine_4k",
    1150,
    `《周处除三害》(2023)
动作/犯罪
豆瓣 8.1
1080p WEB-DL 6.3GB
https://pan.baidu.com/s/demo-chuhai`,
    "2026-01-30T07:22:00.000Z",
    demoPoster("周", 350),
  ),
  post(
    "demo_series_vault",
    30,
    `欢迎订阅本频道，广告合作请私信。进群交流：https://t.me/demo_series_vault`,
    "2026-01-02T00:00:00.000Z",
  ),
];

export function buildDemoCatalog(): {
  channels: ChannelRecord[];
  titles: TitleRecord[];
} {
  const titles = mergeTitles(
    DEMO_POSTS.map((item) =>
      parsePostToTitle(
        item,
        item.channel === "demo_cine_4k" ? "演示·高清电影" : "演示·剧集仓库",
      ),
    ).filter((t): t is TitleRecord => Boolean(t)),
  );

  const channels: ChannelRecord[] = [
    {
      username: "demo_cine_4k",
      title: "演示·高清电影",
      description: "本地演示频道，帖子格式来自常见中文影视频道。",
      isDemo: true,
      addedAt: NOW,
      lastSyncedAt: NOW,
      postCount: DEMO_POSTS.filter((p) => p.channel === "demo_cine_4k").length,
      resourceCount: titles.filter((t) =>
        t.editions.some((e) => e.channel === "demo_cine_4k"),
      ).length,
      status: "idle",
    },
    {
      username: "demo_series_vault",
      title: "演示·剧集仓库",
      description: "本地演示频道，含剧集、动漫与纪录片帖子。",
      isDemo: true,
      addedAt: NOW,
      lastSyncedAt: NOW,
      postCount: DEMO_POSTS.filter((p) => p.channel === "demo_series_vault")
        .length,
      resourceCount: titles.filter((t) =>
        t.editions.some((e) => e.channel === "demo_series_vault"),
      ).length,
      status: "idle",
    },
  ];

  return { channels, titles };
}

export const DEMO_IMPORT_SAMPLE = `《沙丘2》 Dune: Part Two (2024)
豆瓣 8.3
2160p BluRay 42.6GB
https://pan.quark.cn/s/demo-dune2

---

【剧集】漫长的季节 第一季 (2023)
豆瓣 9.4 全12集
1080p WEB-DL
https://www.alipan.com/s/demo-season`;
