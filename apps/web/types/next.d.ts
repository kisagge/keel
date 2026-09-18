/**
 * Next 앰비언트 타입을 **흔들리지 않게** 붙들어 둔다.
 *
 * `next-env.d.ts` 는 도구가 다시 쓰는 파일이다. `next build` 뒤에는
 * `./.next/types/…` 를, `next dev` 뒤에는 `./.next/dev/types/…` 를 가리키게
 * 써서, e2e 를 한 번 돌릴 때마다 작업 트리가 더러워진다. 그래서 그 파일은
 * git 에서 무시하고, 실제로 필요한 두 줄만 여기 남긴다.
 *
 * 없으면 `app/layout.tsx` 의 `./globals.css` side-effect import 가
 * TS2882 로 깨진다 — 지우기 전에 그것부터 확인할 것.
 *
 * 빠지는 것은 `.next/**` 가 만들어 주는 타입 붙은 라우트뿐이고, 그것은
 * `next-env.d.ts` 가 로컬에 있으면 그대로 따라온다.
 */

/// <reference types="next" />
/// <reference types="next/image-types/global" />
