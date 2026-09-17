'use client';

import { DEFAULT_THEME } from '@keel/renderer';

export default function EditorPage() {
  return (
    <main style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <p style={{ color: DEFAULT_THEME.colors.mutedText }}>
        KEEL — 노드 높이 {DEFAULT_THEME.node.height}
      </p>
    </main>
  );
}
