export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 前端管理页面
    if (url.pathname === "/" || url.pathname === "/admin") {
      return handleAdminPage(env, ctx);
    }
    
    // API 端点：获取状态
    if (url.pathname === "/api/status") {
      return handleGetStatus(env, ctx);
    }
    
    // API 端点：获取日志
    if (url.pathname === "/api/logs") {
      return handleGetLogs(env, ctx);
    }
    
    return new Response("Not Found", { status: 404 });
  },
  
  async scheduled(event, env, ctx) {
    await executeIndexNowTask(env, ctx);
  }
};

// ==================== 核心业务逻辑 ====================

async function executeIndexNowTask(env, ctx) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  let submittedUrls = [];
  let error = null;
  
  try {
    // 1. 从 D1 读取所有公开文章
    const { results: articles } = await env.DB.prepare(
      "SELECT id, alias, updated_at, created_at FROM feeds WHERE listed = 1 AND draft = 0"
    ).all();
    
    // 2. 构建需要检查的 URL 列表
    const baseUrl = env.BLOG_URL.replace(/\/$/, '');
    const urlsToCheck = [];
    
    // 动态文章
    for (const article of articles) {
      const path = article.alias ? `/feed/${article.alias}` : `/feed/${article.id}`;
      const fullUrl = `${baseUrl}${path}`;
      const updateTime = article.updated_at || article.created_at;
      urlsToCheck.push({ url: fullUrl, updateTime });
    }
    
    // 固定页面（每周提交）
    const fixedPages = [
      { url: `${baseUrl}/`, updateTime: null },
      { url: `${baseUrl}/timeline`, updateTime: null },
      { url: `${baseUrl}/moments`, updateTime: null },
      { url: `${baseUrl}/hashtags`, updateTime: null },
      { url: `${baseUrl}/friends`, updateTime: null },
      { url: `${baseUrl}/about`, updateTime: null }
    ];
    
    // 3. 从 KV 读取上次执行记录
    const lastExecutionKey = "indexnow_last_execution";
    const lastExecutionData = await env.INDEXNOW_KV.get(lastExecutionKey, "json");
    const submittedMap = lastExecutionData?.submittedUrls || {};
    const lastFixedSubmit = lastExecutionData?.lastFixedSubmit || 0;
    
    // 4. 检查哪些 URL 需要提交
    const now = Math.floor(Date.now() / 1000);
    const oneWeek = 7 * 24 * 60 * 60;
    const needFixedSubmit = (now - lastFixedSubmit) >= oneWeek;
    
    const urlsToSubmit = [];
    
    // 检查动态文章
    for (const item of urlsToCheck) {
      const lastSubmitted = submittedMap[item.url];
      
      // 如果从未提交过，或者更新时间晚于上次提交时间
      if (!lastSubmitted || (item.updateTime && item.updateTime > lastSubmitted)) {
        urlsToSubmit.push(item.url);
      }
    }
    
    // 检查固定页面（每周提交）
    if (needFixedSubmit) {
      for (const page of fixedPages) {
        urlsToSubmit.push(page.url);
      }
    }
    
    // 5. 如果有需要提交的 URL，调用 IndexNow API
    if (urlsToSubmit.length > 0) {
      const apiKey = env.INDEXNOW_API_KEY;
      const keyLocation = `${baseUrl}/${apiKey}.txt`;
      
      const payload = {
        host: new URL(baseUrl).hostname,
        key: apiKey,
        keyLocation: keyLocation,
        urlList: urlsToSubmit
      };
      
      const response = await fetch("https://api.indexnow.org/IndexNow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`IndexNow API 返回错误: ${response.status} ${response.statusText}`);
      }
      
      submittedUrls = urlsToSubmit;
      
      // 更新 KV 记录
      const newSubmittedMap = { ...submittedMap };
      const currentTime = now;
      
      for (const url of urlsToSubmit) {
        newSubmittedMap[url] = currentTime;
      }
      
      const newLastFixedSubmit = needFixedSubmit ? currentTime : lastFixedSubmit;
      
      await env.INDEXNOW_KV.put(lastExecutionKey, JSON.stringify({
        submittedUrls: newSubmittedMap,
        lastFixedSubmit: newLastFixedSubmit,
        lastExecutionTime: timestamp
      }));
    }
    
  } catch (e) {
    error = e.message;
    console.error("IndexNow 任务执行失败:", e);
  }
  
  // 6. 记录日志到 KV（保留 31 天）
  const logEntry = {
    timestamp,
    duration: Date.now() - startTime,
    submittedCount: submittedUrls.length,
    submittedUrls: submittedUrls.slice(0, 10), // 只保存前 10 个用于显示
    success: !error,
    error: error
  };
  
  const logsKey = `indexnow_log_${Date.now()}`;
  await env.INDEXNOW_KV.put(logsKey, JSON.stringify(logEntry), {
    expirationTtl: 31 * 24 * 60 * 60 // 31 天
  });
  
  // 7. 发送 Webhook 通知
  const message = `IndexNow for Rin\n${formatBeijingTime(timestamp)}\n本次发现并提交了${submittedUrls.length}个文章网址。`;
  
  if (error) {
    const errorMessage = `IndexNow for Rin\n${formatBeijingTime(timestamp)}\n执行失败: ${error}`;
    await sendWebhook(env, errorMessage);
  } else {
    await sendWebhook(env, message);
  }
}

