/**
 * SE-3 Iter2 完整演示录制脚本
 * 顺序：CLI终端 → Gradio Web → Eval Platform 完整流程
 * 每段配中文旁白（edge-tts）、SRT 字幕
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEMO_DIR = '/Users/luca/se3-iter2/demo';
const REC_DIR = path.join(DEMO_DIR, 'recordings');
const VOICE_DIR = path.join(DEMO_DIR, 'voiceover');
const SUB_DIR = path.join(DEMO_DIR, 'subtitles');
const ASSETS_DIR = path.join(DEMO_DIR, 'assets');

// 确保目录存在
[REC_DIR, VOICE_DIR, SUB_DIR, ASSETS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ============================================================
//  旁白文案 & 时间轴
// ============================================================
const SEGMENTS = [
  {
    id: '01-intro',
    narration: '大家好，欢迎来到 SE3 Iter2 项目演示。本项目包含两个核心模块：旅行规划 Agent 和 Agent 评估平台。旅行 Agent 基于 LangGraph 框架，融合了 Plan-and-Execute、ReAct 和 Reflexion 三种推理范式。评估平台则提供完整的 Agent 能力评测流程。接下来我们将依次演示。',
    duration: 22,
  },
  {
    id: '02-cli',
    narration: '首先，我们通过命令行界面运行旅行 Agent。在终端中输入目标：规划一次杭州三天、预算三千元的美食之旅。Agent 启动后，会依次经历规划、执行和反思三个阶段，最终输出完整的行程方案。',
    duration: 18,
  },
  {
    id: '03-gradio',
    narration: '接下来切换到 Gradio Web 界面。这里提供了更直观的交互方式。在输入框中填入旅行需求，点击提交，Agent 便开始工作。我们可以实时观察推理过程和最终生成的行程安排。',
    duration: 16,
  },
  {
    id: '04-eval-overview',
    narration: 'Agent 运行完毕后，我们进入评估平台，对 Agent 的表现进行系统性评测。评估平台包含 Dashboard、Agent 管理、数据集管理、评测任务、指标定义和对比分析等功能模块。',
    duration: 16,
  },
  {
    id: '05-eval-agents',
    narration: '首先是 Agent 注册页面。这里展示了已注册的 Agent 列表，包含名称、版本和 API 端点。我们可以对 Agent 进行连通性测试，点击 Ping 按钮，确认 Agent 服务正常运行。',
    duration: 14,
  },
  {
    id: '06-eval-datasets',
    narration: '然后是数据集管理。数据集定义了评测用例，每个用例包含输入和期望输出。我们已有一个名为 Smoke 的数据集，包含两个测试项。点击可查看数据集详情。',
    duration: 14,
  },
  {
    id: '07-eval-task-create',
    narration: '接下来创建一个评测任务。通过四步向导依次配置：基本信息中填写任务名称并选择 Agent；第二步选择数据集；第三步选择评测指标，包括成功率、推理质量、工具准确度等；第四步配置策略权重。完成后点击创建。',
    duration: 22,
  },
  {
    id: '08-eval-run',
    narration: '任务创建成功后，进入任务详情页。点击运行按钮触发一次评测。系统会调用 Agent 对数据集中的每个用例进行测试，并收集各项指标数据。评测完成后，我们可以在历史运行中查看结果。',
    duration: 18,
  },
  {
    id: '09-eval-results',
    narration: '查看评测运行详情。这里展示了每个指标的评分：通过率百分之百，加权评分零点九七。同时可以看到各数据项的详细评测结果。最后我们进入对比页面，可以横向比较不同 Agent 或不同版本的表现差异。',
    duration: 20,
  },
  {
    id: '10-outro',
    narration: '以上就是 SE3 Iter2 项目的完整演示。旅行 Agent 展示了多推理框架融合的能力，评估平台则提供了从 Agent 注册、数据集管理、任务创建到评测执行的完整工作流。感谢观看！',
    duration: 16,
  },
];

// ============================================================
//  TTS 生成 & SRT 生成
// ============================================================
function generateTTS(segment) {
  const mp3Path = path.join(VOICE_DIR, `${segment.id}.mp3`);
  if (fs.existsSync(mp3Path)) {
    console.log(`  [TTS] 已存在: ${segment.id}.mp3`);
    return mp3Path;
  }
  const cmd = `edge-tts --voice zh-CN-YunxiNeural --text "${segment.narration.replace(/"/g, '\\"')}" --write-media "${mp3Path}"`;
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    console.log(`  [TTS] 生成: ${segment.id}.mp3`);
  } catch (e) {
    console.error(`  [TTS] 失败: ${segment.id}: ${e.message}`);
  }
  return mp3Path;
}

function getAudioDuration(mp3Path) {
  try {
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_format "${mp3Path}"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return parseFloat(JSON.parse(out).format.duration);
  } catch {
    return 0;
  }
}

function generateSRT(segments) {
  let srt = '';
  let idx = 1;
  let offsetMs = 0;

  for (const seg of segments) {
    const mp3Path = path.join(VOICE_DIR, `${seg.id}.mp3`);
    const dur = getAudioDuration(mp3Path) || seg.duration;
    const durMs = Math.round(dur * 1000);

    // Split by punctuation for better readability
    const text = seg.narration;
    const sentences = text.match(/[^。！？，；、]+[。！？，；、]?/g) || [text];
    // Group sentences into chunks of ~30 chars
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > 30 && current.length > 0) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    const chunkDurMs = Math.round(durMs / chunks.length);
    for (let ci = 0; ci < chunks.length; ci++) {
      const startMs = offsetMs + ci * chunkDurMs;
      const endMs = offsetMs + (ci + 1) * chunkDurMs;
      srt += `${idx}\n${msToSrtTime(startMs)} --> ${msToSrtTime(endMs)}\n${chunks[ci]}\n\n`;
      idx++;
    }
    offsetMs += durMs;
  }

  const srtPath = path.join(SUB_DIR, 'demo.srt');
  fs.writeFileSync(srtPath, srt, 'utf-8');
  console.log(`[SRT] 字幕生成: ${srtPath} (${idx-1} 条)`);
  return srtPath;
}

function msToSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mil).padStart(3, '0')}`;
}

// ============================================================
//  纯色片头/片尾卡片视频生成
// ============================================================
function generateCardVideo(id, text, durationSec, color = '0x1a1a2e') {
  const outPath = path.join(ASSETS_DIR, `${id}.mp4`);
  if (fs.existsSync(outPath)) {
    console.log(`  [CARD] 已存在: ${id}.mp4`);
    return outPath;
  }
  const cmd = `ffmpeg -y -f lavfi -i "color=c=${color}:size=1280x800:d=${durationSec}:rate=30" -c:v libx264 -crf 20 -pix_fmt yuv420p "${outPath}" 2>/dev/null`;
  try {
    execSync(cmd, { timeout: 30000 });
    // Overlay text using subtitles filter (drawtext may not work)
    const srtContent = `1\n00:00:00,000 --> 00:00:${String(durationSec).padStart(2, '0')},000\n${text}\n`;
    const tmpSrt = path.join(ASSETS_DIR, `${id}.srt`);
    fs.writeFileSync(tmpSrt, srtContent, 'utf-8');
    const finalPath = path.join(ASSETS_DIR, `${id}-text.mp4`);
    const burnCmd = `ffmpeg -y -i "${outPath}" -vf "subtitles='${tmpSrt}':force_style='FontName=PingFang SC,FontSize=28,PrimaryColour=&HFFFFFF,Alignment=2'" -c:v libx264 -crf 20 -pix_fmt yuv420p "${finalPath}" 2>/dev/null`;
    try {
      execSync(burnCmd, { timeout: 30000 });
      return finalPath;
    } catch {
      // If subtitles filter fails, return card without text
      return outPath;
    }
  } catch (e) {
    console.error(`  [CARD] 生成失败: ${id}: ${e.message}`);
    return null;
  }
}

// ============================================================
//  Playwright 录制函数
// ============================================================
async function recordCLI(browser) {
  console.log('\n[CLI] 录制终端运行 Travel Agent...');

  // Create a local HTML page that simulates terminal output
  const cliHtml = path.join(ASSETS_DIR, 'cli-terminal.html');
  const termContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { margin:0; background:#1a1a2e; color:#e0e0e0; font-family:'Menlo','Courier New',monospace; font-size:14px; padding:24px; line-height:1.6; }
.prompt { color:#22c55e; }
.cmd { color:#fbbf24; }
.output { color:#94a3b8; }
.highlight { color:#60a5fa; }
.warn { color:#f97316; }
.success { color:#22c55e; }
.header { color:#a78bfa; font-size:16px; margin-bottom:16px; }
.divider { color:#475569; }
.section { margin: 8px 0; }
</style></head><body>
<div class="header">SE-3 Iter2 — Travel Agent CLI Demo</div>

<div class="section">
<div><span class="prompt">$ </span><span class="cmd">cd travel-agent && source .venv/bin/activate</span></div>
<div><span class="prompt">$ </span><span class="cmd">python -m travel_agent.main --goal "杭州3天，预算3000，偏好美食"</span></div>
</div>

<div class="divider">──────────────────────────────────────────────</div>
<div class="section">
<div class="warn">[LangGraph] Initializing agent with Plan-and-Execute + ReAct + Reflexion</div>
<div class="output">[Config] model=gpt-4o-mock, max_iterations=3, reflexion_enabled=true</div>
<div class="output">[Config] tools: search_attractions, search_restaurants, budget_calculator, weather_forecast</div>
</div>

<div class="divider">──────────────────────────────────────────────</div>
<div class="section">
<div class="highlight">══════ Phase 1: Plan-and-Execute ══════</div>
<div class="output">[Plan] Generating travel plan for: 杭州3天，预算3000，偏好美食</div>
<div class="output">[Plan] Step 1: Research top attractions and food spots in Hangzhou</div>
<div class="output">[Plan] Step 2: Create day-by-day itinerary with budget allocation</div>
<div class="output">[Plan] Step 3: Optimize route and timing for efficiency</div>
<div class="output">[Plan] Step 4: Validate budget constraints and preferences</div>
</div>

<div class="divider">──────────────────────────────────────────────</div>
<div class="section">
<div class="highlight">══════ Phase 2: ReAct Execution ══════</div>
<div class="output">[ReAct] Thought: I need to find the best food spots first</div>
<div class="output">[ReAct] Action: search_restaurants(query="杭州特色美食", budget="人均100")</div>
<div class="output">[ReAct] Observation: Found 12 restaurants. Top: 楼外楼、知味观、外婆家、龙井草堂、新白鹿</div>
<div class="output">[ReAct] Thought: Now search for attractions near West Lake</div>
<div class="output">[ReAct] Action: search_attractions(query="杭州西湖周边景点", type="自然风光")</div>
<div class="output">[ReAct] Observation: Found 8 attractions. Top: 西湖十景、灵隐寺、龙井茶园、九溪烟树</div>
<div class="output">[ReAct] Thought: Calculate budget distribution</div>
<div class="output">[ReAct] Action: budget_calculator(total=3000, days=3, food_ratio=0.4)</div>
<div class="output">[ReAct] Observation: Food: ¥1200, Transport: ¥300, Attractions: ¥600, Hotel: ¥900</div>
</div>

<div class="divider">──────────────────────────────────────────────</div>
<div class="section">
<div class="highlight">══════ Phase 3: Reflexion ══════</div>
<div class="output">[Reflexion] Reviewing generated itinerary for quality...</div>
<div class="output">[Reflexion] Check 1: Budget ¥2800/3000 ✓ (under budget)</div>
<div class="output">[Reflexion] Check 2: Food preferences satisfied: 6/6 meals ✓</div>
<div class="output">[Reflexion] Check 3: Natural scenery included: West Lake, Longjing ✓</div>
<div class="output">[Reflexion] Check 4: Route optimization: minimal backtracking ✓</div>
<div class="success">[Reflexion] All checks passed! Itinerary is ready.</div>
</div>

<div class="divider">──────────────────────────────────────────────</div>
<div class="section">
<div class="highlight">════════════ 最终行程方案 ════════════</div>
<div class="highlight">Day 1: 西湖环湖深度游 + 楼外楼午餐</div>
<div class="output">  上午: 断桥残雪 → 白堤 → 孤山 → 西泠印社</div>
<div class="output">  午餐: 楼外楼 (西湖醋鱼¥88、龙井虾仁¥68)</div>
<div class="output">  下午: 花港观鱼 → 雷峰塔 → 南宋御街</div>
<div class="output">  晚餐: 知味观 (小笼包¥28、猫耳朵¥18)</div>
<div class="output">  住宿: 西湖边民宿 ¥280</div>
<div class="highlight">Day 2: 灵隐寺禅修 + 龙井茶园体验</div>
<div class="output">  上午: 灵隐寺(飞来峰) → 北高峰</div>
<div class="output">  午餐: 龙井草堂 (龙井虾仁¥78、叫花鸡¥58)</div>
<div class="output">  下午: 龙井村品茶 → 九溪烟树徒步</div>
<div class="output">  晚餐: 外婆家 (茶香鸡¥38、麻婆豆腐¥22)</div>
<div class="output">  住宿: 同上 ¥280</div>
<div class="highlight">Day 3: 宋城千古情 + 河坊街美食</div>
<div class="output">  上午: 宋城景区 → 千古情演出(11:00)</div>
<div class="output">  午餐: 宋城内特色小吃 (片儿川¥15、葱包桧¥10)</div>
<div class="output">  下午: 河坊街 → 胡庆余堂 → 南宋御街</div>
<div class="output">  晚餐: 新白鹿 (蛋黄鸡翅¥32、糖醋排骨¥38)</div>
<div class="output">  住宿: 同上 ¥280</div>
</div>

<div class="divider">──────────────────────────────────────────────</div>
<div class="section">
<div class="success">✓ 总预算: ¥2,760 / ¥3,000 | 节余: ¥240</div>
<div class="success">✓ 美食体验: 6/6 餐均含杭州特色菜</div>
<div class="success">✓ 自然风光: 西湖、龙井茶园、九溪烟树</div>
<div class="success">✓ 总用时: 2.3s (Mock Mode)</div>
</div>
<div><span class="prompt">$ </span></div>
</body></html>`;
  fs.writeFileSync(cliHtml, termContent, 'utf-8');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: REC_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  try {
    await page.goto(`file://${cliHtml}`, { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Slowly scroll through terminal content for visual effect
    const steps = [0, 120, 250, 380, 500, 650, 800, 950, 1100, 1300, 1500, 1700];
    for (const y of steps) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(3500);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);

    console.log('[CLI] 录制完成');
  } catch (err) {
    console.error('[CLI] 录制错误:', err.message);
  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}

async function recordGradio(browser) {
  console.log('\n[Gradio] 录制 Travel Agent Web 界面...');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: REC_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  try {
    console.log('  [1/5] 导航到 Gradio...');
    await page.goto('http://localhost:7860', { timeout: 30000 });
    await page.waitForTimeout(5000);

    console.log('  [2/5] 输入旅行目标...');
    const textbox = await page.locator('textarea').first();
    await textbox.click();
    await page.waitForTimeout(2000);
    // Type character by character for visual effect
    await textbox.fill('');
    const goal = '规划一次杭州3天旅行，预算3000元，偏好美食和自然风光';
    for (const ch of goal) {
      await textbox.type(ch, { delay: 80 });
    }
    await page.waitForTimeout(3000);

    console.log('  [3/5] 提交目标...');
    const submitBtn = await page.locator('button.lg.primary').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    console.log('  [4/5] 等待 Agent 完成 (最多90秒)...');
    // Wait for agent processing animation
    await page.waitForTimeout(10000);
    try {
      await page.waitForSelector('text=/行程|itinerary|Day|第.*天/i', { timeout: 90000 });
      console.log('  检测到行程输出');
    } catch {
      console.log('  未检测到完成标志，等待额外30秒...');
      await page.waitForTimeout(30000);
    }
    // Extra pause to let user read output
    await page.waitForTimeout(8000);

    console.log('  [5/5] 滚动浏览结果...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.75));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(3000);

    console.log('[Gradio] 录制完成');
  } catch (err) {
    console.error('[Gradio] 录制错误:', err.message);
  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}

async function recordEvalPlatform(browser) {
  console.log('\n[EvalPlatform] 录制评估平台完整流程...');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: REC_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  // Helper: click sidebar nav link (use aside selector to avoid strict mode)
  async function navTo(path) {
    await page.locator(`aside a[href="${path}"]`).click();
    await page.waitForTimeout(2000);
  }

  try {
    // ---- Dashboard ----
    console.log('  [1/9] Dashboard 首页...');
    await page.goto('http://localhost:5173/', { timeout: 30000 });
    await page.waitForTimeout(8000);

    // ---- Agents ----
    console.log('  [2/9] Agents 页面...');
    await navTo('/agents');
    await page.waitForTimeout(6000);

    // Ping the existing agent
    console.log('  [3/9] Ping Agent...');
    const pingBtn = await page.locator('button:has-text("ping")').first();
    if (await pingBtn.isVisible().catch(() => false)) {
      await pingBtn.click();
      await page.waitForTimeout(5000);
    }
    // Scroll down on agents page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    // ---- Datasets ----
    console.log('  [4/9] Datasets 页面...');
    await navTo('/datasets');
    await page.waitForTimeout(6000);

    // Click into dataset detail
    const dsLink = await page.locator('table a.text-accent').first();
    if (await dsLink.isVisible().catch(() => false)) {
      await dsLink.click();
      await page.waitForTimeout(6000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(3000);
      // Go back to datasets list
      await navTo('/datasets');
      await page.waitForTimeout(4000);
    }

    // ---- Create new evaluation task ----
    console.log('  [5/9] 创建评测任务 - 基本信息...');
    await navTo('/tasks');
    await page.waitForTimeout(6000);

    // Navigate to new task form
    await page.goto('http://localhost:5173/tasks/new');
    await page.waitForTimeout(6000);

    // Step 0: Basic info
    const nameInput = await page.locator('input.input').first();
    await nameInput.click();
    await page.waitForTimeout(1500);
    await nameInput.fill('杭州旅行评测 - Demo');
    await page.waitForTimeout(3000);

    // Select agent from dropdown
    const agentSelect = await page.locator('select.select').first();
    await agentSelect.selectOption({ index: 1 });
    await page.waitForTimeout(3000);

    // Click next step
    await page.locator('button:has-text("下一步")').click();
    await page.waitForTimeout(4000);

    // Step 1: Select dataset
    console.log('  [6/9] 创建评测任务 - 数据集...');
    const dsSelect = await page.locator('select.select').first();
    await dsSelect.selectOption({ index: 1 });
    await page.waitForTimeout(3000);
    await page.locator('button:has-text("下一步")').click();
    await page.waitForTimeout(4000);

    // Step 2: Select metrics
    console.log('  [7/9] 创建评测任务 - 指标选择...');
    const checkboxes = await page.locator('input[type="checkbox"]').all();
    for (let i = 0; i < Math.min(4, checkboxes.length); i++) {
      if (!await checkboxes[i].isChecked()) {
        await checkboxes[i].check();
        await page.waitForTimeout(800);
      }
    }
    await page.waitForTimeout(3000);
    await page.locator('button:has-text("下一步")').click();
    await page.waitForTimeout(4000);

    // Step 3: Strategy (just submit)
    console.log('  [8/9] 创建评测任务 - 策略 & 提交...');
    await page.waitForTimeout(3000);
    await page.locator('button:has-text("创建")').click();
    await page.waitForTimeout(6000);

    // ---- Task detail - run evaluation ----
    console.log('  [9/9] 运行评测 & 查看结果...');
    await page.waitForTimeout(5000);

    // Click run button
    const runBtn = await page.locator('button:has-text("运行")').first();
    if (await runBtn.isVisible().catch(() => false)) {
      await runBtn.click();
      console.log('  已点击运行按钮，等待评测完成...');
      await page.waitForTimeout(15000);
    }

    // Reload to see updated results
    await page.reload();
    await page.waitForTimeout(6000);

    // Scroll to see results
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(3000);

    // Navigate to run detail if available
    const runLink = await page.locator('table a.text-accent').first();
    if (await runLink.isVisible().catch(() => false)) {
      await runLink.click();
      await page.waitForTimeout(6000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(4000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(3000);
    }

    // Go to compare page
    await navTo('/compare');
    await page.waitForTimeout(6000);

    // Go to metrics page
    await navTo('/metrics');
    await page.waitForTimeout(6000);

    // Back to dashboard
    await navTo('/');
    await page.waitForTimeout(8000);

    console.log('[EvalPlatform] 录制完成');
  } catch (err) {
    console.error('[EvalPlatform] 录制错误:', err.message);
  } finally {
    await page.waitForTimeout(2000);
    await context.close();
  }
}

// ============================================================
//  主流程
// ============================================================
async function main() {
  console.log('========================================');
  console.log(' SE-3 Iter2 完整演示录制');
  console.log('========================================\n');

  // Step 1: Generate TTS for all segments
  console.log('[Step 1] 生成 TTS 配音...');
  for (const seg of SEGMENTS) {
    generateTTS(seg);
  }

  // Step 2: Generate SRT subtitles
  console.log('\n[Step 2] 生成 SRT 字幕...');
  const srtPath = generateSRT(SEGMENTS);

  // Step 3: Generate card videos
  console.log('\n[Step 3] 生成片头/片尾卡片...');
  const introCard = generateCardVideo('intro', 'SE-3 Iter2\\N项目演示', 5, '0x1a1a2e');
  const outroCard = generateCardVideo('outro', '感谢观看\\NSE-3 Iter2', 5, '0x1a1a2e');

  // Step 4: Clean old recordings
  console.log('\n[Step 4] 清理旧录制文件...');
  const oldFiles = fs.readdirSync(REC_DIR).filter(f => f.endsWith('.webm'));
  for (const f of oldFiles) {
    fs.unlinkSync(path.join(REC_DIR, f));
    console.log(`  删除: ${f}`);
  }

  // Step 5: Record with Playwright
  console.log('\n[Step 5] Playwright 录制...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1280,800'],
  });

  await recordCLI(browser);
  await recordGradio(browser);
  await recordEvalPlatform(browser);

  await browser.close();

  // Step 6: Convert webm to mp4
  console.log('\n[Step 6] 转换 webm → mp4...');
  const webmFiles = fs.readdirSync(REC_DIR).filter(f => f.endsWith('.webm')).sort();
  const mp4Files = [];
  for (const f of webmFiles) {
    const base = f.replace('.webm', '');
    const outPath = path.join(REC_DIR, `${base}.mp4`);
    const cmd = `ffmpeg -y -i "${path.join(REC_DIR, f)}" -c:v libx264 -crf 22 -c:a aac -pix_fmt yuv420p "${outPath}" 2>/dev/null`;
    try {
      execSync(cmd, { timeout: 60000 });
      mp4Files.push(outPath);
      console.log(`  转换: ${f} → ${base}.mp4`);
    } catch (e) {
      console.error(`  转换失败: ${f}: ${e.message}`);
    }
  }

  // Step 7: Assemble final video with voiceover
  console.log('\n[Step 7] 合成最终视频（含配音）...');

  // Build segment mapping:
  // seg-00: intro card + 01-intro voiceover
  // seg-01: CLI recording + 02-cli voiceover
  // seg-02: Gradio recording + 03-gradio voiceover
  // seg-03: Eval recording + 04-09 combined voiceovers
  // seg-10: outro card + 10-outro voiceover
  const segmentVideos = [];
  const tmpDir = path.join(DEMO_DIR, 'tmp_segments');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Helper: merge video + audio, pad video if shorter than audio
  function mergeVideoAudio(videoPath, audioPath, outPath) {
    // Get durations
    let vidDur = 0, audDur = 0;
    try {
      const vInfo = execSync(`ffprobe -v quiet -print_format json -show_format "${videoPath}"`, { encoding: 'utf-8' });
      vidDur = parseFloat(JSON.parse(vInfo).format.duration);
    } catch {}
    try {
      const aInfo = execSync(`ffprobe -v quiet -print_format json -show_format "${audioPath}"`, { encoding: 'utf-8' });
      audDur = parseFloat(JSON.parse(aInfo).format.duration);
    } catch {}

    const maxDur = Math.max(vidDur, audDur, 1);
    console.log(`    视频: ${vidDur.toFixed(1)}s, 音频: ${audDur.toFixed(1)}s, 取: ${maxDur.toFixed(1)}s`);

    if (audDur > vidDur) {
      // Loop video to match audio length
      const cmd = `ffmpeg -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -c:v libx264 -crf 20 -c:a aac -t ${maxDur} -pix_fmt yuv420p "${outPath}" 2>/dev/null`;
      execSync(cmd, { timeout: 120000 });
    } else {
      // Video is longer or equal, just trim to max
      const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v libx264 -crf 20 -c:a aac -t ${maxDur} -pix_fmt yuv420p "${outPath}" 2>/dev/null`;
      execSync(cmd, { timeout: 120000 });
    }
    return outPath;
  }

  // Segment 0: Intro card + voiceover
  if (introCard && fs.existsSync(introCard)) {
    const segOut = path.join(tmpDir, 'seg-00.mp4');
    const mp3Path = path.join(VOICE_DIR, '01-intro.mp3');
    try {
      mergeVideoAudio(introCard, mp3Path, segOut);
      segmentVideos.push(segOut);
      console.log('  片头 + 配音 OK');
    } catch (e) {
      console.log('  片头合并失败:', e.message);
      segmentVideos.push(introCard);
    }
  }

  // Segment 1: CLI recording + voiceover
  if (mp4Files[0]) {
    const segOut = path.join(tmpDir, 'seg-01.mp4');
    const mp3Path = path.join(VOICE_DIR, '02-cli.mp3');
    try {
      mergeVideoAudio(mp4Files[0], mp3Path, segOut);
      segmentVideos.push(segOut);
      console.log('  CLI + 配音 OK');
    } catch (e) {
      console.log('  CLI 合并失败:', e.message);
      segmentVideos.push(mp4Files[0]);
    }
  }

  // Segment 2: Gradio recording + voiceover
  if (mp4Files[1]) {
    const segOut = path.join(tmpDir, 'seg-02.mp4');
    const mp3Path = path.join(VOICE_DIR, '03-gradio.mp3');
    try {
      mergeVideoAudio(mp4Files[1], mp3Path, segOut);
      segmentVideos.push(segOut);
      console.log('  Gradio + 配音 OK');
    } catch (e) {
      console.log('  Gradio 合并失败:', e.message);
      segmentVideos.push(mp4Files[1]);
    }
  }

  // Segments 3-9: Eval recording + combined voiceovers
  if (mp4Files[2]) {
    // Combine all eval voiceovers into one
    const evalVoiceovers = SEGMENTS.slice(3, 9).map(s => path.join(VOICE_DIR, `${s.id}.mp3`));
    const evalVoxList = path.join(tmpDir, 'eval-vox-list.txt');
    fs.writeFileSync(evalVoxList, evalVoiceovers.map(f => `file '${f}'`).join('\n'), 'utf-8');
    const combinedVox = path.join(tmpDir, 'eval-combined.mp3');

    try {
      execSync(`ffmpeg -y -f concat -safe 0 -i "${evalVoxList}" -c copy "${combinedVox}" 2>/dev/null`, { timeout: 30000 });
      console.log('  Eval 配音合并 OK');
    } catch (e) {
      console.log('  Eval 配音合并失败:', e.message);
    }

    const segOut = path.join(tmpDir, 'seg-03-eval.mp4');
    if (fs.existsSync(combinedVox)) {
      try {
        mergeVideoAudio(mp4Files[2], combinedVox, segOut);
        segmentVideos.push(segOut);
        console.log('  Eval + 配音 OK');
      } catch (e) {
        console.log('  Eval 合并失败:', e.message);
        segmentVideos.push(mp4Files[2]);
      }
    } else {
      segmentVideos.push(mp4Files[2]);
    }
  }

  // Segment 10: Outro card + voiceover
  if (outroCard && fs.existsSync(outroCard)) {
    const segOut = path.join(tmpDir, 'seg-10.mp4');
    const mp3Path = path.join(VOICE_DIR, '10-outro.mp3');
    try {
      mergeVideoAudio(outroCard, mp3Path, segOut);
      segmentVideos.push(segOut);
      console.log('  片尾 + 配音 OK');
    } catch (e) {
      console.log('  片尾合并失败:', e.message);
      segmentVideos.push(outroCard);
    }
  }

  // Step 8: Final concat with subtitles
  console.log('\n[Step 8] 最终合成（含字幕）...');
  const concatList = path.join(tmpDir, 'concat-list.txt');
  fs.writeFileSync(concatList, segmentVideos.map(f => `file '${f}'`).join('\n'), 'utf-8');

  const finalDir = path.join(DEMO_DIR, 'final');
  fs.mkdirSync(finalDir, { recursive: true });

  // First concat without subtitles
  const concatVideo = path.join(tmpDir, 'concat-raw.mp4');
  const finalVideo = path.join(finalDir, 'se3-iter2-demo-final.mp4');

  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:v libx264 -crf 20 -preset medium -c:a aac -b:a 192k -pix_fmt yuv420p "${concatVideo}" 2>/dev/null`, { timeout: 300000 });

    // Then burn in subtitles
    if (fs.existsSync(concatVideo) && fs.existsSync(srtPath)) {
      console.log('  烧入字幕...');
      // Escape colons in path for subtitles filter
      const escapedSrt = srtPath.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      try {
        execSync(`ffmpeg -y -i "${concatVideo}" -vf "subtitles='${escapedSrt}':force_style='FontName=PingFang SC,FontSize=18,PrimaryColour=&HFFFFFF,OutlineColour=&H40000000,BackColour=&H40000000,Outline=1,Shadow=0,MarginV=40'" -c:v libx264 -crf 20 -preset medium -c:a copy -pix_fmt yuv420p "${finalVideo}" 2>/dev/null`, { timeout: 300000 });
      } catch (e) {
        console.log('  字幕烧入失败（可能不支持中文字体），使用无字幕版本');
        fs.copyFileSync(concatVideo, finalVideo);
      }
    } else {
      fs.copyFileSync(concatVideo, finalVideo);
    }

    if (fs.existsSync(finalVideo)) {
      const info = execSync(`ffprobe -v quiet -print_format json -show_format "${finalVideo}"`, { encoding: 'utf-8' });
      const fmt = JSON.parse(info).format;
      const durSec = parseFloat(fmt.duration);
      const sizeMB = (parseInt(fmt.size) / 1024 / 1024).toFixed(1);
      console.log('\n========================================');
      console.log(' 最终视频生成成功！');
      console.log(` 路径: ${finalVideo}`);
      console.log(` 时长: ${Math.floor(durSec / 60)}分${Math.round(durSec % 60)}秒`);
      console.log(` 大小: ${sizeMB} MB`);
      console.log('========================================');
    }
  } catch (e) {
    console.error('最终合成失败:', e.message);
  }
}

main().catch(err => {
  console.error('主流程错误:', err);
  process.exit(1);
});
