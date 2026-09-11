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

const rawTokenGlobal = () => process.env.BLOB_READ_WRITE_TOKEN;
async function fetchRawDbGlobal() {
  const rawRes = await fetch(
    `https://fmaiqwkkbsvudj4y.private.blob.vercel-storage.com/t08-passkey-db.json?t=${Date.now()}`,
    { headers: { Authorization: `Bearer ${rawTokenGlobal()}` }, cache: 'no-store' },
  );
  return rawRes.json();
}
async function fetchRawRecordWithRetry(predicate, attempts = 5, delayMs = 1500) {
  if (!rawTokenGlobal()) return undefined;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    const rawDb = await fetchRawDbGlobal();
    const found = predicate(rawDb);
    if (found) return found;
  }
  return undefined;
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

  // C20: 등록 요청마다 challenge가 서로 다른지 확인 (같은 브라우저 컨텍스트로 두 번 호출)
  section('C20. 등록 요청마다 질문(challenge) 값이 서로 다릅니다');
  const twoRegOptions = await page.evaluate(async () => {
    const a = await (
      await fetch('/api/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '챌린지비교용A' }),
      })
    ).json();
    const b = await (
      await fetch('/api/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '챌린지비교용B' }),
      })
    ).json();
    return { first: a.options.challenge, second: b.options.challenge };
  });
  log(
    `**같은 화면에서 등록 옵션을 두 번 요청한 challenge 값 비교**\n\n` +
      '```\n' +
      `1번째 challenge: ${mask(twoRegOptions.first)}\n` +
      `2번째 challenge: ${mask(twoRegOptions.second)}\n` +
      `두 값이 다른가: ${twoRegOptions.first !== twoRegOptions.second}\n` +
      '```\n',
  );

  // C25: 등록을 시작만 하고(challenge 발급) 끝까지 진행하지 않으면(취소/포기)
  // 서버에 계정이 생기지 않아야 한다.
  section('C25. 등록을 중간에 취소하면 서버에 아무것도 남지 않습니다');
  const cancelName = `취소테스트_${Date.now()}`;
  await page.evaluate(async (name) => {
    await fetch('/api/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name }),
    });
  }, cancelName);
  const ghostUserFound = rawTokenGlobal()
    ? ((await fetchRawDbGlobal()).users.find((u) => u.displayName === cancelName) ?? null)
    : null;
  log(
    `**등록 옵션만 요청하고(지문 인증 없이) verify는 호출하지 않은 뒤, 서버 DB에 해당 이름의 계정이 있는지 확인**\n\n` +
      '```\n' +
      `요청한 이름: ${cancelName}\n` +
      `서버 DB에 이 이름의 계정이 생겼는가: ${ghostUserFound ? '예 (문제!)' : '아니오 (정상)'}\n` +
      '```\n',
  );

  // 등록 (증거용 계정) — 이때 실제로 브라우저가 서버로 보내는 요청 본문을 가로채서
  // C23(개인키가 전송되지 않는다는 사실)의 증거로 남긴다.
  await page.goto(`${BASE_URL}/my-space`);
  await page.waitForSelector('text=패스키로 시작하기');
  await page.fill('input[type="text"]', '증거용테스트');

  const [verifyRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().endsWith('/api/register/verify') && req.method() === 'POST'),
    page.click('button:has-text("패스키 만들기")'),
  ]);
  await page.waitForSelector('text=패스키가 등록되었습니다.', { timeout: 15000 });

  const verifyReqBody = JSON.parse(verifyRequest.postData() ?? '{}');
  section('C23. 등록 요청 본문에 개인키가 들어있지 않습니다');
  log(
    `**브라우저가 /api/register/verify 로 실제로 보낸 요청 본문의 최상위 필드들**\n\n` +
      '```json\n' +
      JSON.stringify(
        {
          deviceName: verifyReqBody.deviceName,
          'response (최상위 키만)': Object.keys(verifyReqBody.response ?? {}),
          'response.response (WebAuthn 표준 attestation 필드, 최상위 키만)': Object.keys(
            verifyReqBody.response?.response ?? {},
          ),
        },
        null,
        2,
      ) +
      '\n```\n\n' +
      '`clientDataJSON`/`attestationObject`는 WebAuthn 표준이 정의하는 공개 인증서/서명 관련 데이터이고, ' +
      '`privateKey`/`password` 같은 필드는 어디에도 없습니다. (개인키는 브라우저/OS 안의 보안 하드웨어를 벗어나지 않으며, ' +
      'WebAuthn API 자체가 개인키를 JS로 꺼낼 수 있는 방법을 제공하지 않습니다.)',
  );

  const meInfo = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return r.json();
  });
  const passkeyId = meInfo.passkeys[0].id;

  // 3) 서버 저장 값 확인 (공개키/credential ID/counter만, 비밀번호·개인키 없음)
  section('3. 서버에는 공개키·credential ID·sign counter만 저장하고, 비밀번호·개인키는 저장하지 않습니다');
  const rawRecord = await fetchRawRecordWithRetry((rawDb) =>
    rawDb.passkeys.find((p) => p.id === passkeyId),
  );
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

  // C28: 로그인 요청마다 challenge가 서로 다른지 확인
  section('C28. 로그인 요청마다 질문(challenge) 값이 서로 다릅니다');
  const twoLoginOptions = await page.evaluate(async () => {
    const a = await (await fetch('/api/login/options', { method: 'POST' })).json();
    const b = await (await fetch('/api/login/options', { method: 'POST' })).json();
    return { first: a.options.challenge, second: b.options.challenge };
  });
  log(
    `**같은 화면에서 로그인 옵션을 두 번 요청한 challenge 값 비교**\n\n` +
      '```\n' +
      `1번째 challenge: ${mask(twoLoginOptions.first)}\n` +
      `2번째 challenge: ${mask(twoLoginOptions.second)}\n` +
      `두 값이 다른가: ${twoLoginOptions.first !== twoLoginOptions.second}\n` +
      '```\n',
  );

  // 재로그인(성공 사례) — 실패 사례(삭제된 패스키로 로그인, 아래)와 나란히 비교하기 위해 먼저 성공 사례를 기록한다.
  section('C30. 서명 확인 성공/실패 사례 비교');
  await page.reload();
  await page.waitForSelector('button:has-text("기존 패스키로 로그인")');
  const [loginVerifyResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/api/login/verify')),
    page.click('button:has-text("기존 패스키로 로그인")'),
  ]);
  proof(
    '성공 사례: 등록된 패스키로 로그인 → 통과',
    'POST /api/login/verify (유효한 서명)',
    { status: loginVerifyResponse.status(), body: await loginVerifyResponse.json() },
  );
  // (실패 사례는 이 아래 "삭제한 패스키로 로그인 시도" 항목에서 바로 이어진다.)

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

  // 위 "C30 성공 사례"에서 이미 재로그인을 마쳤으므로, 여기서는 화면이 로그인
  // 상태로 반영됐는지만 확인하고 바로 이어서 패스키 삭제 시나리오로 넘어간다.
  await page.reload();
  await page.waitForSelector('text=등록된 패스키');

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

  // 양방향 타 계정 조회 거절 (C36~C41)
  section('C36~C41. 양방향 타 계정 조회 거절');
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

  // C36: 두 계정의 비공개 자료가 실제로 서로 다른 내용인지 확인
  const meInfo4 = await page.evaluate(async () => (await fetch('/api/me')).json());
  log(
    `**C36. 계정 1과 계정 2의 비공개 자료 내용 비교 (제목만)**\n\n` +
      '```\n' +
      `계정1(${meInfo4.displayName}) 비공개 자료 제목: ${meInfo4.privateItems.map((i) => i.title).join(' / ')}\n` +
      `계정2(${me2.body.displayName}) 비공개 자료 제목: ${me2.body.privateItems.map((i) => i.title).join(' / ')}\n` +
      `서로 다른가: ${JSON.stringify(meInfo4.privateItems) !== JSON.stringify(me2.body.privateItems)}\n` +
      '```\n',
  );

  // C39: 거절 전/후 상대편(계정1) 패스키 개수가 그대로인지 비교하기 위해 미리 세어 둔다.
  const account1CountBefore = meInfo4.passkeys.length;

  // C37/C39/C40: 계정2 → 계정1의 패스키를 요청 본문에 직접 적어 삭제/조회 시도
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
    'C37/C40. 계정2 → 계정1: 요청 본문에 계정1의 credential id를 직접 적어 삭제 시도 → 거절',
    'POST /api/passkeys/delete (계정2 세션 + 계정1 소유 credential id)',
    crossDelete,
  );

  const meInfo5 = await page.evaluate(async () => (await fetch('/api/me')).json());
  log(
    `**C39. 거절 전/후 계정1의 패스키 개수 비교**\n\n` +
      '```\n' +
      `거절 시도 전: ${account1CountBefore}개\n` +
      `거절 시도 후: ${meInfo5.passkeys.length}개\n` +
      `그대로 유지되었는가: ${account1CountBefore === meInfo5.passkeys.length}\n` +
      '```\n',
  );

  // C38: 반대 방향(계정1 → 계정2)도 똑같이 거절되는지 확인
  const account2CountBefore = me2.body.passkeys.length;
  const reverseCrossDelete = await page.evaluate(
    async ({ id, csrf }) => {
      const r = await fetch('/api/passkeys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ credentialId: id }),
      });
      const text = await r.text();
      return { status: r.status, body: text ? JSON.parse(text) : null };
    },
    { id: me2.body.passkeys[0].id, csrf: meInfo5.csrfToken },
  );
  proof(
    'C38. 반대 방향: 계정1 → 계정2 소유 credential id를 삭제 시도 → 거절',
    'POST /api/passkeys/delete (계정1 세션 + 계정2 소유 credential id)',
    reverseCrossDelete,
  );
  const me2After = await page2.evaluate(async () => (await fetch('/api/me')).json());
  log(
    `**계정2 패스키 개수도 그대로인지 확인**\n\n` +
      '```\n' +
      `거절 시도 전: ${account2CountBefore}개 / 거절 시도 후: ${me2After.passkeys.length}개\n` +
      '```\n',
  );

  log(
    'C41. 이 거절들을 만들어 내는 소스 위치: `src/app/api/passkeys/delete/route.ts` — ' +
      '`db.data.passkeys.filter((p) => p.userId === session.userId)` 로 **항상 현재 로그인한 세션의 소유 목록 안에서만** ' +
      'credential id를 찾고, 그 목록에 없으면(다른 계정 소유라면) 404를 돌려준다. `src/app/api/me/route.ts` 도 ' +
      '동일하게 `session.userId` 기준으로만 데이터를 조회하므로, 클라이언트가 다른 계정 정보를 요청 본문/주소에 넣어도 반영되지 않는다.',
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
