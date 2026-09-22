import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as Y from 'yjs';

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

/**
 * `documentId` 로 이름 붙은 `y-indexeddb` 의 `updates` 스토어에 쌓인 레코드
 * 수를 직접 센다.
 *
 * **화면 문구를 믿지 않는다.** `missing-document` testid 가 보인다고 해서
 * 로컬 사본이 실제로 지워졌다는 뜻은 아니다 — 그 화면은 `clearData()` 를
 * 부르든 안 부르든 똑같이 뜬다(에디터를 아예 안 그리므로). 이 함수가 그
 * 간극을 메운다: 브라우저가 실제로 들고 있는 IndexedDB 를 직접 연다.
 *
 * 디비가 아예 없거나(지워졌다) 스토어가 없으면 0 을 돌려준다. **스토어를
 * 새로 만들지 않는다** — `onupgradeneeded` 콜백을 비워 두면, 디비가 없어서
 * 새로 만들어지는 경우에도 빈 v1 디비 하나가 남을 뿐 `y-indexeddb` 가
 * 기대하는 모양을 흉내 내지 않는다. 그래서 이 함수를 부른 뒤에 진짜
 * `IndexeddbPersistence` 가 같은 이름을 다시 열어도 안 꼬인다.
 */
async function localUpdateCount(page: Page, documentId: string): Promise<number> {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onupgradeneeded = () => {
          // 버전 0 → 1: 디비가 없었다는 뜻. 스토어를 안 만들면 아래
          // onsuccess 에서 'updates' 가 없다고 보고 곧바로 0 을 준다
        };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('updates')) {
            db.close();
            resolve(0);
            return;
          }
          const tx = db.transaction('updates', 'readonly');
          const countReq = tx.objectStore('updates').count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
          countReq.onerror = () => {
            db.close();
            reject(countReq.error as Error);
          };
        };
        req.onerror = () => reject(req.error as Error);
      }),
    documentId,
  );
}

/**
 * 앱을 거치지 않고 `documentId` 이름의 로컬 디비에 진짜 Yjs 업데이트 하나를
 * 미리 심는다 — "이 브라우저에 이미 오프라인 사본이 있다" 는 전제를, 그
 * 문서를 서버에 한 번도 만들지 않고도 세울 수 있다. `y-indexeddb` 가 여는
 * 것과 같은 모양(스토어 이름 `updates`/`custom`)으로 만들어야 나중에 진짜
 * `IndexeddbPersistence` 가 열었을 때 그대로 읽힌다.
 */
async function seedLocalUpdate(page: Page, documentId: string, update: readonly number[]): Promise<void> {
  await page.evaluate(
    ({ name, bytes }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('updates', { autoIncrement: true });
          db.createObjectStore('custom');
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('updates', 'readwrite');
          tx.objectStore('updates').add(new Uint8Array(bytes));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error as Error);
          };
        };
        req.onerror = () => reject(req.error as Error);
      }),
    { name: documentId, bytes: Array.from(update) },
  );
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

/**
 * 편집기 안에서 누른 `Delete` 는 노드를 지우지 않는다.
 *
 * 캔버스 쪽 글쇠 처리가 "편집기 안인가" 를 판별하는 방법을 바꿀 때 이 검사가
 * 지킨다 — 잘못 바꾸면 글자를 지우려던 Delete 가 고른 노드를 함께 지운다.
 */
test('편집기 안에서 Delete 를 눌러도 고른 노드가 남는다', async ({ page }) => {
  const before = await sceneSummary(page);
  const node = before.nodes.find((n) => n.id === 'orders');
  if (node === undefined) throw new Error('씨앗에 orders 가 없다');

  // 캔버스에서 노드를 고른다
  await page.locator('canvas').click({ position: { x: node.screenX, y: node.screenY } });

  // 그 다음 편집기 안에 초점을 두고 Delete 를 누른다
  await page.locator('.cm-content').click();
  await page.keyboard.press('Delete');

  const after = await sceneSummary(page);
  expect(after.nodes.map((n) => n.id)).toContain('orders');
});

