'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { Providers } from '../document/providers.js';

/**
 * 안 보인다는 것을 말한다.
 *
 * 로컬 저장은 "안 잃는다" 를 참으로 만들 뿐 **"공유됐다" 를 참으로 만들지
 * 않는다.** 그 차이를 사람이 알아야 한다.
 *
 * 로컬 저장을 못 쓰는 경우에는 문구가 더 강해진다 — 그때는 정말로 잃는다.
 *
 * **`useEffect` + `useState` 로 안 쓴 이유가 있다.** `useDocumentReady` 가
 * 이 컴포넌트에 `providers` 를 넘기기 전에 이미 원격과의 첫 `sync` 를
 * 기다린다 — 즉 이 컴포넌트가 처음 마운트되는 시점에는 소켓이 **이미**
 * `connected` 인 경우가 실제로 있다. 그런데 `WebsocketProvider` 의
 * `'status'` 이벤트는 상태가 바뀔 때만 한 번 나가는 알림이라, 마운트가
 * 끝난 뒤에 구독을 걸면 그 "이미 붙었다" 는 사실을 알려 줄 이벤트가 없다.
 * `useState(false)` 로 시작해 이벤트만 기다리면 화면은 계속 "끊김" 을
 * 말하는데 소켓은 실제로 붙어 있는, 더 나쁜 쪽(거짓 경보)으로 어긋난다.
 *
 * `useSyncExternalStore` 는 매 렌더마다 `wsconnected` 를 **직접 읽으므로**
 * 이 경합이 없다 — 이벤트를 놓쳐도 다음 렌더가 실제 값을 다시 확인한다.
 * `split-ratio.ts` 가 같은 이유로 이 훅을 쓴다.
 */
export function ConnectionStatus({ providers }: { readonly providers: Providers | undefined }) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (providers === undefined) return () => {};
      providers.remote.on('status', onChange);
      return () => providers.remote.off('status', onChange);
    },
    [providers],
  );
  const getSnapshot = useCallback(() => providers?.remote.wsconnected ?? false, [providers]);
  const getServerSnapshot = useCallback(() => false, []);

  const connected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (providers === undefined) return null;

  const hasLocal = providers.local !== undefined;
  const message = connected
    ? '저장됨'
    : hasLocal
      ? '연결 끊김 — 지금 고치는 것은 이 브라우저에만 있다'
      : '연결 끊김 — 지금 고치는 것은 저장되지 않는다';

  return (
    <p
      data-testid="connection-status"
      data-state={connected ? 'connected' : 'disconnected'}
      style={{ ...bar, color: connected ? 'var(--keel-muted)' : '#b45309' }}
    >
      {message}
    </p>
  );
}

const bar: CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  margin: 0,
  padding: '4px 8px',
  borderRadius: 6,
  background: 'var(--keel-surface)',
  border: '1px solid var(--keel-border)',
  fontSize: 12,
};
