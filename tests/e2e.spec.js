import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3457';

function mockSSE(modelId) {
  // Each model returns a unique identifiable response so we can verify
  // the correct model was called for each pane
    const responses = {
    'deepseek-v4-flash': 'UNIQUE_RESPONSE_DEEPSEEK_V4_FLASH',
    'claude-opus-4-7': 'UNIQUE_RESPONSE_CLAUDE_OPUS_4_7',
    'claude-sonnet-4-6': 'UNIQUE_RESPONSE_CLAUDE_SONNET_4_6',
    'claude-haiku-4-5-20251001': 'UNIQUE_RESPONSE_CLAUDE_HAIKU_4_5',
  };
  const text = responses[modelId] || 'UNIQUE_RESPONSE_UNKNOWN';
  const chunks = text.split(' ');

  let body = '';
  chunks.forEach((word) => {
    const payload = JSON.stringify({
      choices: [{ delta: { content: word + ' ' }, index: 0 }],
      model: modelId,
    });
    body += 'data: ' + payload + '\n\n';
  });
  const usagePayload = JSON.stringify({
    choices: [{ delta: {}, index: 0 }],
    model: modelId,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  });
  body += 'data: ' + usagePayload + '\n\n';
  body += 'data: [DONE]\n\n';

  return body;
}

// Track which model IDs were actually sent in API requests
let capturedModelRequests = [];

