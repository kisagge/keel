/**
 * 첫 화면의 씨앗.
 *
 * `packages/dsl/fixtures/order-flow.keel` 과 같은 내용이다. 저장이 없는 판이라
 * 새로고침하면 이리로 돌아온다 — 저장은 `apps/api` 의 일이라는 것을 화면이
 * 솔직하게 드러낸다.
 */
export const SEED = `# 주문이 들어와서 결제까지

actor user "손님"
service web "스토어프론트"
service api "주문 API"
db orders "주문 DB"
queue events "이벤트 큐"

group payment "결제" {
  service pay "결제 서비스"
  external toss "토스페이먼츠"
}

user -> web "주문하기"
web -> api
api -> orders "주문 저장"
api -> pay "결제 요청"
pay -> toss
api -> events "order.created"
`;
