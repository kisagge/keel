import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDocument } from '../src/api.js';

/**
 * `findDocument` 의 갈래를 검사로 묶는다.
 *
 * `404` 와 그 밖의 실패를 가르는 것이 이 함수의 유일한 존재 이유다 —
 * `missing-document.tsx` 가 이 값을 보고 브라우저의 사본을 지울지 정한다.
 * `404` 는 지워도 되지만(문서가 정말 없다), 그 밖의 실패(`503` 이나 네트워크
 * 끊김)를 `missing` 으로 뭉개면 서버가 잠깐 아픈 사이에 사람의 오프라인
 * 작업을 우리가 없앤다. 이 구분이 새게 만드는 변경을 이 검사가 잡는다.
 */
describe('findDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('404 는 missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    expect(await findDocument('doc-1')).toBe('missing');
  });

  it('503 은 unavailable — missing 으로 뭉개면 안 된다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    expect(await findDocument('doc-1')).toBe('unavailable');
  });

  it('fetch 가 던지면(네트워크 끊김) unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    expect(await findDocument('doc-1')).toBe('unavailable');
  });

  it('200 은 파싱한 요약을 돌려준다', async () => {
    const summary = { id: 'doc-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(summary),
      }),
    );

    expect(await findDocument('doc-1')).toEqual(summary);
  });
});
