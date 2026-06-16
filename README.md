# IndexNow for openRin

一个 Cloudflare Worker，用于自动将 openRin 博客的新文章和更新提交到 Bing IndexNow。

## 功能特性

- ✅ **自动定时执行**：每天北京时间 0:00（UTC 16:00）自动检查并提交
- ✅ **智能追踪**：使用 KV 存储记录已提交的 URL，避免重复提交
- ✅ **固定页面支持**：首页、时间线、瞬间、标签、友链、关于页面每周自动提交
- ✅ **Webhook 通知**：每次执行后发送通知
- ✅ **前端管理界面**：浅色主题，显示执行状态和日志

## 部署步骤（Cloudflare Dashboard）

### 第 1 步：获取 IndexNow API Key

1. 访问 [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. 添加并验证你的网站
3. 进入 **配置** → **IndexNow**
4. 复制你的 API Key（例如：`abc123def456`）
5. 在你的博客根目录创建文件 `{API_KEY}.txt`（例如：`abc123def456.txt`），内容为你的 API Key

### 第 2 步：创建 KV Namespace

1. 在 Cloudflare Dashboard 中，进入 **Workers & Pages** → **KV**
2. 点击 **Create a namespace**
3. 输入命名空间名称（例如：`INDEXNOW_KV`）
4. 点击 **Add**
5. 记下 **Namespace ID**（后续需要用到）

### 第 3 步：创建 Worker

1. 进入 **Workers & Pages** → **Overview**
2. 点击 **Create application** → **Create Worker**
3. 输入 Worker 名称（例如：`indexnow-for-openrin`）
4. 点击 **Deploy**

### 第 4 步：绑定 D1 和 KV

1. 进入你的 Worker 页面
2. 点击 **Settings** → **Variables**
3. 向下滚动到 **Bindings** 部分
4. 点击 **Add binding**

**添加 D1 绑定：**
- Type: `D1 Database`
- Variable name: `DB`
- D1 Database: 选择你创建的数据库
- 点击 **Save**

**添加 KV 绑定：**
- Type: `KV Namespace`
- Variable name: `INDEXNOW_KV`
- KV Namespace: 选择你创建的命名空间
- 点击 **Save**

### 第 5 步：设置环境变量

1. 在 **Settings** → **Variables** 页面
2. 向下滚动到 **Environment Variables** 部分
3. 点击 **Add variable**

添加以下变量：

```
INDEXNOW_API_KEY = 你的 IndexNow API Key（必填）
BLOG_URL = https://your.blog.com（必填）
WEBHOOK_URL = 你的 Webhook 地址（可选）
WEBHOOK_BODY = {"msg_type":"text","content":{"text":"{{message}}"}}（可选）
```

4. 点击 **Save and deploy**

### 第 6 步：上传 worker.js

1. 进入你的 Worker 页面
2. 点击 **Quick edit**
3. 删除默认代码，粘贴 [worker.js](file:///home/houman/workspace/indexnow4openrin/worker.js) 的全部内容
4. 点击 **Save and deploy**

### 第 7 步：配置 Cron 触发器

1. 进入你的 Worker 页面
2. 点击 **Settings** → **Triggers**
3. 向下滚动到 **Cron Triggers** 部分
4. 点击 **Add cron trigger**
5. 输入 Cron 表达式：`0 16 * * *`
   - 这表示每天 UTC 16:00 执行（即北京时间 0:00）
6. 点击 **Save**

## 工作原理

1. **定时触发**：每天 UTC 16:00（北京时间 0:00）
2. **读取文章**：从 D1 查询公开且非草稿的文章
3. **对比状态**：与 KV 中记录的已提交 URL 对比
4. **筛选需要提交的 URL**：
   - 新文章：从未提交过
   - 更新文章：更新时间晚于上次提交
   - 固定页面：每 7 天提交一次
5. **提交 Bing IndexNow**：调用 `https://api.indexnow.org/IndexNow`
6. **更新状态**：保存本次提交记录到 KV
7. **记录日志**：保留 31 天
8. **发送通知**：通过 Webhook 发送结果

## 前端管理界面

访问 Worker URL 即可查看：

- 📊 执行状态：上次执行时间、已追踪 URL 数量、下次固定页面提交时间
- 📝 执行日志：最近 31 天的执行记录，可点击展开查看提交的 URL