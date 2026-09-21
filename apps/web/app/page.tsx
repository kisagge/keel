import { redirect } from 'next/navigation';
import { createDocument } from '../src/api.js';

/**
 * 들어오면 새 문서가 선다.
 *
 * 정적 프리렌더에서 빠지는 대신, "문서를 만드는 자리" 가 서버 한 곳에 모인다.
 * 클라이언트가 만들면 새로고침마다 문서가 하나씩 생긴다.
 */
export const dynamic = 'force-dynamic';

export default async function Home(): Promise<never> {
  const id = await createDocument();
  redirect(`/d/${id}`);
}