test('붙어 있으면 연결 상태가 그렇게 말한다', async ({ page }) => {
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');
});

/**
 * **기본 5 초 제한(`expect` 타임아웃)으로는 안 잡힌다** — 직접 재 봤다.
 *
 * `context.setOffline(true)` 는 이미 뚫려 있는 웹소켓을 그 자리에서 끊지
 * 않는다. 프레임을 조용히 블랙홀로 보낼 뿐이라 브라우저의 `onclose`/`onerror`
 * 가 곧바로 안 뜬다. 대신 `y-websocket` 의 `WebsocketProvider` 가 "30 초
 * 동안 메시지가 안 왔다" 는 자체 워치독으로 소켓을 강제로 닫고 나서야
 * `status` 가 `disconnected` 로 바뀐다(그 상수는 라이브러리에 박혀 있어
 * `connectProviders` 에서 손댈 자리가 없다). Playwright 의 `websocket`
 * 이벤트로 프레임을 직접 찍어 확인했다 — `setOffline` 직후로는
 * `framereceived` 가 뚝 끊기고, 그로부터 30~33 초 뒤에야 실제 `close` 와
 * `ERR_INTERNET_DISCONNECTED` 재접속 시도가 찍힌다.
 *
 * 그래서 이 검사만 시간을 넉넉히 준다 — 잠으로 통과시키는 게 아니라
 * 실측한 지연을 그대로 기다리는 것이다.
 */
test('끊기면 이 브라우저에만 있다고 말한다', async ({ page, context }) => {
  test.setTimeout(60_000);

  await context.setOffline(true);

  await expect(page.getByTestId('connection-status')).toHaveAttribute(
    'data-state',
    'disconnected',
    { timeout: 45_000 },
  );
  await expect(page.getByTestId('connection-status')).toContainText('이 브라우저에만');

  await context.setOffline(false);
});

/**
 * **화면만 보고는 못 믿는다.** `missing-document` testid 와
 * `.cm-content` 개수 0 은, `clearData()` 를 실제로 부르든 안 부르든
 * 똑같이 나온다 — `<MissingDocument>` 는애초에 에디터를 안 그리기
 * 때문이다(`task-12-report.md` 의 teeth-check 참고). 그래서 IndexedDB 를
 * 직접 열어 레코드 수를 센다 — 화면이 아니라 브라우저가 실제로 들고 있는
 * 것을 본다.
 *
 * 이 검사와 바로 다음 검사(`서버가 404 가 아니게 답해도...`)는 한 쌍이다.
 * 하나는 "지운다", 하나는 "안 지운다" 를 같은 방식(IndexedDB 를 직접 세는
 * 것)으로 확인한다.
 */
test('지워진 문서를 다시 열면 없다고 말하고, 로컬 사본도 지운다', async ({ page, request }) => {
  const url = page.url();
  const id = url.split('/d/')[1]!;

  // 로컬에 사본이 실제로 쌓였는지 먼저 확인한다 — 안 그러면 이 검사는
  // "원래 비어 있던 것" 과 "지워서 비어진 것" 을 구분 못 한다
  await expect.poll(() => localUpdateCount(page, id)).toBeGreaterThan(0);

  // 서버에서 지운다
  await request.delete(`http://localhost:4000/d/${id}`);

  await page.goto(url);
  await expect(page.getByTestId('missing-document')).toBeVisible();
  // 로컬 사본이 살아 있으면 씨앗이 보인다. 안 보여야 한다
  await expect(page.locator('.cm-content')).toHaveCount(0);

  // 진짜 지웠는지 — IndexedDB 를 직접 들여다본다
  await expect.poll(() => localUpdateCount(page, id)).toBe(0);
});

