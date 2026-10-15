import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const screenshots = path.resolve(import.meta.dirname, '../../docs/screenshots');
async function nav(page: Page, name: string) {
  await page
    .locator('nav')
    .getByRole('button', { name: new RegExp(name) })
    .click();
}
async function close(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
}
async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
}

test('MiniLab: all five pages render real seeded data and graph node details', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync(screenshots, { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工程总览', exact: true })).toBeVisible();
  await expect(page.locator('.project-banner h2')).toHaveText('MiniLab');
  await expect(page.locator('.metric-card').first().locator('strong')).toHaveText('09');
  await expect(page.getByText('已测试 · 未提供证据')).toBeVisible();
  await expect(page.getByLabel('功能状态统计').locator('b')).toHaveText(['9', '0', '0', '0']);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'overview.png'), fullPage: true });
  await nav(page, 'Board');
  await expect(page.locator('.board-card')).toHaveCount(9);
  await page.getByRole('button', { name: '展开 F06', exact: true }).click();
  await expect(page.locator('.card-expanded')).toContainText('[Demo] 资源采集方案');
  await expect(page.locator('.card-expanded')).toContainText('GPU 指标采集方式待定');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'board.png'), fullPage: true });
  await nav(page, 'Graph');
  await page.getByLabel('图谱功能筛选').selectOption({ label: 'F06 · CPU/GPU 资源调度与监控' });
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await page.locator('.graph-node').filter({ hasText: '[Demo] 资源采集方案' }).click();
  await expect(page.getByRole('dialog')).toContainText('方案版本');
  await close(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'graph.png'), fullPage: true });
  await nav(page, 'Decisions');
  await page.locator('.proposal-title').filter({ hasText: '资源采集方案' }).click();
  await expect(page.getByLabel('方案版本')).toHaveValue('1');
  await page.getByRole('button', { name: /比较相邻版本/ }).click();
  await expect(page.getByLabel('相邻版本差异')).toContainText('统一资源接口');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'proposal-history.png'), fullPage: true });
  await close(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'decisions.png'), fullPage: true });
  await nav(page, 'Timeline');
  await page.getByLabel('对象类型', { exact: true }).selectOption('proposal');
  await page.getByLabel('事件类型', { exact: true }).selectOption('proposal.revised');
  await expect(page.locator('.timeline-list .event-row')).toHaveCount(2);
  await page.locator('.timeline-list .event-row').first().click();
  await expect(page.getByRole('dialog')).toContainText('方案详情');
  await close(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'timeline.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('UI vertical loop: create project, feature, task, proposal V2, accepted ADR and refresh', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.project-banner')).toBeVisible();
  await page.getByRole('button', { name: '新建工程', exact: true }).click();
  await page.getByLabel('工程名称', { exact: true }).fill('E2E Engineering');
  await page.getByLabel('工程说明').fill('A browser-tested project');
  await save(page);
  await expect(page.locator('.project-banner h2')).toHaveText('E2E Engineering');
  await page.getByRole('button', { name: '新建功能', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('E2E 数据接口');
  await page.getByLabel('功能编号').fill('F01');
  await save(page);
  await expect(page.getByRole('dialog')).toContainText('功能详情');
  await close(page);
  await nav(page, 'Board');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('E2E 实现接口');
  await save(page);
  // Wait for the saved object's details; the form also has a Close button.
  await expect(page.getByRole('dialog')).toContainText('任务详情');
  await close(page);
  await page.locator('.segmented').getByRole('button', { name: /任务/ }).click();
  const status = page.getByLabel('任务状态 E2E 实现接口');
  await expect(status).toHaveValue('planned');
  await expect(status.locator('option[value="implemented"]')).toHaveCount(0);
  await status.selectOption('in_progress');
  await expect(status).toHaveValue('in_progress');
  await status.selectOption('implemented');
  await expect(status).toHaveValue('implemented');
  await expect(page.locator('.column-implemented .board-card')).toHaveCount(1);
  await nav(page, 'Overview');
  await expect(page.getByText('0 开发中 · 1 实现完成')).toBeVisible();
  await expect(page.locator('.metric-card').first()).toContainText('1 个尚待开发');
  await nav(page, 'Decisions');
  await page.getByRole('button', { name: '新建方案', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('E2E API 方案');
  await page.getByLabel('方案正文').fill('V1: REST API');
  await page.getByLabel('修改原因').fill('初始设计');
  await save(page);
  await expect(page.getByRole('dialog')).toContainText('V1: REST API');
  await page.getByRole('dialog').getByRole('button', { name: '新增版本', exact: true }).click();
  await expect(page.getByLabel('方案正文')).toHaveValue('V1: REST API');
  await page.getByLabel('方案正文').fill('V2: REST API with validation');
  await page.getByLabel('修改原因').fill('增加引用校验');
  await page.getByRole('button', { name: '保存 V2', exact: true }).click();
  await expect(page.getByLabel('方案版本')).toHaveValue('1');
  await page.getByLabel('方案版本').selectOption('0');
  await expect(page.locator('.proposal-content')).toHaveText('V1: REST API');
  await close(page);
  await page.getByRole('button', { name: '新建 ADR', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('E2E ADR: REST');
  await page.getByLabel('关联方案').selectOption({ label: 'E2E API 方案' });
  await page.getByLabel('决策背景').fill('单机软件需要统一数据接口');
  await page.getByRole('button', { name: '添加备选方案' }).click();
  await page.getByLabel('备选方案 1 名称').fill('REST');
  await page.getByLabel('备选方案 1 说明').fill('简单且可测试');
  await page.getByLabel('修改原因').fill('保存候选方案');
  await save(page);
  await expect(page.getByRole('dialog')).toContainText('待决策');
  await page.getByRole('button', { name: '修订 ADR', exact: true }).click();
  await page.getByLabel('状态', { exact: true }).selectOption('accepted');
  await page.getByLabel('选定方案').fill('REST');
  await page.getByLabel('决策理由').fill('适合 P0 单机应用');
  await page.getByLabel('修改原因').fill('确认技术选型');
  await page.getByRole('button', { name: '保存 V2', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('已确认 ADR');
  await page.getByLabel('ADR 版本').selectOption('0');
  await expect(page.locator('.revision-reason')).toContainText('待决策');
  await close(page);
  const projects = await (await request.get('/api/projects')).json();
  const p = projects.find((x: { name: string }) => x.name === 'E2E Engineering');
  const overview = await (await request.get(`/api/projects/${p.id}/overview`)).json();
  expect(overview.task_counts.implemented).toBe(1);
  expect(overview.feature_counts.planned).toBe(1);
  expect(overview.verification.available).toBe(false);
  await nav(page, 'Graph');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await nav(page, 'Timeline');
  await page.getByLabel('事件类型', { exact: true }).selectOption('decision.accepted');
  await expect(page.locator('.timeline-list .event-row')).toHaveCount(1);
  await page.reload();
  await page.getByLabel('当前工程').selectOption(p.id);
  await nav(page, 'Decisions');
  await expect(page.locator('.decision-card')).toContainText('已确认 ADR');
  await page.locator('.proposal-title').filter({ hasText: 'E2E API 方案' }).click();
  await expect(page.getByLabel('方案版本').locator('option')).toHaveCount(2);
  await page.getByLabel('方案版本').selectOption('0');
  await expect(page.locator('.proposal-content')).toHaveText('V1: REST API');
  expect(errors).toEqual([]);
});

test('Validation errors are visible; duplicate feature cannot change shared data', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('.project-banner')).toBeVisible();
  await page.getByRole('button', { name: '新建功能', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('Duplicate demo');
  await page.getByLabel('功能编号').fill('F01');
  await save(page);
  await expect(page.getByRole('alert')).toContainText('Database constraint rejected');
  await close(page);
  await nav(page, 'Board');
  await expect(page.locator('.board-card')).toHaveCount(9);
  const projects = await (await request.get('/api/projects')).json();
  const demo = projects.find((p: { name: string }) => p.name === 'MiniLab');
  const features = await (await request.get(`/api/projects/${demo.id}/features`)).json();
  expect(features).toHaveLength(9);
  await nav(page, 'Graph');
  await page.getByRole('button', { name: '创建关联', exact: true }).click();
  await page.getByLabel('源对象').selectOption({ label: '[Demo] 设计资源采集接口' });
  await page.getByLabel('目标对象').selectOption({ label: '[Demo] 设计资源采集接口' });
  await page.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Self links are not allowed');
});

test('Responsive layout has no horizontal overflow and navigation remains operable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.project-banner h2')).toHaveText('MiniLab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, 'mobile-overview.png'), fullPage: true });
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await nav(page, 'Board');
  await expect(page.getByRole('heading', { name: '功能与任务看板' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
