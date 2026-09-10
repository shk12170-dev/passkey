import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'T08 패스키 포트폴리오',
  description: '비밀번호 없이 패스키(WebAuthn)로만 로그인하는 개인 공간 데모',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
