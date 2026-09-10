// 가상 WebAuthn 인증장치로 패스키 등록/로그인 전체 흐름을 사람 개입 없이 검증하는 스크립트.
// 실행 전에 `npm run dev` 로 개발 서버가 http://localhost:3000 에 떠 있어야 한다.
// BASE_URL 환경변수로 배포된 주소를 대상으로 테스트할 수도 있다.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const results = [];

function check(name, condition) {
  results.push({ name, pass: !!condition });
  console.log(`${condition ? '✅' : '❌'} ${name}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // window.prompt()가 뜨면 자동으로 기본값을 넣고 확인 누르게 한다.
  page.on('dialog', async (dialog) => {
    await dialog.accept(dialog.defaultValue() || '테스트 패스키');
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');

  const virtualAuthenticatorOptions = {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true, // 사람이 지문/PIN을 누른 것처럼 항상 통과시킴
    automaticPresenceSimulation: true,
  };

  let { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: virtualAuthenticatorOptions,
  });

  await page.goto(`${BASE_URL}/my-space`);
  await page.waitForSelector('text=패스키로 시작하기');
  check('1. 로그아웃 상태에서는 등록/로그인 폼이 보임', true);

  const name = '홍길동테스트';
  await page.fill('input[type="text"]', name);
  await page.click('button:has-text("패스키 만들기")');

  await page.waitForSelector('text=패스키가 등록되었습니다.', { timeout: 15000 });
  check('2. 패스키 등록 성공 메시지 표시', true);

  await page.waitForSelector(`text=${name}님, 안녕하세요`);
  check('3. 로그인 상태로 전환되어 이름이 표시됨', true);

  let bodyText = await page.textContent('body');
  check('4. 비공개 자료 3건이 화면에 표시됨', (bodyText.match(/합성/g) || []).length >= 3);
  check('5. 등록된 패스키가 1개로 표시됨', bodyText.includes('등록된 패스키 (1개)'));

  // 두 번째 패스키 추가 등록: 실제로는 "다른 기기"를 쓰는 상황이므로
  // 첫 번째 가상 인증장치를 빼고 새 가상 인증장치(두 번째 기기)로 교체한다.
  // (동일한 계정에 대해 한 인증장치는 discoverable credential을 1개만 가질 수 있음)
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: virtualAuthenticatorOptions,
  }));

  await page.click('button:has-text("다른 기기에서 쓸 패스키 추가")');
  await page.waitForSelector('text=등록된 패스키 (2개)', { timeout: 15000 });
  check('6. 두 번째 패스키(다른 기기) 추가 등록 성공', true);

  // 첫 화면(공개 페이지)에는 비공개 정보가 없는지 확인
  const homeRes = await page.goto(`${BASE_URL}/`);
  const homeText = await page.textContent('body');
  const leaked = ['합성 프로젝트 메모', '합성 비공개 일정', '합성 학습 기록', name].some((s) =>
    homeText.includes(s),
  );
  check('7. 공개 첫 화면에는 비공개 자료/이름이 노출되지 않음', !leaked);
  check('7-1. 공개 첫 화면은 200 OK로 열림 (등록 없이 접근 가능)', homeRes.status() === 200);

  // 로그인 없이 API 직접 호출 -> 401이어야 함 (새 컨텍스트로 쿠키 없이 확인)
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto(BASE_URL);
  const meNoAuth = await freshPage.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.status;
  });
  check('8. 로그인하지 않은 요청은 /api/me 에서 401 반환', meNoAuth === 401);
  await freshContext.close();

  // 다시 my-space로 돌아가서 세션/CSRF 얻기
  await page.goto(`${BASE_URL}/my-space`);
  await page.waitForSelector('text=등록된 패스키 (2개)');

  const meInfo = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.json();
  });
  const [firstId, secondId] = meInfo.passkeys.map((p) => p.id);

  // 패스키 1개 삭제 -> 성공해야 함 (2개 중 1개)
  const del1 = await page.evaluate(
    async ({ id, csrf }) => {
      const r = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ credentialId: id }),
      });
      return r.status;
    },
    { id: firstId, csrf: meInfo.csrfToken },
  );
  check('9. 패스키가 2개 이상일 때는 삭제가 허용됨', del1 === 200);

  // 마지막 남은 패스키 삭제 시도 -> 거부되어야 함
  const del2 = await page.evaluate(
    async ({ id, csrf }) => {
      const r = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ credentialId: id }),
      });
      const body = await r.json();
      return { status: r.status, body };
    },
    { id: secondId, csrf: meInfo.csrfToken },
  );
  check('10. 마지막 남은 패스키는 삭제가 거부됨 (400)', del2.status === 400);

  // 삭제된 패스키(firstId)로 로그인 시도 -> 401로 거절되어야 함
  const deletedLogin = await page.evaluate(async (deletedId) => {
    const optRes = await fetch('/api/login/options', { method: 'POST' });
    if (!optRes.ok) return { step: 'options', status: optRes.status };
    const verifyRes = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: { id: deletedId } }),
    });
    return { step: 'verify', status: verifyRes.status };
  }, firstId);
  check(
    '10-1. 삭제된 패스키로 로그인 시도는 거절됨 (401)',
    deletedLogin.step === 'verify' && deletedLogin.status === 401,
  );

  // 같은 challenge(로그인 시도)를 두 번 소비하려 하면 두 번째는 거절되어야 함
  const challengeReuse = await page.evaluate(async () => {
    const optRes = await fetch('/api/login/options', { method: 'POST' });
    if (!optRes.ok) return { step: 'options', status: optRes.status };
    const body = JSON.stringify({ response: { id: 'no-such-credential' } });
    const first = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    // 같은 pending_attempt 쿠키로 다시 시도 (challenge 재사용 공격 시뮬레이션)
    const second = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return { firstStatus: first.status, secondStatus: second.status };
  });
  check(
    '10-2. 이미 소비된 challenge를 재사용하면 거절됨 (두 번째 요청 400)',
    challengeReuse.secondStatus === 400,
  );

  // CSRF 토큰 없이 로그아웃 시도 -> 거부
  const logoutNoCsrf = await page.evaluate(async () => {
    const r = await fetch('/api/logout', { method: 'POST' });
    return r.status;
  });
  check('11. CSRF 토큰 없는 로그아웃 요청은 거부됨 (403)', logoutNoCsrf === 403);

  // 정상 로그아웃
  const logoutOk = await page.evaluate(async (csrf) => {
    const r = await fetch('/api/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
    });
    return r.status;
  }, meInfo.csrfToken);
  check('12. 정상 CSRF 토큰으로 로그아웃 성공', logoutOk === 200);

  // 로그아웃 후 같은 쿠키로 /api/me 재요청 -> 401 (세션이 서버에서 완전히 삭제됨)
  const meAfterLogout = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.status;
  });
  check('13. 로그아웃 후 같은 쿠키로도 재접근 불가 (401)', meAfterLogout === 401);

  // 로그아웃된 화면으로 새로고침 후, 남은 패스키로 재로그인
  await page.reload();
  await page.waitForSelector('text=패스키로 시작하기');
  await page.click('button:has-text("기존 패스키로 로그인")');
  await page.waitForSelector('text=로그인되었습니다.', { timeout: 15000 });
  check('14. 남은 패스키로 재로그인 성공', true);

  bodyText = await page.textContent('body');
  check('15. 재로그인 후에도 같은 계정 정보(이름)가 표시됨', bodyText.includes(`${name}님`));
  check('16. 재로그인 후 패스키 목록은 1개(삭제 반영됨)', bodyText.includes('등록된 패스키 (1개)'));

  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== 요약 ===');
  console.log(`총 ${results.length}개 중 ${results.length - failed.length}개 통과`);
  if (failed.length > 0) {
    console.log('실패한 항목:', failed.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('테스트 실행 중 오류:', err);
  process.exitCode = 1;
});