/**
 * Finding 1 의 짝 — 파괴적인 방향이다. `404` 가 아닌 실패에서 로컬 사본을
 * 지우면, 서버가 잠깐 아픈 사이에 사람의 오프라인 작업을 우리가 없앤다.
 *
 * `404` 가 아닌 실패를 인프라를 건드리지 않고 결정적으로 재현하려고, id
 * 끝에 글자 그대로 `%00` 세 글자를 심는다(퍼센트 인코딩된 NUL — 실제
 * NUL 바이트가 아니다. 실제 바이트를 심으면 Next 가 라우트 파라미터로
 * 넘기며 그 값을 RSC 로 클라이언트에 실어 보내는 과정에서 값이 달라져,
 * 나중에 클라이언트가 여는 IndexedDB 이름이 여기서 심은 이름과 안
 * 맞았다 — 직접 재서 확인했다). Next 의 라우터는 이 시퀀스를 안전하지
 * 않다고 보고 **안 풀고 그대로 넘긴다** — `params.id` 도, 그것을 그대로
 * 받는 `documentId`(로컬 IndexedDB 이름)도 문자 그대로 `...%00x` 다.
 * 그런데 `api.ts` 의 `fetch(`${API}/d/${id}`)` 는 이미 유효한 퍼센트
 * 인코딩을 다시 인코딩하지 않고 그대로 내보내므로, API 서버에는 결국
 * `%00` 이 도착하고 **거기서** Express 가 그것을 풀어 진짜 NUL 바이트로
 * 만든다. Postgres 의 text 컬럼은 NUL 바이트를 원천적으로 못 받아들여서
 * (문자 인코딩 자체의 제약이라 로컬 docker 든 CI 의 서비스 컨테이너든
 * 어디서나 같다) `documents.service.find` 의 Prisma 호출이 던지고, Nest 의
 * 기본 예외 처리가 그것을 `500` 으로 낸다 — 실제로 있어 본 적 없는
 * 문서인데도 `404` 가 아닌 진짜 실패를 얻는다. `curl` 로 API 자체와, 웹이
 * 그 API 를 부르는 페이지 둘 다 찔러 확인했다: `GET .../d/ghost%00test`
 * 는 500 을 내고, 그 위의 페이지는 `missing-document`/`unreachable-server`
 * 어느 쪽도 안 뜬 채 에디터를 그대로 그린다.
 *
 * **`encodeURIComponent` 를 안 쓴다.** id 안의 `%00` 은 이미 유효한
 * 퍼센트 인코딩이다 — 한 번 더 인코딩하면 `%2500` 이 되어 이 트릭이
 * 깨진다.
 *
 * 이 문서는 서버에 한 번도 존재한 적이 없다 — `seedLocalUpdate` 가 앱을
 * 거치지 않고 로컬에만 사본을 심는다. 그래서 서버 쪽 실패를 자유롭게
 * 흉내 낼 수 있다(진짜 문서를 만들고 나중에 서버만 고장 내는 길은 이
 * 리포의 공유 인프라를 건드리게 돼 CI 와 어긋난다).
 */
test('서버가 404 가 아니게 답해도 로컬 사본은 그대로 있다', async ({ page }) => {
  const id = `ghost-mirror-${Date.now()}%00x`;

  const doc = new Y.Doc();
  doc.getText('source').insert(0, '유령이 지켜야 할 글');
  const update = Array.from(Y.encodeStateAsUpdate(doc));
  doc.destroy();

  // 이 출처(origin)에 있어야 이 이름의 IndexedDB 를 미리 심을 수 있다.
  // 이 id 는 서버에 존재한 적이 없으므로 첫 방문은 늘 '404 아닌 실패' 다
  await page.goto(`/d/${id}`);
  await seedLocalUpdate(page, id, update);

  // 다시 연다 — 서버는 이번에도 404 가 아닌 실패로 답한다(같은 이유,
  // 매번 결정적이다). 로컬은 이제 비어 있지 않으므로 곧바로 뜬다
  await page.goto(`/d/${id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByTestId('missing-document')).toHaveCount(0);
  await expect(page.getByTestId('unreachable-server')).toHaveCount(0);

  // 지워지지 않았다 — 심어 둔 레코드가 그대로 있다
  await expect.poll(() => localUpdateCount(page, id)).toBeGreaterThan(0);
});