// ==================== 辅助函数 ====================

function formatBeijingTime(isoString) {
  const date = new Date(isoString);
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (UTC+8)`;
}

async function sendWebhook(env, message) {
  if (!env.WEBHOOK_URL) {
    console.log("未配置 WEBHOOK_URL，跳过通知");
    return;
  }
  
  try {
    let body;
    
    if (env.WEBHOOK_BODY) {
      // 使用自定义模板
      body = env.WEBHOOK_BODY.replace("{{message}}", message);
    } else {
      // 默认飞书/钉钉格式
      body = JSON.stringify({
        msg_type: "text",
        content: {
          text: message
        }
      });
    }
    
    const response = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: body
    });
    
    if (!response.ok) {
      console.error(`Webhook 发送失败: ${response.status} ${response.statusText}`);
    } else {
      console.log("Webhook 通知发送成功");
    }
  } catch (e) {
    console.error("Webhook 发送异常:", e.message);
  }
}

// ==================== 前端管理页面 ====================

async function handleAdminPage(env, ctx) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IndexNow for Rin - 管理面板</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .header {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    .header h1 {
      color: #2c3e50;
      font-size: 28px;
      margin-bottom: 10px;
    }
    
    .header p {
      color: #7f8c8d;
      font-size: 14px;
    }
    
    .status-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    .status-card h2 {
      color: #34495e;
      font-size: 20px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #ecf0f1;
    }
    
    .status-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    
    .status-item:last-child {
      border-bottom: none;
    }
    
    .status-label {
      color: #7f8c8d;
      font-size: 14px;
    }
    
    .status-value {
      color: #2c3e50;
      font-weight: 600;
      font-size: 14px;
    }
    
    .status-value.success {
      color: #27ae60;
    }
    
    .status-value.error {
      color: #e74c3c;
    }
    
    .logs-section {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .logs-section h2 {
      color: #34495e;
      font-size: 20px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #ecf0f1;
    }
    
    .log-entry {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 12px;
      border-left: 4px solid #3498db;
    }
    
    .log-entry.error {
      border-left-color: #e74c3c;
      background: #fdf2f2;
    }
    
    .log-entry.success {
      border-left-color: #27ae60;
      background: #f2fdf5;
    }
    
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .log-time {
      color: #7f8c8d;
      font-size: 13px;
    }
    
    .log-status {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .log-status.success {
      background: #d4edda;
      color: #155724;
    }
    
    .log-status.error {
      background: #f8d7da;
      color: #721c24;
    }
    
    .log-details {
      color: #555;
      font-size: 13px;
      line-height: 1.6;
    }
    
    .log-urls {
      margin-top: 8px;
      padding: 8px;
      background: white;
      border-radius: 4px;
      font-size: 12px;
      color: #666;
      max-height: 100px;
      overflow-y: auto;
    }
    
    .log-urls div {
      padding: 2px 0;
    }
    
    .loading {
      text-align: center;
      padding: 40px;
      color: #7f8c8d;
    }
    
    .refresh-btn {
      background: #3498db;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 15px;
      transition: background 0.3s;
    }
    
    .refresh-btn:hover {
      background: #2980b9;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #95a5a6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 IndexNow for Rin</h1>
      <p>自动提交博客文章到 IndexNow，提升搜索引擎收录效率</p>
    </div>
    
    <div class="status-card">
      <h2>📊 执行状态</h2>
      <div id="status-content">
        <div class="loading">加载中...</div>
      </div>
    </div>
    
    <div class="logs-section">
      <h2>📝 执行日志（最近 31 天）</h2>
      <button class="refresh-btn" onclick="loadLogs()">刷新日志</button>
      <div id="logs-content" style="margin-top: 20px;">
        <div class="loading">加载中...</div>
      </div>
    </div>
  </div>
  
  <script>
    async function loadStatus() {
      try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        const statusHtml = \`
          <div class="status-item">
            <span class="status-label">上次执行时间</span>
            <span class="status-value">\${data.lastExecutionTime || '尚未执行'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">已追踪的 URL 数量</span>
            <span class="status-value">\${data.trackedUrls || 0}</span>
          </div>
          <div class="status-item">
            <span class="status-label">下次固定页面提交</span>
            <span class="status-value">\${data.nextFixedSubmit || '待计算'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">最后执行状态</span>
            <span class="status-value \${data.lastSuccess ? 'success' : 'error'}">
              \${data.lastSuccess ? '✓ 成功' : '✗ 失败'}
            </span>
          </div>
          \${data.lastError ? \`
          <div class="status-item">
            <span class="status-label">错误信息</span>
            <span class="status-value error">\${data.lastError}</span>
          </div>
          \` : ''}
        \`;
        
        document.getElementById('status-content').innerHTML = statusHtml;
      } catch (e) {
        document.getElementById('status-content').innerHTML = 
          '<div class="status-value error">加载失败: ' + e.message + '</div>';
      }
    }
    
    async function loadLogs() {
      try {
        const response = await fetch('/api/logs');
        const logs = await response.json();
        
        if (logs.length === 0) {
          document.getElementById('logs-content').innerHTML = 
            '<div class="empty-state">暂无日志记录</div>';
          return;
        }
        
        const logsHtml = logs.map(log => {
          const timeStr = formatBeijingTime(log.timestamp);
          const isSuccess = log.success;
          
          let urlsHtml = '';
          if (log.submittedUrls && log.submittedUrls.length > 0) {
            urlsHtml = \`
              <div class="log-urls">
                \${log.submittedUrls.map(url => '<div>' + url + '</div>').join('')}
                \${log.submittedCount > 10 ? '<div>... 还有 ' + (log.submittedCount - 10) + ' 个</div>' : ''}
              </div>
            \`;
          }
          
          return \`
            <div class="log-entry \${isSuccess ? 'success' : 'error'}">
              <div class="log-header">
                <span class="log-time">\${timeStr}</span>
                <span class="log-status \${isSuccess ? 'success' : 'error'}">
                  \${isSuccess ? '✓ 成功' : '✗ 失败'}
                </span>
              </div>
              <div class="log-details">
                <div>提交数量: \${log.submittedCount} 个 URL</div>
                <div>耗时: \${log.duration} ms</div>
                \${log.error ? '<div style="color: #e74c3c; margin-top: 5px;">错误: ' + log.error + '</div>' : ''}
              </div>
              \${urlsHtml}
            </div>
          \`;
        }).join('');
        
        document.getElementById('logs-content').innerHTML = logsHtml;
      } catch (e) {
        document.getElementById('logs-content').innerHTML = 
          '<div class="status-value error">加载失败: ' + e.message + '</div>';
      }
    }
    
    function formatBeijingTime(isoString) {
      const date = new Date(isoString);
      const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const year = beijingTime.getUTCFullYear();
      const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(beijingTime.getUTCDate()).padStart(2, '0');
      const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
      const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
      const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
      return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds + ' (UTC+8)';
    }
    
    // 页面加载时获取数据
    loadStatus();
    loadLogs();
    
    // 每 30 秒自动刷新
    setInterval(() => {
      loadStatus();
      loadLogs();
    }, 30000);
  </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

async function handleGetStatus(env, ctx) {
  try {
    const lastExecutionKey = "indexnow_last_execution";
    const data = await env.INDEXNOW_KV.get(lastExecutionKey, "json");
    
    if (!data) {
      return new Response(JSON.stringify({
        lastExecutionTime: null,
        trackedUrls: 0,
        nextFixedSubmit: null,
        lastSuccess: null,
        lastError: null
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const submittedMap = data.submittedUrls || {};
    const trackedUrls = Object.keys(submittedMap).length;
    
    // 计算下次固定页面提交时间
    let nextFixedSubmit = null;
    if (data.lastFixedSubmit) {
      const oneWeek = 7 * 24 * 60 * 60;
      const nextTime = data.lastFixedSubmit + oneWeek;
      const nextDate = new Date(nextTime * 1000);
      nextFixedSubmit = formatBeijingTime(nextDate.toISOString());
    }
    
    // 获取最新的日志以确定最后执行状态
    const logs = await getRecentLogs(env, 1);
    const lastLog = logs[0];
    
    return new Response(JSON.stringify({
      lastExecutionTime: data.lastExecutionTime ? formatBeijingTime(data.lastExecutionTime) : null,
      trackedUrls,
      nextFixedSubmit,
      lastSuccess: lastLog ? lastLog.success : null,
      lastError: lastLog ? lastLog.error : null
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function handleGetLogs(env, ctx) {
  try {
    const logs = await getRecentLogs(env, 50); // 最多返回 50 条日志
    return new Response(JSON.stringify(logs), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function getRecentLogs(env, limit) {
  const logs = [];
  const prefix = "indexnow_log_";
  
  // KV 不支持直接按前缀排序，需要列出所有键然后过滤
  let cursor = null;
  do {
    const result = await env.INDEXNOW_KV.list({ prefix, cursor });
    
    for (const key of result.keys) {
      if (key.name.startsWith(prefix)) {
        const value = await env.INDEXNOW_KV.get(key.name, "json");
        if (value) {
          logs.push(value);
        }
      }
    }
    
    cursor = result.cursor;
  } while (cursor);
  
  // 按时间戳降序排序
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // 返回最近的 limit 条
  return logs.slice(0, limit);
}
