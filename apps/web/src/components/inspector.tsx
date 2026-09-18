'use client';

import { NODE_KINDS } from '@keel/dsl';
import type { NodeKind } from '@keel/dsl';
import type { CSSProperties, ReactNode } from 'react';
import { removeNode, renameNode, setNodeKind } from '../document/commands.js';
import type { KeelDocument } from '../document/keel-document.js';

/**
 * 고른 것을 고치는 자리.
 *
 * **노드만 고친다.** 선과 그룹은 고를 수는 있되 읽기 전용이고, 대신 그 줄로
 * 데려다준다. 막다른 골목을 만들지 않으면서 이번 판의 범위를 안 넘는 쪽이고,
 * "텍스트가 문서다" 를 화면이 한 번 더 말하게 된다.
 *
 * 고른 것을 장면에서 들고 오지 않고 **문서에서 뽑아 온 값**을 받는다. 장면의
 * `PlacedNode` 는 이름을 고치는 순간 낡은 값이 된다.
 */
/**
 * **갈라진 타입이다.** 하나로 두고 `nodeKind` 를 `NodeKind | undefined` 로
 * 적으면, 노드일 때는 반드시 있는 값인데도 컴파일러가 그것을 모른다. 그러면
 * `target.nodeKind ?? 'service'` 같은 **닿지 않는 기본값**을 쓰게 되고, 그것은
 * 다음 사람에게 "종류가 없는 노드가 있다" 는 거짓말을 한다.
 */
export type InspectorTarget =
  | {
      readonly kind: 'node';
      readonly id: string;
      readonly nodeKind: NodeKind;
      /** 사람이 적은 이름. 없으면 undefined — 입력칸이 비고 id 가 흐리게 뜬다 */
      readonly rawLabel: string | undefined;
      /** 텍스트에서 이 선언이 시작하는 자리 */
      readonly position: number;
    }
  | {
      readonly kind: 'edge' | 'group';
      readonly id: string;
      /** 읽기 전용으로 보여 줄 한 줄 */
      readonly caption: string;
      readonly position: number;
    };

export function Inspector({
  target,
  document,
  onGoTo,
  onCleared,
}: {
  readonly target: InspectorTarget | undefined;
  readonly document: KeelDocument;
  readonly onGoTo: (position: number) => void;
  readonly onCleared: () => void;
}) {
  if (target === undefined) return null;

  if (target.kind !== 'node') {
    return (
      <aside style={card}>
        <p style={caption}>
          {target.caption}
          <br />
          여기서는 못 고친다. 텍스트에서 고친다.
        </p>
        <button type="button" onClick={() => onGoTo(target.position)} style={field}>
          텍스트에서 이 줄로 가기
        </button>
      </aside>
    );
  }

  return (
    <aside style={card}>
      <Row label="이름">
        <input
          value={target.rawLabel ?? ''}
          placeholder={target.id}
          onChange={(e) =>
            renameNode(
              document,
              target.id,
              e.target.value.length === 0 ? undefined : e.target.value,
            )
          }
          style={field}
        />
      </Row>

      <Row label="종류">
        <select
          value={target.nodeKind}
          onChange={(e) => setNodeKind(document, target.id, e.target.value as NodeKind)}
          style={field}
        >
          {NODE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </Row>

      <button
        type="button"
        onClick={() => {
          removeNode(document, target.id);
          onCleared();
        }}
        style={danger}
      >
        지우기
      </button>
    </aside>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
      <span style={{ display: 'block', marginBottom: 4, color: 'var(--keel-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

const card: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 220,
  padding: 12,
  background: 'var(--keel-surface)',
  border: '1px solid var(--keel-border)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgb(0 0 0 / 8%)',
};

const field: CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  border: '1px solid var(--keel-border)',
  borderRadius: 4,
  font: 'inherit',
  background: 'var(--keel-surface)',
};

const danger: CSSProperties = { ...field, color: '#b91c1c', cursor: 'pointer' };

const caption: CSSProperties = { margin: '0 0 8px', fontSize: 12, color: 'var(--keel-muted)' };
