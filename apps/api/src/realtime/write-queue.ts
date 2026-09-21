/**
 * 키(문서 id)마다 작업을 **한 줄로 세운다.**
 *
 * `PersistenceService` 는 `doc.on('update')` 가 동기로 울릴 때마다 DB 쓰기
 * 하나를 여기 넣는다. 그냥 쏘아 두면 두 쓰기가 겹쳐 `seq` 가 들어온 순서와
 * 어긋날 수 있고, **재생 순서가 곧 문서**라 그 순간 문서가 달라진다. 이
 * 클래스는 같은 키의 작업을 이전 것이 끝난 뒤에만 시작해 그 순서를 지킨다.
 *
 * 키가 다르면 서로 절대 기다리지 않는다 — 문서마다 독립된 줄이다. 한 문서가
 * 느려도 다른 문서의 쓰기가 막히면 안 된다.
 */
export class WriteQueue {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly onError: (key: string, error: unknown) => void) {}

  /** `key` 줄의 맨 뒤에 작업을 매단다. 이전 것이 끝나야 시작한다 */
  enqueue(key: string, work: () => Promise<void>): void {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(work).catch((error: unknown) => {
      this.onError(key, error);
    });
    this.chains.set(key, next);
  }

  /** `key` 줄이 빌 때까지 기다린다(검사·flush 용) */
  async settled(key: string): Promise<void> {
    await (this.chains.get(key) ?? Promise.resolve());
  }
}
