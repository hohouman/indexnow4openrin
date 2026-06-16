# IndexNow for openRin

一个 Cloudflare Worker，用于自动将 openRin 博客的新文章和更新提交到 Bing IndexNow。

## 功能特性

- ✅ **自动定时执行**：每天北京时间 0:00（UTC 16:00）自动检查并提交
- ✅ **智能追踪**：使用 KV 存储记录已提交的 URL，避免重复提交
- ✅ **固定页面支持**：首页、时间线、瞬间、标签、友链、关于页面每周自动提交
- ✅ **Webhook 通知**：每次执行后发送通知
- ✅ **前端管理界面**：浅色主题，显示执行状态和日志

## 部署步骤

### 1. 准备工作

- 在 [Bing Webmaster Tools](https://www.bing.com/webmasters) 获取 IndexNow API Key
- 在博客根目录放置密钥验证文件（`{API_KEY}.txt`）
- 创建 Cloudflare D1 数据库和 KV Namespace

### 2. 配置环境变量

```
wrangler secret put INDEXNOW_API_KEY
wrangler secret put BLOG_URL
wrangler secret put WEBHOOK_URL      # 可选
wrangler secret put WEBHOOK_BODY     # 可选
```

### 3. 配置 wrangler.toml

编辑 `wrangler.toml`，填入你的 D1 和 KV ID：

```
[[d1_databases]]
binding = "DB"
database_name = "your-d1-name"
database_id = "your-d1-id"

[[kv_namespaces]]
binding = "INDEXNOW_KV"
id = "your-kv-id"
```

### 4. 部署

```
npm install
npm run deploy
```

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| INDEXNOW_API_KEY | ✅ | Bing IndexNow API 密钥 |
| BLOG_URL | ✅ | 博客地址，如 https://my.blog |
| WEBHOOK_URL | ❌ | Webhook 通知地址 |
| WEBHOOK_BODY | ❌ | 自定义请求体模板 |

## 工作原理

1. **定时触发**：每天 UTC 16:00（北京时间 0:00）
2. **读取文章**：从 D1 查询公开且非草稿的文章
3. **对比状态**：与 KV 中记录的已提交 URL 对比
4. **筛选需要提交的 URL**：
   - 新文章：从未提交过
   - 更新文章：更新时间晚于上次提交
   - 固定页面：每 7 天提交一次
5. **提交 Bing IndexNow**：调用 `https://www.bing.com/indexnow`
6. **更新状态**：保存本次提交记录到 KV
7. **记录日志**：保留 31 天
8. **发送通知**：通过 Webhook 发送结果

## 前端管理界面

访问 Worker URL 即可查看：

- 📊 执行状态：上次执行时间、已追踪 URL 数量、下次固定页面提交时间
- 📝 执行日志：最近 31 天的执行记录，可点击展开查看提交的 URL

## License

MIT