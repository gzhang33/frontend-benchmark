import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3457';

function mockSSE(modelId) {
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
    await expect(page.locator('.app-logo')).toContainText('Bench');
    await expect(page.locator('.tc-count')).toHaveText('8');
    await expect(page.locator('#status-text')).toContainText('就绪');
  });

  test('加载 prompts.json 后渲染 8 个测试用例', async ({ page }) => {
    const items = page.locator('.tc-item');
    await expect(items).toHaveCount(8);
  });

  // ===== 侧边栏 =====

  test('点击测试用例后评分抽屉可用', async ({ page }) => {
    const firstItem = page.locator('.tc-item').first();
    await firstItem.click();
    await expect(firstItem).toHaveClass(/active/);
  });

  test('选择不同用例时更新高亮', async ({ page }) => {
    await page.locator('.tc-item').nth(0).click();
    await expect(page.locator('.tc-item').nth(0)).toHaveClass(/active/);

    await page.locator('.tc-item').nth(3).click();
    await expect(page.locator('.tc-item').nth(3)).toHaveClass(/active/);
    await expect(page.locator('.tc-item').nth(0)).not.toHaveClass(/active/);
  });

  test('打开评分抽屉后显示检查点', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');
    await expect(page.locator('#score-drawer')).not.toHaveClass(/closed/);
    await expect(page.locator('#drawer-body')).toContainText('环形进度条');
  });

  test('关闭评分抽屉', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');
    await expect(page.locator('#score-drawer')).not.toHaveClass(/closed/);
    await page.click('#drawer-toggle');
    await expect(page.locator('#score-drawer')).toHaveClass(/closed/);
  });

  // ===== 分屏 =====

  test('默认 2 分屏，可切换到 3/4 分屏', async ({ page }) => {
    await expect(page.locator('.pane')).toHaveCount(2);

    await page.selectOption('#pane-count', '3');
    await expect(page.locator('.pane')).toHaveCount(3);

    await page.selectOption('#pane-count', '4');
    await expect(page.locator('.pane')).toHaveCount(4);

    // Reset to 2
    await page.selectOption('#pane-count', '2');
  });

  test('每个分屏有模型选择器', async ({ page }) => {
    // Exclude the pane-count select (toolbar-select on the toolbar, not inside .pane)
    const selects = page.locator('.pane-head select.toolbar-select');
    await expect(selects).toHaveCount(2);
    for (const select of await selects.all()) {
      const optionCount = await select.locator('option').count();
      expect(optionCount).toBeGreaterThan(0);
    }
  });

  // ===== 生成功能 =====

  test('点击全部生成时调用 mock API 并显示结果', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('button:has-text("全部生成")');

    const stats0 = page.locator('#stats-0');
    await expect(stats0).not.toBeEmpty({ timeout: 10000 });
    await expect(stats0).toContainText('tok');

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

    await expect(previewBtn).toHaveClass(/active/);
    await expect(sourceBtn).not.toHaveClass(/active/);

    await sourceBtn.click();
    await expect(sourceBtn).toHaveClass(/active/);
    await expect(previewBtn).not.toHaveClass(/active/);

    await previewBtn.click();
    await expect(previewBtn).toHaveClass(/active/);
  });

  // ===== 代码输入 =====

  test('手动输入代码并渲染预览', async ({ page }) => {
    await page.locator('.tc-item').first().click();

    await page.click('text=输入代码');
    const textarea = page.locator('#textarea-0');
    await textarea.fill('<h1>Test Render</h1>');

    await page.click('text=渲染预览');

    const iframe = page.locator('#iframe-0');
    await expect(iframe).toBeVisible();

    const frame = iframe.contentFrame();
    await expect(frame.locator('h1')).toHaveText('Test Render');
  });

  test('清空按钮重置分屏内容', async ({ page }) => {
    await page.locator('.tc-item').first().click();

    await page.click('text=输入代码');
    await page.locator('#textarea-0').fill('<h1>Hello</h1>');
    await page.click('text=渲染预览');
    await expect(page.locator('#iframe-0')).toBeVisible();

    await page.click('text=清空');
    await expect(page.locator('#placeholder-0')).toBeVisible();
    await expect(page.locator('#iframe-0')).toBeHidden();
    await expect(page.locator('#stats-0')).toHaveText('');
  });

  // ===== 盲评模式 =====

  test('盲评开启后隐藏下拉框并显示匿名模型名', async ({ page }) => {
    const blindBtn = page.locator('#blind-toggle');
    await expect(blindBtn).toContainText('盲评');

    await blindBtn.click();
    await expect(blindBtn).toHaveClass(/on/);

    const select0 = page.locator('#select-0');
    await expect(select0).toHaveCSS('display', 'none');

    const nameEl = page.locator('#model-name-0');
    await expect(nameEl).toContainText('模型 A');

    const nameEl1 = page.locator('#model-name-1');
    await expect(nameEl1).toContainText('模型 B');
  });

  test('盲评开启后随机分配模型，两个 pane 分配不同模型', async ({ page }) => {
    await page.click('#blind-toggle');

    const val0 = await page.locator('#select-0').inputValue();
    const val1 = await page.locator('#select-1').inputValue();

    const validIds = ['deepseek-v4-flash', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
    expect(validIds).toContain(val0);
    expect(validIds).toContain(val1);
    expect(val0).not.toBe(val1);
  });

  test('盲评生成时实际调用的是随机分配的模型', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#blind-toggle');

    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

    expect(capturedModelRequests.length).toBeGreaterThanOrEqual(2);
    expect(capturedModelRequests).toContain(assigned0);
    expect(capturedModelRequests).toContain(assigned1);
  });

  test('盲评生成后源码包含对应模型的唯一标识', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#blind-toggle');

    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

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
    expect(source0Text).not.toBe(source1Text);
  });

  test('盲评投票后揭晓模型身份', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#blind-toggle');

    const assigned0 = await page.locator('#select-0').inputValue();
    const assigned1 = await page.locator('#select-1').inputValue();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

    // Open score drawer to see the inline vote section
    await page.click('#drawer-toggle');
    await expect(page.locator('.vote-section')).toBeVisible({ timeout: 5000 });

    // Select model A (first vote-option)
    await page.locator('.vote-option').first().click();

    // Wait for blind mode to toggle off (no active session, so toggleBlindMode is called)
    await page.waitForTimeout(2000);

    // After vote, blind mode toggles off (not session mode), so button shows "盲评" again
    const blindBtn = page.locator('#blind-toggle');
    await expect(blindBtn).not.toHaveClass(/on/);

    // Model names should be restored (selects visible again, no longer anonymous)
    const select0 = page.locator('#select-0');
    await expect(select0).toBeVisible();

    const name0 = await page.locator('#model-name-0').textContent();
    expect(name0).not.toContain('模型 A');
  });

  test('盲评投票记录包含正确的模型 ID', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#blind-toggle');

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

    // Open score drawer and vote inline
    await page.click('#drawer-toggle');
    await expect(page.locator('.vote-section')).toBeVisible({ timeout: 5000 });

    await page.locator('.vote-option').first().click();
    await page.waitForTimeout(3000);

    const votes = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('benchmark_db', 2);
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
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id' });
          }
        };
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
    expect(lastVote.models).toBeTruthy();
    expect(lastVote.winner).toBeTruthy();
  });

  test('盲评关闭后恢复下拉框和模型名', async ({ page }) => {
    await page.click('#blind-toggle');
    await expect(page.locator('#select-0')).toHaveCSS('display', 'none');
    await expect(page.locator('#model-name-0')).toContainText('模型 A');

    await page.click('#blind-toggle');
    await expect(page.locator('#select-0')).toBeVisible();
    await expect(page.locator('#model-name-0')).not.toContainText('模型 A');
  });

  test('3 分屏盲评随机分配 3 个不同模型', async ({ page }) => {
    await page.selectOption('#pane-count', '3');
    await page.locator('.tc-item').first().click();
    await page.click('#blind-toggle');

    const val0 = await page.locator('#select-0').inputValue();
    const val1 = await page.locator('#select-1').inputValue();
    const val2 = await page.locator('#select-2').inputValue();

    const validIds = ['deepseek-v4-flash', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
    expect(validIds).toContain(val0);
    expect(validIds).toContain(val1);
    expect(validIds).toContain(val2);

    const unique = new Set([val0, val1, val2]);
    expect(unique.size).toBe(3);

    await expect(page.locator('#select-0')).toHaveCSS('display', 'none');
    await expect(page.locator('#select-1')).toHaveCSS('display', 'none');
    await expect(page.locator('#select-2')).toHaveCSS('display', 'none');

    await expect(page.locator('#model-name-0')).toContainText('模型 A');
    await expect(page.locator('#model-name-1')).toContainText('模型 B');
    await expect(page.locator('#model-name-2')).toContainText('模型 C');
  });

  test('非盲评模式下生成使用下拉框选中的模型', async ({ page }) => {
    await page.locator('#select-0').selectOption('claude-sonnet-4-6');
    await page.locator('#select-1').selectOption('deepseek-v4-flash');
    await page.locator('.tc-item').first().click();

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

    expect(capturedModelRequests).toContain('claude-sonnet-4-6');
    expect(capturedModelRequests).toContain('deepseek-v4-flash');

    const source0Text = await page.locator('#source-code-0').textContent();
    const source1Text = await page.locator('#source-code-1').textContent();
    expect(source0Text).toContain('UNIQUE_RESPONSE_CLAUDE_SONNET_4_6');
    expect(source1Text).toContain('UNIQUE_RESPONSE_DEEPSEEK_V4_FLASH');
  });

  // ===== 评分功能 =====

  test('保存评分后状态栏显示确认', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');

    // Click first pass button
    const firstPass = page.locator('.sc-btn').first();
    await firstPass.click();

    await page.click('button:has-text("保存评分")');
    await expect(page.locator('#status-text')).toContainText('评分已保存');
  });

  // ===== 非盲评不显示投票 =====

  test('非盲评模式不显示投票面板', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

    const overlay = page.locator('#blind-overlay');
    await expect(overlay).toBeHidden();
  });

  // ===== 统计标签页 =====

  test('统计面板显示生成数据', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 15000 });

    await page.click('[data-tab="stats"]');
    const statsContent = page.locator('#stats-content');
    await expect(statsContent).toBeVisible();
    await expect(statsContent).toContainText('生成性能', { timeout: 5000 });
  });

  // ===== 历史标签页 =====

  test('历史标签页正常显示', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');
    await page.locator('.sc-btn').first().click();
    await page.click('button:has-text("保存评分")');

    await page.click('[data-tab="history"]');
    const historyContent = page.locator('#history-content');
    await expect(historyContent).toContainText('环形进度条', { timeout: 5000 });
  });

  // ===== 批量运行 =====

  test('全选 + 批量运行流程', async ({ page }) => {
    await page.locator('#batch-select-all').check();

    const checkedCount = await page.locator('.tc-check:checked').count();
    expect(checkedCount).toBe(8);

    await page.click('#batch-run-btn');
    await expect(page.locator('#batch-run-btn')).toContainText('运行中...');
    await expect(page.locator('#batch-progress')).toBeVisible();

    await expect(page.locator('#batch-run-btn')).not.toBeDisabled({ timeout: 60000 });
    await expect(page.locator('#status-text')).toContainText('批量运行完成');
  });

  // ===== 导出功能 =====

  test('导出结果下载 JSON 文件', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');
    await page.locator('.sc-btn').first().click();
    await page.click('button:has-text("保存评分")');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("导出")'),
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
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');
    await page.locator('.sc-btn').first().click();
    await page.click('button:has-text("保存评分")');

    await page.click('[data-tab="history"]');
    await expect(page.locator('#history-content')).toContainText('环形进度条', { timeout: 5000 });

    await page.evaluate(() => { window.confirm = () => true; });
    // Target the clear button in the history view header (not the pane "清空" buttons)
    await page.locator('#tab-history button:has-text("清空")').click();

    await page.waitForTimeout(500);
    await expect(page.locator('#history-content')).toContainText('暂无记录', { timeout: 5000 });
  });

  // ===== API 配置面板 =====

  test('API 配置面板显示和关闭', async ({ page }) => {
    await page.click('text=配置');
    const dropdown = page.locator('#api-dropdown');
    await expect(dropdown).toHaveClass(/show/);
    await expect(dropdown).toContainText('API 配置');

    await page.click('#api-dropdown button:has-text("×")');
    await expect(dropdown).not.toHaveClass(/show/);
  });

  // ===== XSS 防护 =====

  test('历史记录中特殊字符不会被注入为 HTML', async ({ page }) => {
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('benchmark_db', 2);
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
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('results', 'readwrite');
          const store = tx.objectStore('results');
          store.add({
            prompt_name: '<img src=x onerror=alert(1)>',
            prompt_id: 'xss-test',
            model_scores: [
              { model_id: 'deepseek-v4-flash', model_name: '<script>alert("xss")</script>', pass_rate: 1, pass_count: 3, partial_count: 0, fail_count: 0 },
            ],
            timestamp: new Date().toISOString(),
          });
          tx.oncomplete = resolve;
        };
      });
    });

    await page.click('[data-tab="history"]');
    const historyContent = page.locator('#history-content');
    await expect(historyContent).toContainText('100%', { timeout: 5000 });

    const contentText = await historyContent.textContent();
    expect(contentText).toContain('<img src=x onerror=alert(1)>');
    expect(contentText).toContain('<script>alert("xss")</script>');

    const hasImg = await page.locator('#history-content img').count();
    const hasScript = await page.locator('#history-content script').count();
    expect(hasImg).toBe(0);
    expect(hasScript).toBe(0);
  });

  // ===== iframe 沙箱 =====

  test('生成的 HTML 在沙箱 iframe 中渲染', async ({ page }) => {
    await page.locator('.tc-item').first().click();
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
    await page.locator('.tc-item').first().click();
    await page.click('#drawer-toggle');

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.click('text=复制');
    await expect(page.locator('text=已复制')).toBeVisible({ timeout: 3000 });
  });

  // ===== 状态栏 =====

  test('状态栏显示就绪消息和模型列表', async ({ page }) => {
    const statusText = page.locator('#status-text');
    await expect(statusText).toContainText('就绪');
    await expect(statusText).toContainText('GLM');
  });

  // ===== Claude Code 路由 =====

  test('Claude 模型使用 /v1/claude-code 端点', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.locator('#select-0').selectOption('claude-sonnet-4-6');

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });

    expect(capturedModelRequests).toContain('claude-sonnet-4-6');

    const sourceText = await page.locator('#source-code-0').textContent();
    expect(sourceText).toContain('UNIQUE_RESPONSE_CLAUDE_SONNET_4_6');
  });

  test('混合模型：Claude + DeepSeek 并行生成', async ({ page }) => {
    await page.locator('.tc-item').first().click();
    await page.locator('#select-0').selectOption('claude-opus-4-7');
    await page.locator('#select-1').selectOption('deepseek-v4-flash');

    await page.click('button:has-text("全部生成")');
    await expect(page.locator('#stats-0')).toContainText('tok', { timeout: 10000 });
    await expect(page.locator('#stats-1')).toContainText('tok', { timeout: 10000 });

    expect(capturedModelRequests).toContain('claude-opus-4-7');
    expect(capturedModelRequests).toContain('deepseek-v4-flash');

    const source0 = await page.locator('#source-code-0').textContent();
    const source1 = await page.locator('#source-code-1').textContent();
    expect(source0).toContain('UNIQUE_RESPONSE_CLAUDE_OPUS_4_7');
    expect(source1).toContain('UNIQUE_RESPONSE_DEEPSEEK_V4_FLASH');
    expect(source0).not.toBe(source1);
  });

  // ===== 侧栏折叠 =====

  test('侧栏折叠和展开', async ({ page }) => {
    const sidebar = page.locator('#tc-sidebar');
    await expect(sidebar).not.toHaveClass(/collapsed/);

    await page.click('.icon-btn[title="折叠侧栏"]');
    await expect(sidebar).toHaveClass(/collapsed/);

    await page.click('.icon-btn[title="折叠侧栏"]');
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });

  // ===== Tab 导航 =====

  test('顶部标签页切换正常', async ({ page }) => {
    await expect(page.locator('#tab-compare')).toHaveClass(/active/);
    await expect(page.locator('#tab-stats')).not.toHaveClass(/active/);
    await expect(page.locator('#tab-history')).not.toHaveClass(/active/);

    await page.click('[data-tab="stats"]');
    await expect(page.locator('#tab-stats')).toHaveClass(/active/);
    await expect(page.locator('#tab-compare')).not.toHaveClass(/active/);

    await page.click('[data-tab="history"]');
    await expect(page.locator('#tab-history')).toHaveClass(/active/);

    await page.click('[data-tab="compare"]');
    await expect(page.locator('#tab-compare')).toHaveClass(/active/);
  });

});
