# IndexNow for openRin

一个 Cloudflare Worker，用于自动将 openRin 博客的新文章和更新文章提交到 IndexNow，提升搜索引擎收录效率。

## 功能特性

- ✅ **自动定时执行**：每天北京时间 0:00（UTC 16:00）自动检查并提交
- ✅ **智能追踪**：使用 KV 存储记录已提交的 URL 和更新时间，避免重复提交
- ✅ **固定页面支持**：首页、时间线、瞬间、标签、友链、关于页面每周自动提交
- ✅ **Webhook 通知**：每次执行后发送通知，包含提交数量和时间戳
- ✅ **前端管理界面**：浅色主题，显示执行状态、日志和统计信息
- ✅ **日志保留**：自动保留 31 天的执行日志

## 部署步骤

### 1. 准备工作

确保你已经：
- 注册了 [IndexNow](https://www.indexnow.org/) 并获取 API Key
- 在你的博客域名根目录放置了密钥验证文件（`{API_KEY}.txt`）
- 创建了 Cloudflare D1 数据库（openRin 使用的数据库）
- 创建了 Cloudflare KV Namespace

### 2. 配置环境变量

在 Cloudflare Dashboard 或 wrangler.toml 中设置以下变量：

```bash
# IndexNow API 密钥（不含 .txt 后缀）
wrangler secret put INDEXNOW_API_KEY

# 博客地址（例如：https://my.blog）
wrangler secret put BLOG_URL

# Webhook 通知地址（可选）
wrangler secret put WEBHOOK_URL

# Webhook 请求体模板（可选，默认飞书格式）
wrangler secret put WEBHOOK_BODY
```

### 3. 配置 wrangler.toml

编辑 `wrangler.toml` 文件，填入你的 D1 数据库和 KV Namespace ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "your-d1-database-name"
database_id = "your-d1-database-id"

[[kv_namespaces]]
binding = "INDEXNOW_KV"
id = "your-kv-namespace-id"
```

### 4. 部署

```bash
npm install
npm run deploy
```

## 环境变量说明

| 变量名 | 必填 | 说明 | 示例 |
|--------|------|------|------|
| `INDEXNOW_API_KEY` | ✅ | IndexNow API 密钥 | `9c3992e05a314b0eba92bfb7fcfa4c9b` |
| `BLOG_URL` | ✅ | 博客地址 | `https://my.blog` |
| `WEBHOOK_URL` | ❌ | Webhook 通知地址 | `https://open.feishu.cn/open-apis/bot/v2/hook/xxx` |
| `WEBHOOK_BODY` | ❌ | 自定义请求体模板 | `{"text":"{{message}}"}` |

## Webhook 通知格式

### 默认格式（飞书/钉钉兼容）

```json
{
  "msg_type": "text",
  "content": {
    "text": "{{message}}"
  }
}
```

### 通知内容示例

```
IndexNow for Rin
2025-01-16 00:30:45 (UTC+8)
本次发现并提交了5个文章网址。
```

### 自定义其他平台格式

如果需要发送到 Telegram、Discord 等其他平台，可以通过 `WEBHOOK_BODY` 自定义：

```json
{"chat_id":"123456","text":"{{message}}"}
```

## 工作原理

1. **定时触发**：Cloudflare Cron 每天 UTC 16:00（北京时间 0:00）触发
2. **读取文章**：从 D1 数据库查询所有公开且非草稿的文章（`listed=1 AND draft=0`）
3. **对比状态**：与 KV 中记录的已提交 URL 和更新时间对比
4. **筛选需要提交的 URL**：
   - 新文章：从未提交过
   - 更新文章：更新时间晚于上次提交时间
   - 固定页面：每 7 天提交一次
5. **提交 IndexNow**：调用 IndexNow API 批量提交
6. **更新状态**：将本次提交的 URL 和时间戳存入 KV
7. **记录日志**：保存执行日志到 KV（保留 31 天）
8. **发送通知**：通过 Webhook 发送执行结果

## 前端管理界面

访问 Worker 的 URL 即可查看管理面板：

- 📊 **执行状态**：上次执行时间、已追踪 URL 数量、下次固定页面提交时间
- 📝 **执行日志**：最近 31 天的执行记录，包含成功/失败状态、提交数量、耗时等
- 🔄 **自动刷新**：每 30 秒自动更新数据

## 安全说明

- ✅ **只读 D1**：Worker 仅从 D1 数据库读取数据，不会修改任何内容
- ✅ **隐私保护**：只提交公开可见的文章（`listed=1 AND draft=0`），草稿和隐藏文章不会被索引
- ✅ **KV 隔离**：所有状态和日志存储在独立的 KV Namespace 中
- ✅ **无敏感信息泄露**：前端页面不暴露 API Key 或其他敏感配置

## 故障排查

### Webhook 未收到通知

1. 检查 Cloudflare Real-time Logs，确认是否有 "正在发送 Webhook 通知" 日志
2. 确认 `WEBHOOK_URL` 配置正确
3. 对于 Telegram Bot，确保已向机器人发送过消息激活会话
4. 使用 curl 直接测试 Webhook URL 是否可达

### 文章未被提交

1. 确认文章的 `listed=1` 且 `draft=0`
2. 检查 KV 中是否已记录该 URL 的上次提交时间
3. 查看执行日志，确认是否有错误信息

### 固定页面未按时提交

1. 检查 KV 中的 `lastFixedSubmit` 字段
2. 确认距离上次提交已超过 7 天
3. 查看日志确认提交时是否包含固定页面

## 技术栈

- Cloudflare Workers
- D1 Database（只读）
- KV Storage
- IndexNow API
- Vanilla JavaScript（前端）

## License

MIT
