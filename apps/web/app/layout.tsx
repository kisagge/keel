import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'KEEL',
  description: '텍스트로 관리하는 실시간 협업 다이어그램',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
