import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { SEED } from '../src/documents/seed.js';
import { seedUpdate } from '../src/documents/seed-update.js';

describe('seedUpdate', () => {
  it('빈 문서에 얹으면 씨앗 그대로가 된다', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, seedUpdate(SEED));

    expect(doc.getText('source').toString()).toBe(SEED);
    doc.destroy();
  });

  it('두 번 얹어도 두 배가 되지 않는다', () => {
    // Yjs 업데이트는 멱등이다. 접기가 "스냅샷 먼저, 삭제 나중" 순서를 쓸 수
    // 있는 근거가 이것이라, 여기서 한 번 못 박아 둔다.
    const doc = new Y.Doc();
    const update = seedUpdate(SEED);
    Y.applyUpdate(doc, update);
    Y.applyUpdate(doc, update);

    expect(doc.getText('source').toString()).toBe(SEED);
    doc.destroy();
  });

  it('화면이 쓰는 이름표를 쓴다', () => {
    // `source` 가 아니면 클라이언트의 Y.Text 와 다른 루트가 되어, 붙어도
    // 서로의 글자를 못 본다. 조용히 어긋나는 종류라 검사로 묶는다.
    const doc = new Y.Doc();
    Y.applyUpdate(doc, seedUpdate(SEED));

    expect(doc.share.has('source')).toBe(true);
    doc.destroy();
  });
});
