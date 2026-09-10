'use client';

import { useEffect, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

type Passkey = { id: string; deviceName: string; createdAt: string };
type PrivateItem = { id: string; title: string; content: string };
type Me = {
  displayName: string;
  csrfToken: string;
  passkeys: Passkey[];
  privateItems: PrivateItem[];
};

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'NotAllowedError') {
    return '취소되었거나 시간이 초과되었습니다.';
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function MySpacePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMe() {
    setLoading(true);
    try {
      const res = await fetch('/api/me');
      setMe(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function handleRegister() {
    setError(null);
    setMessage(null);
    if (!me && displayName.trim().length === 0) {
      setError('이름을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const optionsRes = await fetch('/api/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const optionsBody = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsBody.error ?? '등록 준비에 실패했습니다.');

      const attResp = await startRegistration({ optionsJSON: optionsBody.options });

      const deviceName =
        window.prompt('이 패스키를 구분할 이름을 입력하세요 (예: 내 노트북)', '내 패스키') ||
        '내 패스키';

      const verifyRes = await fetch('/api/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResp, deviceName }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyBody.error ?? '패스키 등록에 실패했습니다.');

      setMessage('패스키가 등록되었습니다.');
      await loadMe();
    } catch (err) {
      setError(errorMessage(err, '알 수 없는 오류가 발생했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const optionsRes = await fetch('/api/login/options', { method: 'POST' });
      const optionsBody = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsBody.error ?? '로그인 준비에 실패했습니다.');

      const authResp = await startAuthentication({ optionsJSON: optionsBody.options });

      const verifyRes = await fetch('/api/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResp }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyBody.error ?? '로그인에 실패했습니다.');

      setMessage('로그인되었습니다.');
      await loadMe();
    } catch (err) {
      setError(errorMessage(err, '알 수 없는 오류가 발생했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!me) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': me.csrfToken },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? '로그아웃에 실패했습니다.');
      }
      setMe(null);
      setMessage('로그아웃되었습니다.');
    } catch (err) {
      setError(errorMessage(err, '알 수 없는 오류가 발생했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    if (!me) return;
    if (!window.confirm('이 패스키를 삭제할까요?')) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
        body: JSON.stringify({ credentialId: id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '삭제에 실패했습니다.');
      setMessage('패스키가 삭제되었습니다.');
      await loadMe();
    } catch (err) {
      setError(errorMessage(err, '알 수 없는 오류가 발생했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <p>불러오는 중...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <p>
        <a href="/">← 첫 화면으로</a>
      </p>
      <h1>나만의 공간</h1>

      {error && <p className="alert alert-error">{error}</p>}
      {message && <p className="alert alert-ok">{message}</p>}

      {!me ? (
        <section className="card">
          <h2>패스키로 시작하기</h2>
          <p className="hint">
            비밀번호는 필요 없습니다. 합성(가짜) 이름을 적고 패스키를 만들어보세요.
          </p>
          <input
            type="text"
            placeholder="표시할 이름 (예: 홍길동)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            disabled={busy}
          />
          <div className="button-row">
            <button onClick={handleRegister} disabled={busy}>
              패스키 만들기
            </button>
            <button onClick={handleLogin} disabled={busy} className="secondary">
              기존 패스키로 로그인
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>{me.displayName}님, 안녕하세요</h2>
            <button onClick={handleLogout} disabled={busy} className="secondary">
              로그아웃
            </button>
          </section>

          <section className="card">
            <h2>등록된 패스키 ({me.passkeys.length}개)</h2>
            <ul className="list">
              {me.passkeys.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.deviceName}</strong>
                    <div className="hint">
                      등록일: {new Date(p.createdAt).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePasskey(p.id)}
                    disabled={busy || me.passkeys.length <= 1}
                    className="danger"
                    title={
                      me.passkeys.length <= 1 ? '마지막 패스키는 삭제할 수 없습니다' : '삭제'
                    }
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={handleRegister} disabled={busy}>
              다른 기기에서 쓸 패스키 추가
            </button>
          </section>

          <section className="card">
            <h2>비공개 자료 (합성 데이터)</h2>
            <ul className="list">
              {me.privateItems.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <div className="hint">{item.content}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
