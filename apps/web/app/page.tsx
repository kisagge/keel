'use client';

import { useEffect, useMemo } from 'react';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { SEED } from '../src/document/seed.js';

export default function EditorPage() {
  const document = useMemo(() => createKeelDocument(SEED), []);
  useEffect(() => () => document.destroy(), [document]);

  return (
    <main style={{ height: '100%' }}>
      <CanvasPane document={document} />
    </main>
  );
}