test.describe('Benchmark Tool E2E', () => {

  test.beforeEach(async ({ page }) => {
    capturedModelRequests = [];

    await page.route('**/v1/chat/completions', async route => {
      const postData = route.request().postDataJSON();
      const modelId = (postData && postData.model) || 'unknown';

      capturedModelRequests.push(modelId);

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: mockSSE(modelId),
      });
    });

    // Mock Claude Code endpoint with same SSE format
    await page.route('**/v1/claude-code', async route => {
      const postData = route.request().postDataJSON();
      const modelId = (postData && postData.model) || 'unknown';

      capturedModelRequests.push(modelId);

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: mockSSE(modelId),
      });
    });

    // Clear IndexedDB between tests
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('benchmark_db');
        req.onsuccess = resolve;
        req.onerror = resolve;
        req.onblocked = resolve;
      });
    });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  // ===== 页面加载 =====

  test('页面正常加载，标题和模型列表可见', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('LLM 网页生成效果对比');
    await expect(page.locator('#prompt-count')).toHaveText('8');
    await expect(page.locator('#status-bar')).toContainText('就绪');
  });

  test('加载 prompts.json 后渲染 8 个测试用例', async ({ page }) => {
    const items = page.locator('.prompt-item');
    await expect(items).toHaveCount(8);
  });

  // ===== 侧边栏 =====

  test('点击测试用例后显示详情面板', async ({ page }) => {
    const firstItem = page.locator('.prompt-item').first();
    await firstItem.click();

    await expect(page.locator('#empty-state')).toBeHidden();
    await expect(page.locator('#prompt-detail-container')).toBeVisible();
    await expect(page.locator('#detail-name')).toBeVisible();
    await expect(page.locator('#detail-prompt')).toBeVisible();
  });

  test('选择不同用例时更新详情面板', async ({ page }) => {
    await page.locator('.prompt-item').nth(0).click();
    const name1 = await page.locator('#detail-name').textContent();

    await page.locator('.prompt-item').nth(3).click();
    const name2 = await page.locator('#detail-name').textContent();

    expect(name1).not.toBe(name2);
  });

  test('检查点列表正确渲染', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    const checks = page.locator('#detail-checks li');
    await expect(checks).toHaveCount(5);
  });

  // ===== 分屏 =====

  test('默认 2 分屏，可切换到 3/4 分屏', async ({ page }) => {
    await expect(page.locator('.model-pane')).toHaveCount(2);

    await page.selectOption('#pane-count', '3');
    await expect(page.locator('.model-pane')).toHaveCount(3);

    await page.selectOption('#pane-count', '4');
    await expect(page.locator('.model-pane')).toHaveCount(4);
  });

  test('每个分屏有模型选择器', async ({ page }) => {
    const selects = page.locator('.model-pane select.model-select');
    await expect(selects).toHaveCount(2);

    for (const select of await selects.all()) {
      const options = select.locator('option');
      await expect(options).toHaveCount(4);
    }
  });

  // ===== 生成功能 =====

  test('点击全部生成时调用 mock API 并显示结果', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('button:has-text("全部生成")');

    // Wait for generation to complete (mock responds via route)
    await page.waitForTimeout(5000);

    // Stats should show timing info
    const stats0 = page.locator('#stats-0');
    await expect(stats0).not.toBeEmpty({ timeout: 10000 });
    await expect(stats0).toContainText('tokens');

    // Source code should be populated in each pane
    const source0 = page.locator('#source-code-0');
    await expect(source0).not.toBeEmpty({ timeout: 5000 });

    const source1 = page.locator('#source-code-1');
    await expect(source1).not.toBeEmpty({ timeout: 5000 });
  });

  test('未选择用例时点击全部生成弹出提示', async ({ page }) => {
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('请先选择一个测试用例');
      dialog.accept();
    });
    await page.click('button:has-text("全部生成")');
  });

  // ===== 视图切换 =====

  test('预览/源码 Tab 切换正常', async ({ page }) => {
    const previewBtn = page.locator('[data-pane="0"][data-view="preview"]');
    const sourceBtn = page.locator('[data-pane="0"][data-view="source"]');

    await expect(previewBtn).toHaveClass(/active-tab/);
    await expect(sourceBtn).not.toHaveClass(/active-tab/);

    await sourceBtn.click();
    await expect(sourceBtn).toHaveClass(/active-tab/);
    await expect(previewBtn).not.toHaveClass(/active-tab/);

    await previewBtn.click();
    await expect(previewBtn).toHaveClass(/active-tab/);
  });

  // ===== 代码输入 =====

  test('手动输入代码并渲染预览', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // Open code input
    await page.click('text=输入代码');
    const textarea = page.locator('#textarea-0');
    await textarea.fill('<h1>Test Render</h1>');

    // Click render
    await page.click('text=渲染预览');

    // iframe should be visible and contain the HTML
    const iframe = page.locator('#iframe-0');
    await expect(iframe).toBeVisible();

    const frame = iframe.contentFrame();
    await expect(frame.locator('h1')).toHaveText('Test Render');
  });

  test('清空按钮重置分屏内容', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // First render something
    await page.click('text=输入代码');
    await page.locator('#textarea-0').fill('<h1>Hello</h1>');
    await page.click('text=渲染预览');
    await expect(page.locator('#iframe-0')).toBeVisible();

    // Clear
    await page.click('text=清空');
    await expect(page.locator('#placeholder-0')).toBeVisible();
    await expect(page.locator('#iframe-0')).toBeHidden();
    await expect(page.locator('#stats-0')).toHaveText('');
  });

  // ===== 盲评模式 =====

  test('盲评开启后隐藏下拉框并显示匿名模型名', async ({ page }) => {
    const blindBtn = page.locator('#blind-toggle');
    await expect(blindBtn).toContainText('关');

    await blindBtn.click();
    await expect(blindBtn).toContainText('开');

    // Select should be hidden, not just disabled
    const select0 = page.locator('#select-0');
    await expect(select0).toHaveCSS('display', 'none');

    // Model name should be anonymous
    const nameEl = page.locator('#model-name-0');
    await expect(nameEl).toContainText('模型 1');
    await expect(nameEl).not.toContainText('DeepSeek');

    const nameEl1 = page.locator('#model-name-1');
    await expect(nameEl1).toContainText('模型 2');
  });

  test('盲评开启后随机分配模型，两个 pane 分配不同模型', async ({ page }) => {
    await page.click('#blind-toggle');

    // Read the select values (hidden but still have value attribute)
    const val0 = await page.locator('#select-0').inputValue();
    const val1 = await page.locator('#select-1').inputValue();

    // Both must be valid model IDs
    const validIds = ['deepseek-v4-flash', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
    expect(validIds).toContain(val0);
    expect(validIds).toContain(val1);

    // They must be different (shuffled, no duplicates)
    expect(val0).not.toBe(val1);
  });

  test('盲评生成时实际调用的是随机分配的模型', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('#blind-toggle');

    // Capture which models were assigned
    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    // Generate
    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    // Verify the API was called with the correct assigned model IDs
    expect(capturedModelRequests.length).toBeGreaterThanOrEqual(2);
    expect(capturedModelRequests).toContain(assigned0);
    expect(capturedModelRequests).toContain(assigned1);
  });

  test('盲评生成后源码包含对应模型的唯一标识', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('#blind-toggle');

    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    // Each model returns a unique response — verify source code matches
    const source0Text = await page.locator('#source-code-0').textContent();
    const source1Text = await page.locator('#source-code-1').textContent();

    const expectedResponse = {
      'deepseek-v4-flash': 'UNIQUE_RESPONSE_DEEPSEEK_V4_FLASH',
      'claude-opus-4-7': 'UNIQUE_RESPONSE_CLAUDE_OPUS_4_7',
      'claude-sonnet-4-6': 'UNIQUE_RESPONSE_CLAUDE_SONNET_4_6',
      'claude-haiku-4-5-20251001': 'UNIQUE_RESPONSE_CLAUDE_HAIKU_4_5',
    };

    expect(source0Text).toContain(expectedResponse[assigned0]);
    expect(source1Text).toContain(expectedResponse[assigned1]);

    // The two responses must be different
    expect(source0Text).not.toBe(source1Text);
  });

  test('盲评投票后揭晓模型身份', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('#blind-toggle');

    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    // Vote panel should appear
    const votePanel = page.locator('#vote-panel');
    await expect(votePanel).toBeVisible({ timeout: 5000 });

    // Before voting, reveal should be empty
    await expect(page.locator('#vote-model-reveal')).toHaveText('');

    // Vote for left (first model)
    await page.click('#vote-buttons button:first-child');

    // After voting, reveal should show model names
    const revealText = await page.locator('#vote-model-reveal').textContent();
    const modelNames = {
      'deepseek-v4-flash': 'DeepSeek-V4-Flash',
      'claude-opus-4-7': 'GLM-5.1 (Opus)',
      'claude-sonnet-4-6': 'GLM-5-Turbo (Sonnet)',
      'claude-haiku-4-5-20251001': 'GLM-4.7 (Haiku)',
    };
    expect(revealText).toContain(modelNames[assigned0]);
    expect(revealText).toContain(modelNames[assigned1]);
    expect(revealText).toContain('揭晓');
    expect(revealText).toContain('胜');
  });

  test('盲评投票记录包含正确的模型 ID 和名称', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('#blind-toggle');

    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    await page.click('#vote-buttons button:first-child');

    // Wait for blind mode to auto-close (2s timeout)
    await page.waitForTimeout(3000);

    // Check vote was saved in IndexedDB
    const votes = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('benchmark_db', 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('votes', 'readonly');
          const store = tx.objectStore('votes');
          const getReq = store.getAll();
          getReq.onsuccess = () => resolve(getReq.result);
        };
      });
    });

    expect(votes.length).toBeGreaterThan(0);
    const lastVote = votes[votes.length - 1];
    expect(lastVote.models).toContain(assigned0);
    expect(lastVote.models).toContain(assigned1);
    expect(lastVote.vote).toBe('0');
    expect(lastVote.model_names).toBeTruthy();
    expect(lastVote.model_names.length).toBeGreaterThan(0);
  });

  test('盲评关闭后恢复下拉框和模型名', async ({ page }) => {
    // Record original state
    const origVal0 = await page.locator('#select-0').inputValue();
    const origName0 = await page.locator('#model-name-0').textContent();

    // Enable blind mode
    await page.click('#blind-toggle');
    await expect(page.locator('#select-0')).toHaveCSS('display', 'none');
    await expect(page.locator('#model-name-0')).toContainText('模型 1');

    // Disable blind mode
    await page.click('#blind-toggle');
    await expect(page.locator('#select-0')).toBeVisible();
    await expect(page.locator('#model-name-0')).not.toContainText('模型 1');

    // The select value should now show the blind-assigned model name
    const nameAfter = await page.locator('#model-name-0').textContent();
    expect(nameAfter).not.toBe('');
    expect(nameAfter).not.toBe('模型 1');
  });

  test('3 分屏盲评随机分配 3 个不同模型', async ({ page }) => {
    await page.selectOption('#pane-count', '3');
    await page.locator('.prompt-item').first().click();
    await page.click('#blind-toggle');

    const val0 = await page.locator('#select-0').inputValue();
    const val1 = await page.locator('#select-1').inputValue();
    const val2 = await page.locator('#select-2').inputValue();

    const validIds = ['deepseek-v4-flash', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
    expect(validIds).toContain(val0);
    expect(validIds).toContain(val1);
    expect(validIds).toContain(val2);

    // All 3 should be different
    const unique = new Set([val0, val1, val2]);
    expect(unique.size).toBe(3);

    // All 3 selects should be hidden
    await expect(page.locator('#select-0')).toHaveCSS('display', 'none');
    await expect(page.locator('#select-1')).toHaveCSS('display', 'none');
    await expect(page.locator('#select-2')).toHaveCSS('display', 'none');

    // Names should be anonymous
    await expect(page.locator('#model-name-0')).toContainText('模型 1');
    await expect(page.locator('#model-name-1')).toContainText('模型 2');
    await expect(page.locator('#model-name-2')).toContainText('模型 3');
  });

  test('非盲评模式下生成使用下拉框选中的模型', async ({ page }) => {
    // Manually set pane 0 to GLM-5-Turbo and pane 1 to DeepSeek
    await page.locator('#select-0').selectOption('claude-sonnet-4-6');
    await page.locator('#select-1').selectOption('deepseek-v4-flash');
    await page.locator('.prompt-item').first().click();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    // Verify API calls match selected models
    expect(capturedModelRequests).toContain('claude-sonnet-4-6');
    expect(capturedModelRequests).toContain('deepseek-v4-flash');

    // Verify source code matches
    const source0Text = await page.locator('#source-code-0').textContent();
    const source1Text = await page.locator('#source-code-1').textContent();
    expect(source0Text).toContain('UNIQUE_RESPONSE_CLAUDE_SONNET_4_6');
    expect(source1Text).toContain('UNIQUE_RESPONSE_DEEPSEEK_V4_FLASH');
  });

  // ===== 评分功能 =====

  test('保存评分后可在历史记录中查看', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // Change some scores
    const firstScore = page.locator('#detail-checks select').first();
    await firstScore.selectOption('pass');

    // Save
    await page.click('button:has-text("保存本次评分")');
    await expect(page.locator('#status-bar')).toContainText('评分已保存');

    // Open history
    await page.click('text=历史记录');
    const historyContent = page.locator('#history-content');
    await expect(historyContent).toContainText('评分记录');
    await expect(historyContent).toContainText('环形进度条');
  });

  // ===== 投票功能 =====

  test('非盲评模式不显示投票面板', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    // Vote panel should NOT appear in non-blind mode
    const votePanel = page.locator('#vote-panel');
    await expect(votePanel).toBeHidden();
  });

  // ===== 评分功能 =====

  test('统计面板显示生成数据', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('button:has-text("全部生成")');
    // Wait longer for mock generation to complete
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 15000 });

    await page.click('text=统计');
    const statsContent = page.locator('#stats-content');
    await expect(statsContent).toBeVisible();
    await expect(statsContent).toContainText('模型', { timeout: 5000 });
    await expect(statsContent).toContainText('生成次数');
  });

  // ===== 批量运行 =====

  test('全选 + 批量运行流程', async ({ page }) => {
    // Select all
    await page.locator('#batch-select-all').check();

    const checkedCount = await page.locator('.batch-check:checked').count();
    expect(checkedCount).toBe(8);

    // Start batch run (with mock API, should complete quickly)
    await page.click('#batch-run-btn');
    await expect(page.locator('#batch-run-btn')).toContainText('运行中...');
    await expect(page.locator('#batch-progress')).toBeVisible();

    // Wait for completion (8 prompts x 2 panes x ~300ms mock = ~5s + overhead)
    await expect(page.locator('#batch-run-btn')).not.toBeDisabled({ timeout: 60000 });
    await expect(page.locator('#status-bar')).toContainText('批量运行完成');
  });

  // ===== 导出功能 =====

  test('导出结果下载 JSON 文件', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // Save a score first
    await page.click('button:has-text("保存本次评分")');

    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("导出结果")'),
    ]);

    const path = await download.path();
    expect(path).toBeTruthy();

    const content = await download.createReadStream();
    let data = '';
    for await (const chunk of content) {
      data += chunk.toString();
    }
    const parsed = JSON.parse(data);
    expect(parsed).toHaveProperty('results');
    expect(parsed).toHaveProperty('votes');
    expect(parsed.results.length).toBeGreaterThan(0);
  });

  // ===== 历史记录清空 =====

  test('清空历史记录', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('button:has-text("保存本次评分")');

    await page.click('text=历史记录');
    await expect(page.locator('#history-content')).toContainText('评分记录');

    // Use page.evaluate to handle the confirm dialog and click
    await page.evaluate(() => {
      window.confirm = () => true;
      document.querySelector('#history-modal .flex.gap-2 button').click();
    });

    // Wait for async clear to complete, then re-open history
    await page.waitForTimeout(500);
    await page.click('text=历史记录');
    await expect(page.locator('#history-content')).toContainText('暂无历史记录', { timeout: 5000 });
  });

  // ===== API 配置面板 =====

  test('API 配置面板显示 .env 提示', async ({ page }) => {
    await page.click('text=API 配置');
    const configPanel = page.locator('#api-config');
    await expect(configPanel).toHaveClass(/show/);
    await expect(configPanel).toContainText('.env');
    await expect(configPanel).toContainText('server.js');

    // Close
    await page.click('#api-config button:has-text("×")');
    await expect(configPanel).not.toHaveClass(/show/);
  });

  // ===== XSS 防护 =====

  test('历史记录中特殊字符不会被注入为 HTML', async ({ page }) => {
    // Inject a result with XSS payload via IndexedDB
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('benchmark_db', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('results')) {
            db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('votes')) {
            db.createObjectStore('votes', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('generations')) {
            db.createObjectStore('generations', { keyPath: 'id', autoIncrement: true });
          }
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('results', 'readwrite');
          const store = tx.objectStore('results');
          store.add({
            prompt_name: '<img src=x onerror=alert(1)>',
            model_a: '<script>alert("xss")</script>',
            model_b: 'normal',
            pass_rate: 1,
            timestamp: new Date().toISOString(),
          });
          tx.oncomplete = resolve;
        };
      });
    });

    await page.click('text=历史记录');
    const historyContent = page.locator('#history-content');
    // Wait for the injected record to load
    await expect(historyContent).toContainText('100%', { timeout: 5000 });

    // The XSS strings should appear as text (escaped), not as actual DOM elements
    const contentText = await historyContent.textContent();
    expect(contentText).toContain('<img src=x onerror=alert(1)>');
    expect(contentText).toContain('<script>alert("xss")</script>');

    // Verify no actual img/script tags in the DOM
    const hasImg = await page.locator('#history-content img').count();
    const hasScript = await page.locator('#history-content script').count();
    expect(hasImg).toBe(0);
    expect(hasScript).toBe(0);
  });

  // ===== iframe 沙箱 =====

  test('生成的 HTML 在沙箱 iframe 中渲染，不允许 same-origin', async ({ page }) => {
    await page.locator('.prompt-item').first().click();
    await page.click('text=输入代码');
    await page.locator('#textarea-0').fill('<h1>Sandboxed</h1>');
    await page.click('text=渲染预览');

    const iframe = page.locator('#iframe-0');
    const sandbox = await iframe.getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  // ===== 复制 Prompt =====

  test('复制 Prompt 按钮正常工作', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.click('text=复制 Prompt');
    await expect(page.locator('text=已复制')).toBeVisible();
  });

  // ===== 状态栏 =====

  test('状态栏显示就绪消息和模型列表', async ({ page }) => {
    const statusBar = page.locator('#status-bar');
    await expect(statusBar).toContainText('就绪');
    await expect(statusBar).toContainText('GLM');
  });

  // ===== Claude Code 路由 =====

  test('Claude 模型使用 /v1/claude-code 端点', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // Select Claude model in first pane
    await page.locator('#select-0').selectOption('claude-sonnet-4-6');

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });

    expect(capturedModelRequests).toContain('claude-sonnet-4-6');

    const sourceText = await page.locator('#source-code-0').textContent();
    expect(sourceText).toContain('UNIQUE_RESPONSE_CLAUDE_SONNET_4_6');
  });

  test('混合模型：Claude + DeepSeek 并行生成', async ({ page }) => {
    await page.locator('.prompt-item').first().click();

    // First pane: Claude, Second pane: DeepSeek
    await page.locator('#select-0').selectOption('claude-opus-4-7');
    await page.locator('#select-1').selectOption('deepseek-v4-flash');

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tokens', { timeout: 10000 });
    await expect(page.locator('#stats-1')).toContainText('tokens', { timeout: 10000 });

    expect(capturedModelRequests).toContain('claude-opus-4-7');
    expect(capturedModelRequests).toContain('deepseek-v4-flash');

    const source0 = await page.locator('#source-code-0').textContent();
    const source1 = await page.locator('#source-code-1').textContent();
    expect(source0).toContain('UNIQUE_RESPONSE_CLAUDE_OPUS_4_7');
    expect(source1).toContain('UNIQUE_RESPONSE_DEEPSEEK_V4_FLASH');
    expect(source0).not.toBe(source1);
  });

});
