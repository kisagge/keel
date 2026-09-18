import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface SceneSummaryNode {
  id: string;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

interface SceneSummary {
  nodes: SceneSummaryNode[];
  edges: number;
  groups: string[];
}

declare global {
  interface Window {
    __keel?: { sceneSummary: () => SceneSummary };
  }
}

async function sceneSummary(page: Page): Promise<SceneSummary> {
  return page.evaluate(() => {
    const keel = window.__keel;
    if (keel === undefined) throw new Error('검사용 창구가 없다');
    return keel.sceneSummary();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__keel !== undefined);
});

test('씨앗 문서가 캔버스에 선다', async ({ page }) => {
  const scene = await sceneSummary(page);

  expect(scene.nodes.map((n) => n.id).sort()).toEqual(
    ['api', 'events', 'orders', 'pay', 'toss', 'user', 'web'].sort(),
  );
  expect(scene.groups).toContain('payment');
  expect(scene.edges).toBe(6);
});

test('글자를 치면 캔버스가 따라 바뀐다', async ({ page }) => {
  const before = await sceneSummary(page);

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nqueue newq "새 큐"');

  await expect
    .poll(async () => (await sceneSummary(page)).nodes.map((n) => n.id))
    .toContain('newq');

  expect((await sceneSummary(page)).nodes).toHaveLength(before.nodes.length + 1);
});

test('노드를 끌면 놓은 자리에 남는다', async ({ page }) => {
  const before = await sceneSummary(page);
  const node = before.nodes[0];
  if (node === undefined) throw new Error('노드가 없다');

  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('캔버스가 없다');

  // 창구가 화면 좌표를 주므로 노드 한가운데를 정확히 잡을 수 있다
  const from = { x: box.x + node.screenX, y: box.y + node.screenY };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 80, { steps: 12 });
  await page.mouse.up();

  const after = await sceneSummary(page);
  const moved = after.nodes.find((n) => n.id === node.id);
  if (moved === undefined) throw new Error('노드가 사라졌다');

  // 끈 쪽으로 옮겨졌다
  expect(moved.x).toBeGreaterThan(node.x);
  expect(moved.y).toBeGreaterThan(node.y);

  // 다른 노드는 그대로다 — 끌기가 잡은 것 하나만 건드린다
  const others = after.nodes.filter((n) => n.id !== node.id);
  for (const other of others) {
    const same = before.nodes.find((n) => n.id === other.id);
    expect({ x: other.x, y: other.y }).toEqual({ x: same?.x, y: same?.y });
  }
});

/**
 * **끌고 나서 곧바로 `Cmd+Z` 가 들어야 한다.**
 *
 * 문서와 자리를 `UndoManager` 하나로 묶은 값이 전부 이 한 번의 글쇠에 있다.
 * 그런데 그 역사를 부르는 글쇠는 CodeMirror 안에만 있었고, 끌고 나면 초점이
 * `<body>` 에 있어서 아무 일도 안 일어났다 — 텍스트 창을 먼저 눌러야만
 * 돌아갔다. 브라우저를 직접 몰아 보기 전에는 안 보이는 부류다. 타입·린트·
 * 단위 검사·빌드가 전부 통과하고 있었다.
 */
test('캔버스에서 끌고 바로 Cmd+Z 를 누르면 돌아온다', async ({ page }) => {
  const before = await sceneSummary(page);
  const node = before.nodes[0];
  if (node === undefined) throw new Error('노드가 없다');

  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('캔버스가 없다');

  const from = { x: box.x + node.screenX, y: box.y + node.screenY };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 140, from.y + 90, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => (await sceneSummary(page)).nodes.find((n) => n.id === node.id)?.x)
    .toBeGreaterThan(node.x);

  // 텍스트 창을 누르지 **않고** 그대로 되돌린다
  await page.keyboard.press('ControlOrMeta+z');

  await expect
    .poll(async () => {
      const moved = (await sceneSummary(page)).nodes.find((n) => n.id === node.id);
      return { x: moved?.x, y: moved?.y };
    })
    .toEqual({ x: node.x, y: node.y });
});
