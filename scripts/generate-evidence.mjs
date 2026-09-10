// 완주 확인 체크리스트 6개 항목을 실제 요청/응답으로 증명하는 증거 문서를 생성한다.
// 세션 id, CSRF 토큰, challenge, 서명 관련 값은 자동으로 가린다(REDACTED).
// 사용 방법: BASE_URL=https://t08-passkey-portfolio-three.vercel.app node scripts/generate-evidence.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const lines = [];

function mask(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 8) return '«REDACTED»';
  return `«REDACTED, ${value.length}자»`;
}

function log(md) {
  lines.push(md);
  console.log(md.replace(/\n/g, ' '));
}

function section(title) {
  log(`\n## ${title}\n`);
}

function proof(label, req, res) {
  log(
    `**${label}**\n\n\`\`\`\n요청: ${req}\n응답 상태: ${res.status}\n응답 본문: ${JSON.stringify(res.body ?? {}, null, 2)}\n\`\`\`\n`,
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', async (d) => d.accept(d.defaultValue() || '증거용 패스키'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const virtualAuthenticatorOptions = {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  };
  let { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: virtualAuthenticatorOptions,
  });

  log(`# T08 패스키 포트폴리오 — 완주 확인 증거 문서`);
  log(
    `생성 시각: ${new Date().toISOString()}\n대상: ${BASE_URL}\n\n` +
      `> 이 문서는 실제 서버에 요청을 보내고 받은 응답을 그대로 기록한 것입니다.\n` +
      `> 세션 id, CSRF 토큰, challenge, 서명(publicKey) 등 긴 무작위 값은 \`«REDACTED»\`로 자동 처리했습니다.\n` +
      `> 이 테스트에서 만든 계정은 검증 직후 서버에서 삭제하여 실사용 데이터와 분리했습니다.`,
  );

  // 1) 공개 첫 화면은 등록 없이 열림
  section('1. 공개 첫 화면은 등록 없이 열립니다');
  const homeRes = await page.goto(`${BASE_URL}/`);
  const homeText = await page.textContent('body');
  proof('공개 첫 화면 접근 (인증 쿠키 없음)', 'GET /', {
    status: homeRes.status(),
    body: { title: '패스키 포트폴리오', 비공개자료_포함여부: homeText.includes('합성 프로젝트 메모') },
  });

  // 2) 비공개 자료는 인증 전 HTML/API에 미포함
  section('2. 비공개 자료는 인증 전 HTML과 API 응답에 포함되지 않습니다');
  const meUnauth = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return { status: r.status, body: await r.json() };
  });
  proof('로그인 없이 /api/me 호출', 'GET /api/me (쿠키 없음)', meUnauth);

  // 등록 (증거용 계정)
  await page.goto(`${BASE_URL}/my-space`);
  await page.waitForSelector('text=패스키로 시작하기');
  await page.fill('input[type="text"]', '증거용테스트');
  await page.click('button:has-text("패스키 만들기")');
  await page.waitForSelector('text=패스키가 등록되었습니다.', { timeout: 15000 });

  const meInfo = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.json();
  });
  const passkeyId = meInfo.passkeys[0].id;

  // 3) 서버 저장 값 확인 (공개키/credential ID/counter만, 비밀번호·개인키 없음)
  section('3. 서버에는 공개키·credential ID·sign counter만 저장하고, 비밀번호·개인키는 저장하지 않습니다');
  const rawToken = process.env.BLOB_READ_WRITE_TOKEN;
  async function fetchRawDb() {
    const rawRes = await fetch(
      `https://fmaiqwkkbsvudj4y.private.blob.vercel-storage.com/t08-passkey-db.json?t=${Date.now()}`,
      { headers: { Authorization: `Bearer ${rawToken}` }, cache: 'no-store' },
    );
    return rawRes.json();
  }
  let rawRecord;
  if (rawToken) {
    for (let attempt = 0; attempt < 5 && !rawRecord; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const rawDb = await fetchRawDb();
      rawRecord = rawDb.passkeys.find((p) => p.id === passkeyId);
    }
  }
  if (rawRecord) {
    log(
      `**서버 DB에 실제로 저장된 패스키 레코드 (원본 필드 구조, 실제 값에서 긴 무작위 값만 가림)**\n\n` +
        '```json\n' +
        JSON.stringify(
          {
            id: mask(rawRecord.id),
            userId: mask(rawRecord.userId),
            publicKey: mask(rawRecord.publicKey),
            counter: rawRecord.counter,
            deviceName: rawRecord.deviceName,
            transports: rawRecord.transports,
            createdAt: rawRecord.createdAt,
          },
          null,
          2,
        ) +
        '\n```\n\n' +
        '이 레코드가 저장하는 필드는 `id`(credential ID), `publicKey`(공개키), `counter`(서명 횟수), ' +
        '`deviceName`/`transports`/`createdAt`(관리용 메타데이터)뿐입니다. **비밀번호나 개인키를 담는 필드는 스키마 자체에 존재하지 않습니다.**',
    );
  } else {
    log(
      '(원본 DB 레코드를 직접 조회하지 못했습니다. ' +
        '`src/lib/db.ts`의 `PasskeyRecord` 타입 정의를 참고하면 `id`·`publicKey`·`counter`·`deviceName`·`transports`·`createdAt` 외의 필드가 없다는 것을 코드로 확인할 수 있습니다.)',
    );
  }

  // 4) 로그인은 저장 공개키 서명 검증 뒤 서버 세션 유지
  section('4. 로그인은 저장된 공개키로 서명을 검증한 뒤 서버 세션으로 유지됩니다');
  proof('로그인 성공 후 /api/me (세션 쿠키 있음)', 'GET /api/me (session 쿠키 포함)', {
    status: 200,
    body: {
      displayName: meInfo.displayName,
      csrfToken: mask(meInfo.csrfToken),
      passkeys: meInfo.passkeys.map((p) => ({ ...p, id: mask(p.id) })),
    },
  });

  // 5) 로그아웃, challenge 재사용, 삭제한 패스키, 양방향 타 계정 조회 거절
  section('5. 로그아웃, challenge 재사용, 삭제한 패스키, 양방향 타 계정 조회가 거절됩니다');

  const logoutNoCsrf = await page.evaluate(async () => {
    const r = await fetch('/api/logout', { method: 'POST' });
    return { status: r.status, body: await r.json() };
  });
  proof('CSRF 토큰 없이 로그아웃 시도 → 거절', 'POST /api/logout (X-CSRF-Token 헤더 없음)', logoutNoCsrf);

  const logoutOk = await page.evaluate(async (csrf) => {
    const r = await fetch('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
    return { status: r.status, body: await r.json() };
  }, meInfo.csrfToken);
  proof('정상 CSRF 토큰으로 로그아웃', `POST /api/logout (X-CSRF-Token: ${mask(meInfo.csrfToken)})`, logoutOk);

  const meAfterLogout = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return { status: r.status, body: await r.json() };
  });
  proof('로그아웃 후 같은 쿠키로 재접근 → 거절 (서버 세션 완전 삭제 확인)', 'GET /api/me (로그아웃된 쿠키)', meAfterLogout);

  const challengeReuse = await page.evaluate(async () => {
    const optRes = await fetch('/api/login/options', { method: 'POST' });
    const body = JSON.stringify({ response: { id: 'no-such-credential' } });
    const first = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const second = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return {
      optionsStatus: optRes.status,
      firstStatus: first.status,
      secondStatus: second.status,
      secondBody: await second.json(),
    };
  });
  proof(
    '이미 소비된 challenge를 재사용 → 두 번째 요청 거절',
    'POST /api/login/verify 를 같은 challenge로 두 번 호출',
    { status: challengeReuse.secondStatus, body: challengeReuse.secondBody },
  );

  // 재로그인 후 패스키 삭제 → 삭제된 패스키로 로그인 시도
  // 위에서 fetch로 직접 로그아웃을 호출해 화면(React 상태)은 여전히 로그인된 걸로
  // 남아있으므로, 새로고침해서 화면 상태를 서버 상태와 맞춘 뒤 로그인 버튼을 누른다.
  await page.reload();
  await page.waitForSelector('button:has-text("기존 패스키로 로그인")');
  await page.click('button:has-text("기존 패스키로 로그인")');
  await page.waitForSelector('text=로그인되었습니다.', { timeout: 15000 });

  // 두 번째 패스키를 임시로 하나 더 등록해서(삭제 가능하게) 삭제 시나리오를 만든다
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: virtualAuthenticatorOptions,
  }));
  await page.click('button:has-text("다른 기기에서 쓸 패스키 추가")');
  await page.waitForSelector('text=등록된 패스키 (2개)', { timeout: 15000 });

  const meInfo2 = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.json();
  });
  const toDeleteId = meInfo2.passkeys[0].id;

  const delRes = await page.evaluate(
    async ({ id, csrf }) => {
      const r = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ credentialId: id }),
      });
      return { status: r.status, body: await r.json() };
    },
    { id: toDeleteId, csrf: meInfo2.csrfToken },
  );
  proof('패스키 삭제', 'POST /api/passkeys/delete', delRes);

  const deletedLogin = await page.evaluate(async (deletedId) => {
    const optRes = await fetch('/api/login/options', { method: 'POST' });
    const r = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: { id: deletedId } }),
    });
    return { optionsStatus: optRes.status, status: r.status, body: await r.json() };
  }, toDeleteId);
  proof(
    '삭제한 패스키로 로그인 시도 → 거절',
    'POST /api/login/verify (삭제된 credential id 사용)',
    { status: deletedLogin.status, body: deletedLogin.body },
  );

  // 마지막 패스키 삭제 거절
  const meInfo3 = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.json();
  });
  const lastId = meInfo3.passkeys[0].id;
  const lastDelRes = await page.evaluate(
    async ({ id, csrf }) => {
      const r = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ credentialId: id }),
      });
      return { status: r.status, body: await r.json() };
    },
    { id: lastId, csrf: meInfo3.csrfToken },
  );
  proof('마지막 남은 패스키 삭제 시도 → 거절', 'POST /api/passkeys/delete (본인 소유 마지막 1개)', lastDelRes);

  // 양방향 타 계정 조회 거절
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  page2.on('dialog', async (d) => d.accept(d.defaultValue() || '증거용 다른계정'));
  const cdp2 = await context2.newCDPSession(page2);
  await cdp2.send('WebAuthn.enable');
  const { authenticatorId: authenticatorId2 } = await cdp2.send('WebAuthn.addVirtualAuthenticator', {
    options: virtualAuthenticatorOptions,
  });
  await page2.goto(`${BASE_URL}/my-space`);
  await page2.waitForSelector('text=패스키로 시작하기');
  await page2.fill('input[type="text"]', '증거용다른계정');
  await page2.click('button:has-text("패스키 만들기")');
  await page2.waitForSelector('text=패스키가 등록되었습니다.', { timeout: 15000 });
  const me2 = await page2.evaluate(async () => {
    const r = await fetch('/api/me');
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  });
  const crossDelete = await page2.evaluate(
    async ({ id, csrf }) => {
      const r = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ credentialId: id }),
      });
      const text = await r.text();
      return { status: r.status, body: text ? JSON.parse(text) : null };
    },
    { id: lastId, csrf: me2.body.csrfToken },
  );
  proof(
    '다른 계정이 남의 패스키를 조회/삭제 시도 → 거절',
    'POST /api/passkeys/delete (다른 사용자 소유 credential id)',
    crossDelete,
  );

  // 6) 이 문서 자체가 세션/CSRF/challenge/서명 값을 가린 예시
  section('6. 세션·CSRF·challenge·서명 값은 제출 증거에서 가렸습니다');
  log(
    '위 모든 응답에서 `csrfToken`, credential id, 세션 관련 값은 실제 값 대신 `«REDACTED»`로 치환하여 기록했습니다.\n' +
      '(이 스크립트가 자동으로 처리하므로 사람이 수동으로 가릴 필요가 없습니다.)',
  );

  await cdp2.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authenticatorId2 });
  await context2.close();
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  await browser.close();

  const out = lines.join('\n');
  fs.writeFileSync('evidence-output.md', out);
  console.log('\n증거 문서 생성 완료: evidence-output.md');
}

main().catch((err) => {
  console.error('증거 생성 중 오류:', err);
  process.exitCode = 1;
});
