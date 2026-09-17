/**
 * 글자 폭 재기.
 *
 * 노드 상자의 너비는 라벨에서 나오므로, 기하 전체가 "글자가 몇 px 인가" 에
 * 매달려 있다. 그런데 진짜로 재려면 캔버스가 있어야 하고, 캔버스가 있으면
 * Node 에서 검사할 수 없다.
 *
 * 그래서 재는 일을 **계약으로 빼 둔다.** 브라우저는 진짜 캔버스를 넣고,
 * 검사와 서버는 어림잡는 기본 구현을 쓴다. 어림값은 정확하지 않지만
 * **결정적이고 단조롭다** — 기하 검사에 필요한 것은 그 둘뿐이다.
 *
 * 어림과 실측이 10% 어긋나도 배치가 깨지지 않는 이유: 상자 너비는 최소·최대로
 * 물려 있고 라벨은 상자에 맞춰 잘리므로, 오차는 여백의 두께로만 나타난다.
 */

export interface TextStyle {
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontWeight: 'normal' | 'bold';
}

/** 글자의 폭(px). 캔버스가 있으면 진짜로 재고, 없으면 어림으로 잰다 */
export type MeasureText = (text: string, style: TextStyle) => number;

/** `ctx.font` 에 넣을 꼴. 재는 쪽과 그리는 쪽이 반드시 같은 것을 써야 한다 */
export function fontString(style: TextStyle): string {
  return `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

/**
 * 글자 하나가 차지하는 폭, `fontSize` 에 대한 비율.
 *
 * 한글·한자·가나·전각·이모지는 1.0 (모아쓰기라 라틴 소문자의 두 배 가까이 된다).
 * 라틴은 글자마다 크게 다르므로 몇 묶음으로 나눈다 — `iIl` 과 `MW` 를 같게 보면
 * "willing" 과 "MMMMMMM" 이 같은 폭으로 나와 상자가 눈에 띄게 어긋난다.
 */
function advanceOf(codePoint: number): number {
  // 한글 음절·자모, CJK, 가나, 전각, 이모지
  if (
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x9fff) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    codePoint >= 0x1f000
  ) {
    return 1;
  }

  const ch = String.fromCodePoint(codePoint);
  if (ch === ' ') return 0.3;
  if ('iIl.,:;\'|!`()[]{}'.includes(ch)) return 0.3;
  if ('fjrt-'.includes(ch)) return 0.4;
  if ('MWmw@%'.includes(ch)) return 0.9;
  if (codePoint >= 0x41 && codePoint <= 0x5a) return 0.72;
  return 0.55;
}

/**
 * 어림으로 재기.
 *
 * **코드 포인트 단위로 돈다** — 이모지 한 글자는 UTF-16 으로 두 칸이지만
 * 폭은 하나다. `text.length` 로 돌면 이모지가 든 라벨의 상자가 두 배로 부푼다.
 */
export const approximateMeasureText: MeasureText = (text, style) => {
  let units = 0;
  for (const ch of text) units += advanceOf(ch.codePointAt(0) ?? 0);
  const bold = style.fontWeight === 'bold' ? 1.05 : 1;
  return units * style.fontSize * bold;
};

/**
 * 잰 것을 기억해 둔다.
 *
 * 프레임마다 다시 재는 것은 캔버스에서 가장 흔한 느려짐이다. 브라우저 쪽은
 * **반드시** 이것으로 감싼다. 무한히 쌓이지 않도록 한도를 넘으면 통째로 버린다 —
 * 라벨은 문서를 고칠 때만 바뀌므로 다시 채우는 값이 싸다.
 */
export function memoizeMeasure(inner: MeasureText, limit = 4096): MeasureText {
  let cache = new Map<string, number>();

  return (text, style) => {
    const key = `${style.fontWeight}|${style.fontSize}|${style.fontFamily}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    const width = inner(text, style);
    if (cache.size >= limit) cache = new Map();
    cache.set(key, width);
    return width;
  };
}

/**
 * 상자에 안 들어가는 라벨을 줄임표로 자른다.
 *
 * 크기를 정할 때와 그릴 때가 **같은 함수**를 쓴다. 따로 두면 그린 글자가
 * 자기 상자보다 넓어지는 일이 생긴다.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  style: TextStyle,
  measure: MeasureText,
): string {
  if (measure(text, style) <= maxWidth) return text;

  const chars = [...text];
  const ellipsis = '…';

  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, mid).join('') + ellipsis, style) <= maxWidth) low = mid;
    else high = mid - 1;
  }

  // 줄임표조차 안 들어가는 상자. 빈 글자를 돌려주면 노드가 이름을 잃는다
  if (low === 0) return chars[0] ?? '';
  return chars.slice(0, low).join('') + ellipsis;
}
