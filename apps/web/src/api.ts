import type { CreateDocumentResponse, DocumentSummary } from '@keel/contract';

/** 서버에서만 쓴다. 브라우저에는 ws 주소만 나간다 */
const API = process.env['KEEL_API_URL'] ?? 'http://localhost:4000';

export async function createDocument(): Promise<string> {
  const res = await fetch(`${API}/d`, { method: 'POST', cache: 'no-store' });
  if (!res.ok) throw new Error(`문서를 만들지 못했다: ${res.status}`);
  const body = (await res.json()) as CreateDocumentResponse;
  return body.id;
}

/**
 * **`'missing'` 과 `'unavailable'` 을 갈라 돌려준다.**
 *
 * 이 구분이 브라우저에 남은 사본을 지울지를 가른다. `404` 는 문서가 정말
 * 없다는 뜻이라 지워도 되지만, 서버가 잠깐 아픈 것을 `404` 로 뭉개면 사람의
 * 오프라인 작업을 우리가 없앤다.
 */
export async function findDocument(
  id: string,
): Promise<DocumentSummary | 'missing' | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch(`${API}/d/${id}`, { cache: 'no-store' });
  } catch {
    return 'unavailable';
  }
  if (res.status === 404) return 'missing';
  if (!res.ok) return 'unavailable';
  return (await res.json()) as DocumentSummary;
}
