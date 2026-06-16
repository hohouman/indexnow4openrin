# 快速开始指南

## 5 分钟部署 IndexNow Worker

### 第一步：获取 IndexNow API Key

1. 访问 [IndexNow.org](https://www.indexnow.org/)
2. 生成一个 API Key（例如：`9c3992e05a314b0eba92bfb7fcfa4c9b`）
3. 在你的博客根目录创建文件 `{API_KEY}.txt`，内容为该密钥
   - 例如：`9c3992e05a314b0eba92bfb7fcfa4c9b.txt`
   - 文件内容就是密钥本身

### 第二步：创建 Cloudflare 资源

#### 创建 D1 数据库（如果还没有）

```bash
wrangler d1 create openrin-db
```

记下返回的 `database_id`。

#### 创建 KV Namespace

```bash
wrangler kv:namespace create INDEXNOW_KV
```

记下返回的 namespace ID。

### 第三步：配置项目

编辑 `wrangler.toml`：

```toml
name = "indexnow4openrin"
main = "worker.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["0 16 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "openrin-db"  # 你的 D1 数据库名称
database_id = "xxx-xxx-xxx"   # 替换为实际的 database_id

[[kv_namespaces]]
binding = "INDEXNOW_KV"
id = "xxx-xxx-xxx"            # 替换为实际的 KV namespace ID
```

### 第四步：设置环境变量

```bash
# IndexNow API Key
wrangler secret put INDEXNOW_API_KEY
# 输入你的密钥，例如：9c3992e05a314b0eba92bfb7fcfa4c9b

# 博客地址
wrangler secret put BLOG_URL
# 输入你的博客地址，例如：https://my.blog

# Webhook 通知（可选）
wrangler secret put WEBHOOK_URL
# 输入 webhook URL，例如飞书机器人地址

# Webhook 请求体（可选，默认使用飞书格式）
wrangler secret put WEBHOOK_BODY
# 如果需要自定义，输入 JSON 模板，用 {{message}} 作为占位符
```

### 第五步：部署

```bash
npm install
npm run deploy
```

### 第六步：验证

1. 访问你的 Worker URL（例如：`https://indexnow4openrin.your-subdomain.workers.dev/`）
2. 应该能看到管理面板
3. 等待第二天 UTC 16:00（北京时间 0:00）自动执行
4. 或者手动触发测试（见下方）

## 手动测试（可选）

如果需要立即测试，可以临时添加一个测试端点：

在 `worker.js` 的 `fetch` 函数中添加：

```javascript
// 测试端点（部署后请删除此代码）
if (url.pathname === "/test" && url.searchParams.get("key") === "your-test-key") {
  ctx.waitUntil(executeIndexNowTask(env, ctx));
  return new Response("测试任务已启动，请查看日志");
}
```

然后访问：`https://your-worker.workers.dev/test?key=your-test-key`

**⚠️ 重要：测试完成后务必删除此代码！**

## 常见问题

### Q: 如何确认 Cron 是否正常工作？

A: 访问管理面板查看"上次执行时间"，或检查 Cloudflare Dashboard 的 Workers & Pages → 你的 Worker → Triggers。

### Q: 为什么有些文章没有被提交？

A: 只有满足以下条件的文章才会被提交：
- `listed = 1`（公开可见）
- `draft = 0`（非草稿）
- 是新文章或更新时间晚于上次提交时间

### Q: Webhook 没有收到通知怎么办？

A: 
1. 检查 Cloudflare Logs 是否有错误
2. 确认 `WEBHOOK_URL` 配置正确
3. Telegram Bot 需要先向机器人发送消息激活会话
4. 使用 curl 直接测试 webhook URL

### Q: 如何修改执行时间？

A: 编辑 `wrangler.toml` 中的 `crons` 字段。注意 Cron 使用 UTC 时间：
- 北京时间 0:00 = UTC 16:00 → `"0 16 * * *"`
- 北京时间 8:00 = UTC 0:00 → `"0 0 * * *"`
- 北京时间 20:00 = UTC 12:00 → `"0 12 * * *"`

## 下一步

- 📖 阅读完整的 [README.md](./README.md) 了解更多配置选项
- 🔍 查看 [IndexNow 官方文档](https://www.indexnow.org/en/documentation)
- 💬 遇到问题？提交 Issue
