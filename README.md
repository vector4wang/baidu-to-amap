```
  _           _     _       ___
 | |         (_)   | |     |__ \
 | |__   __ _ _  __| |_   _   ) |__ _ _ __ ___   __ _ _ __
 | '_ \ / _` | |/ _` | | | | / // _` | '_ ` _ \ / _` | '_ \
 | |_) | (_| | | (_| | |_| |/ /| (_| | | | | | | (_| | |_) |
 |_.__/ \__,_|_|\__,_|\__,_|____\__,_|_| |_| |_|\__,_| .__/
                                                     | |
                                                     |_|
```

# baidu-to-amap

**百度地图收藏夹 → 高德地图收藏夹 一键迁移工具**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Powered by Playwright](https://img.shields.io/badge/Powered%20by-Playwright-45ba63.svg)](https://playwright.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey.svg)]()
[![Success Rate](https://img.shields.io/badge/%E5%AE%9E%E6%B5%8B%E6%88%90%E5%8A%9F%E7%8E%87-708%2F708-red.svg)]()
[![GitHub Stars](https://img.shields.io/github/stars/vector4wang/baidu-to-amap?style=social)](https://github.com/vector4wang/baidu-to-amap)

百度和高德的收藏夹互不开放，官方没有迁移通道。本工具用「导出 → 清洗 → 网页版自动化收藏」三步，把百度收藏的几百个点**全自动**搬进高德收藏夹（实测 708/708 零失败）。

```
百度收藏导出CSV ──► clean.js 清洗去重转坐标 ──► collect.js 自动收藏 ──► 高德App收藏夹 ⭐
```

## 为什么不用别的方法（全是坑，已实测）

| 方法 | 结论 |
|---|---|
| 高德App「收藏夹批量导入」 | ❌ 不存在。网上教程均为AI水文以讹传讹 |
| KML/GPX/TXT导入高德收藏夹 | ❌ 不存在，同上 |
| GitHub `2van/baidumap-to-amap` 脚本 | ❌ 2021年停更，接口已失效 |
| 高德「工作地图」批量导入 | ⚠️ 能批量上图，但点在小程序里，**主地图看不到**，不是收藏夹 |
| **本工具：高德网页版自动收藏** | ✅ 官方支持（网页版收藏与App云同步），真进收藏夹、主地图可见 |

## 环境要求

- Node.js ≥ 18
- 本机安装 Google Chrome（脚本会自动检测；Edge/Chromium 兜底）
- 一个高德账号（首次用手机高德App扫码登录一次）

## 第一步：从百度地图导出收藏

百度官方也不提供导出，用社区工具（纯前端运行，数据不出本机）：

1. 电脑浏览器打开 [map.baidu.com](https://map.baidu.com) 并登录
2. 打开 [地图收藏夹位置提取工具](https://collection.aitiancheng.com/mapfav/)
3. 按页面说明用「书签小工具」抓取数据 → 粘贴 → 提取位置 → **转换坐标（BD09→GCJ02）** → 导出Excel
4. 把Excel另存为 CSV（UTF-8）

> 超过500个点时该工具需要你自备百度地图开放平台AppKey（免费申请）。

导出格式参考 `points.example.csv`：需含 `名称,地址,经度,纬度` 表头（列名也支持 name/lng/lat/addr 等常见变体）。

## 第二步：清洗（可选但建议）

```bash
node src/clean.js 百度收藏.csv -o points.csv
```

清洗规则（保守，只删脏数据）：

- 剔除空白行、无名称行
- 剔除无坐标/坐标不可解析的行
- 剔除坐标超出中国范围的行
- 按「名称+坐标(5位小数)」去重 —— 同名不同地（连锁店、手动图钉）**不算重复，会保留**

如果导出时**没做坐标转换**（拿到的是百度BD-09坐标），加 `--from bd09`；如果是百度墨卡托大数坐标，加 `--from bd09mc`：

```bash
node src/clean.js 百度收藏.csv -o points.csv --from bd09
```

## 第三步：自动收藏

```bash
npm install
node src/collect.js points.csv
```

1. 脚本会打开 Chrome 并进入 amap.com
2. **用手机高德App扫码登录**（检测到登录态后自动开始；也可以在项目目录建一个名为 `LOGIN_OK` 的空文件立即放行）
3. 之后全程无人值守：逐个点开坐标页 → 点⭐收藏 → 云端同步到手机

跑完后失败名单在 `failed.txt`，日志在 `run.log`。

### 常用参数

| 参数 | 说明 |
|---|---|
| `--start N` | 从第N条开始（断点续跑，0-based） |
| `--limit N` | 只处理N条（先试跑验证） |
| `--interval ms` | 每个点的间隔，默认2500ms |
| `--headless 1` | 无头模式（不弹窗口，需已登录过） |

### 建议节奏

```bash
node src/collect.js points.csv --limit 10   # 先试跑10个，确认按钮能点上
node src/collect.js points.csv --start 10   # 没问题后从第10条续跑全量
```

> ⚠️ **已收藏的点重复点击会取消收藏**。脚本会检测「已收藏」并跳过，但跨次运行时仍建议用 `--start` 跳过已完成的区段。

## 工作原理

高德官方网页版（amap.com）的「收藏」功能与手机App收藏夹**云端同步**（[官方说明](https://www.amap.com/ssr/doc/favorite)）。工具用 [Playwright](https://playwright.dev/) 驱动本机 Chrome：

1. 打开 `https://uri.amap.com/marker?position=经度,纬度&name=名称`（官方URI，按坐标精确落点，不用搜索）
2. 点击详情卡的⭐收藏按钮
3. 验证页面出现「已收藏」后处理下一个点
4. 每个点间隔2.5-4秒随机，模拟正常操作节奏

登录态保存在项目目录的 `pw-profile/` 里，一次扫码长期有效。

## FAQ

**Q：收藏后能分文件夹吗？**
网页版收藏没有分组功能，全部进「默认收藏夹」。收完后可在App的收藏夹里批量管理、移动到各文件夹。

**Q：会封号吗？**
工具操作的是你自己的账号、你自己的数据，通过官方网页的正常点击路径，节奏也做了限速。仅供个人数据迁移用途。

**Q：坐标系问题？**
高德用 GCJ-02（火星坐标）。如果导入后点整体偏移几百米，说明你的源数据是百度BD-09坐标，清洗时加 `--from bd09` 重新生成。

**Q：中途失败/中断怎么办？**
看 `run.log` 最后一行成功的序号，用 `--start N` 接着跑；失败的会汇总在 `failed.txt`。

## 免责声明

本项目仅供个人数据备份与迁移的学习用途，与百度、高德官方无关。请遵守相关平台的服务条款，勿用于批量注册、爬取数据等违规场景。

## License

MIT
