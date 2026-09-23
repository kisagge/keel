/**
 * web 과 api 가 함께 보는 HTTP 계약.
 *
 * **문서 내용은 여기 없다.** 내용은 ws 로만 오간다 — 두 통로가 같은 것을
 * 내면 어느 쪽이 진짜인지 묻는 자리가 생긴다. HTTP 는 만들기와 존재 확인만
 * 한다.
 */

/** `POST /d` 의 응답 */
export interface CreateDocumentResponse {
  readonly id: string;
}

/** `GET /d/:id` 의 응답. 존재 확인이 목적이라 내용을 담지 않는다 */
export interface DocumentSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
