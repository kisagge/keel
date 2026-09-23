/**
 * 첫 화면의 씨앗.
 *
 * `packages/dsl/fixtures/order-flow.keel` 과 같은 내용이다.
 *
 * **서버가 소유한다.** 클라이언트가 각자 심으면 빈 문서에 둘이 동시에 들어올
 * 때 양쪽 씨앗이 다 살아남아 문서가 두 배가 된다 — `cb55a9b` 와
 * `apps/web/test/concurrent.test.ts` 가 이미 증명해 둔 현상이다.
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
