export default function NotFound() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}>
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        그런 문서가 없다.
        <br />
        주소를 다시 확인한다.
      </p>
    </main>
  );
}
