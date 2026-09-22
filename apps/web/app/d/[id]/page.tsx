import { Editor } from '../../../src/components/editor.js';
import { MissingDocument } from '../../../src/components/missing-document.js';
import { findDocument } from '../../../src/api.js';

/**
 * 문서가 있는지 **먼저** 확인한다. 안 하면 ws 가 404 로 끊기고 사용자는 빈
 * 에디터를 본다 — "문서가 없다" 와 "문서가 비었다" 를 구분 못 하는 화면이다.
 *
 * **서버에 못 붙는 것과 문서가 없는 것을 가른다.** 못 붙었다고 화면을 막으면
 * 로컬에 사본을 들고 있는 사람이 **오프라인에서 아무것도 못 한다** — 로컬
 * 저장을 넣은 이유가 그 자리에서 통째로 사라진다. 그때는 에디터를 띄우고
 * 클라이언트가 로컬을 보고 판단하게 한다.
 *
 * `key={id}` 로 문서마다 새로 마운트시킨다. 지금(Cache Components 미적용)은
 * Next 의 App Router 가 페이지 단위로 늘 새로 마운트하므로, key 가 없어도
 * 실제로 새어 나가는 경로는 검사로 확인되지 않았다(`task-10-report.md` 의
 * Finding 1 참고). 다만 그건 이 리포의 지금 설정에 대한 서술일 뿐 App
 * Router 의 계약은 아니다 — 언젠가 `cacheComponents` 를 켜면 Next 는
 * Activity 로 페이지를 감춰만 두고 그대로 재사용한다(공식 문서가 바로 이
 * 상황에 id 로 key 를 주라고 권한다). `keelDocument` 는 `useMemo(..., [])`
 * 라 그 재사용을 그대로 받는다 — 옛 문서의 `Y.Doc` 이 새 제공자에 물린다.
 * 지금 넣어 두면 그 날 아무 일도 안 해도 된다
 */
export default async function DocumentPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await findDocument(id);

  if (found === 'missing') return <MissingDocument documentId={id} />;
  return <Editor documentId={id} serverReachable={found !== 'unavailable'} key={id} />;
}
