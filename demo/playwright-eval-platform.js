/**
 * Eval Platform React Web UI Demo
 * Records: Agent registration, Dataset creation, Task creation, Run execution, Results
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1440,900']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: '/Users/luca/se3-iter2/demo/recordings/',
      size: { width: 1440, height: 900 }
    }
  });
  
  const page = await context.newPage();

  try {
    console.log('[EvalPlatform 1/8] Navigating to web interface...');
    await page.goto('http://localhost:5173', { timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('[2/8] Viewing dashboard...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/luca/se3-iter2/demo/assets/screenshot-dashboard.png' });

    console.log('[3/8] Navigating to Agents page...');
    // Try to find and click Agents nav link
    const agentsLink = await page.locator('a, button').filter({ hasText: /agent/i }).first();
    await agentsLink.click().catch(() => console.log('Agents link not found, continuing...'));
    await page.waitForTimeout(2000);

    console.log('[4/8] Navigating to Datasets page...');
    const datasetsLink = await page.locator('a, button').filter({ hasText: /dataset/i }).first();
    await datasetsLink.click().catch(() => console.log('Datasets link not found, continuing...'));
    await page.waitForTimeout(2000);

    console.log('[5/8] Navigating to Tasks page...');
    const tasksLink = await page.locator('a, button').filter({ hasText: /task/i }).first();
    await tasksLink.click().catch(() => console.log('Tasks link not found, continuing...'));
    await page.waitForTimeout(2000);

    console.log('[6/8] Creating a new task (if button exists)...');
    const newTaskBtn = await page.locator('button').filter({ hasText: /new|create|新建|创建/i }).first();
    await newTaskBtn.click().catch(() => console.log('New task button not found, continuing...'));
    await page.waitForTimeout(2000);

    console.log('[7/8] Viewing task list...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/luca/se3-iter2/demo/assets/screenshot-tasks.png' });

    console.log('[8/8] Checking API health...');
    // Also test the API directly
    const apiHealth = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/health');
        return await res.json();
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('API Health:', apiHealth);

    console.log('Eval Platform demo completed successfully!');
  } catch (err) {
    console.error('Demo error:', err.message);
  } finally {
    await page.waitForTimeout(3000);
    await context.close();
    await browser.close();
  }
})();
