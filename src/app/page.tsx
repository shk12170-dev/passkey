import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <h1>패스키 포트폴리오</h1>
      <p>
        이 사이트는 비밀번호 없이 <strong>패스키(Passkey)</strong>로만 로그인하는 개인 공간
        데모입니다. 개인키는 여러분의 기기 밖으로 나가지 않고, 서버에는 공개키만 저장됩니다.
      </p>
      <p className="hint">
        아래 버튼을 눌러 합성(가짜) 이름으로 패스키를 만들어보고, 로그인 전에는 비공개 자료가
        보이지 않는다는 것을 확인해보세요.
      </p>
      <Link href="/my-space" className="button-link">
        나만의 공간으로 이동
      </Link>
    </main>
  );
}
