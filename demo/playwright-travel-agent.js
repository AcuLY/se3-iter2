/**
 * Travel Agent Gradio Web UI Demo
 * Records: Gradio interface, goal input, streaming output, final itinerary
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1280,800']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: '/Users/luca/se3-iter2/demo/recordings/',
      size: { width: 1280, height: 800 }
    }
  });
  
  const page = await context.newPage();

  try {
    console.log('[1/5] Navigating to Gradio interface...');
    await page.goto('http://localhost:7860', { timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('[2/5] Typing travel goal...');
    // Gradio textarea selector
    const textbox = await page.locator('textarea').first();
    await textbox.click();
    await page.waitForTimeout(1000);
    await textbox.fill('杭州 3 天，预算 3000，偏好美食');
    await page.waitForTimeout(2000);

    console.log('[3/5] Submitting goal...');
    // Click submit button - Gradio "提交查询" button
    const submitBtn = await page.locator('button.lg.primary').first();
    await submitBtn.click();
    await page.waitForTimeout(2000);
    
    console.log('[4/5] Waiting for agent to complete (90s max)...');
    // Wait for completion - look for itinerary/markdown output
    try {
      await page.waitForSelector('text=/行程|itinerary|markdown/i', { timeout: 90000 });
    } catch (e) {
      console.log('Completion indicator not found, waiting additional 30s...');
      await page.waitForTimeout(30000);
    }

    console.log('[5/5] Scrolling through results...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    console.log('Travel Agent demo completed successfully!');
  } catch (err) {
    console.error('Demo error:', err.message);
  } finally {
    await page.waitForTimeout(3000);
    await context.close();
    await browser.close();
  }
})();
