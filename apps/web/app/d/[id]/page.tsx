import { notFound } from 'next/navigation.js';
import { Editor } from '../../../src/components/editor.js';
import { findDocument } from '../../../src/api.js';

/**
 * 문서가 있는지 **먼저** 확인한다.
 *
 * 안 하면 ws 가 404 로 끊기고 사용자는 빈 에디터를 본다 — "문서가 없다" 와
 * "문서가 비었다" 를 구분 못 하는 화면이다.
 */
export default async function DocumentPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await findDocument(id);

  if (found === 'missing') notFound();
  // 서버가 잠깐 아픈 것은 없는 문서와 다르다. 던져서 error.tsx 로 보낸다
  if (found === 'unavailable') throw new Error('서버에 연결할 수 없다');

  return <Editor documentId={id} />;
}
