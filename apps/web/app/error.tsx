'use client';

export default function Error({ reset }: { readonly reset: () => void }) {
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--keel-muted)' }}>서버에 연결할 수 없다.</p>
        <button type="button" onClick={reset} style={{ font: 'inherit', cursor: 'pointer' }}>
          다시 해 보기
        </button>
      </div>
    </main>
  );
}
