# T08 인증 구현 설명서

대상: `https://t08-passkey-portfolio-three.vercel.app`
소스: `https://github.com/shk12170-dev/t08-passkey-portfolio`

## ① 무엇으로 붙였나

**표준 WebAuthn(FIDO2) 라이브러리**를 직접 코드에 붙였다. 자체 암호 프로토콜을 새로
설계하지도 않았고, Auth0/Firebase Auth 같은 외부 인증 서비스(3rd-party auth
service)에 로그인 로직을 통째로 맡기지도 않았다.

- 서버: [`@simplewebauthn/server`](https://github.com/MasterKale/SimpleWebAuthn) —
  `generateRegistrationOptions`, `verifyRegistrationResponse`,
  `generateAuthenticationOptions`, `verifyAuthenticationResponse`
- 브라우저: `@simplewebauthn/browser` — `startRegistration`, `startAuthentication`
  (내부적으로 `navigator.credentials.create()` / `.get()`을 호출)

## ② 왜 그걸 골랐나

- 과제 요구사항 자체가 "개인키가 기기를 떠나지 않는 패스키"였다. 이건 WebAuthn 표준의
  핵심 속성이라, 표준을 그대로 구현한 라이브러리를 쓰는 게 요구사항과 가장 정확히
  맞아떨어진다.
- WebAuthn의 서명 검증(`attestationObject`/`authenticatorData` 파싱, COSE 키 디코딩,
  CBOR 처리 등)은 직접 구현하면 실수하기 매우 쉬운 영역이다. `@simplewebauthn`는
  널리 쓰이는 오픈소스이고, 이 부분을 검증된 코드에 맡기는 편이 자체 구현보다 안전하다.
- Auth0 같은 완전 위탁형 서비스를 쓰지 않은 이유: 과제 취지가 "인증 흐름 자체를 이해하고
  구현해보는 것"이라 판단했고, 서버 세션·CSRF·challenge 저장 같은 나머지 보안 요소는
  직접 설계하며 그 원리를 배우는 게 맞다고 봤다.

## ③ 어디를 어떻게 고쳤나 (등록 · 로그인 · 로그아웃 · 비공개 자료 조회)

| 흐름 | 지나가는 소스 |
| --- | --- |
| **등록** | 클라이언트: [`src/app/my-space/page.tsx`](../src/app/my-space/page.tsx)의 `handleRegister()` → 서버: [`src/app/api/register/options/route.ts`](../src/app/api/register/options/route.ts)(challenge 발급, 아직 계정 미생성) → 브라우저 `navigator.credentials.create()` → [`src/app/api/register/verify/route.ts`](../src/app/api/register/verify/route.ts)(서명 검증 성공 시에만 [`src/lib/db.ts`](../src/lib/db.ts)의 `users`/`passkeys`에 기록, [`src/lib/session.ts`](../src/lib/session.ts)로 세션 발급) |
| **로그인** | 클라이언트: `handleLogin()` → [`src/app/api/login/options/route.ts`](../src/app/api/login/options/route.ts)(challenge 발급) → 브라우저 `navigator.credentials.get()` → [`src/app/api/login/verify/route.ts`](../src/app/api/login/verify/route.ts)(DB에 저장된 공개키로 서명 검증, `counter` 갱신, 세션 발급) |
| **로그아웃** | 클라이언트: `handleLogout()` → [`src/app/api/logout/route.ts`](../src/app/api/logout/route.ts)(CSRF 토큰 확인 후 [`src/lib/session.ts`](../src/lib/session.ts)의 `destroySession()`으로 DB의 세션 레코드 자체를 삭제) |
| **비공개 자료 조회** | 클라이언트: `my-space` 페이지의 `loadMe()` → [`src/app/api/me/route.ts`](../src/app/api/me/route.ts)(세션 검증 → 세션의 `userId` 기준으로만 [`src/lib/privateData.ts`](../src/lib/privateData.ts)의 합성 자료 조립) |

세부 저장 스키마와 challenge 1회용 소비 로직은 [`src/lib/db.ts`](../src/lib/db.ts),
[`src/lib/challenge.ts`](../src/lib/challenge.ts) 참고.

## ④ "안 열리는 것"을 확인한 기록

아래 4가지 시나리오를 모두 실제 서버에 요청을 보내 검증했다(요청/응답 원본은
`docs/evidence/` 참고, 민감 값은 자동으로 가림).

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 로그인 없이 비공개 자료 열기 | 401 거절 | `docs/evidence/01-public-private-boundary.md` |
| 남의 패스키로 (다른 계정 자료) 열기 | 404 거절, 자료 건수 불변 | `docs/evidence/08-cross-account-isolation.md` |
| 이미 쓴 질문(challenge) 재사용 | 400 거절 | `docs/evidence/06-passkey-authentication.md` (C31) |
| 패스키 삭제 뒤 그 패스키로 로그인 | 401 거절 | `docs/evidence/06-passkey-authentication.md`, `07-second-passkey-recovery.md` |

성공/실패 사례를 나란히 남긴 부분: `docs/evidence/06-passkey-authentication.md`의 C30.
자동 재현 스크립트: `scripts/generate-evidence.mjs`, `scripts/e2e-passkey-test.mjs`
(21개 중 21개 통과, `BASE_URL=<배포주소> npm run test:e2e`로 재현 가능).

## ⑤ AI와 나

- **AI에게 맡긴 일**: WebAuthn 연결 초안 작성, 테스트 스크립트(가상 인증장치 기반
  e2e 테스트·증거 생성 스크립트) 작성, 이 설명서 초안.
- **내가 직접 판단한 일**: 비밀번호 없는 공개 등록 방식 채택, 서버 세션(쿠키) 기반 인증
  유지 방식 선택, "마지막 남은 패스키는 삭제 금지"라는 정책 결정, 합성(가짜) 데이터만
  쓰는 개인정보 보호 원칙, 실제 기기(Windows Hello)로 최종 동작 확인.
- **AI 제안을 따르지 않은 일**: 이전 과제(T07)의 비밀번호·JWT 방식을 재사용하지
  않았다 — T08은 개인키가 기기를 떠나지 않는 패스키 과제이므로 애초에 성격이 다른
  인증 방식이기 때문이다. 또한 AI가 처음에 `userVerification: 'preferred'`로 설정했던
  것을, 실제 기기 테스트에서 "지문은 인식됐는데 서버가 거절하는" 문제가 발견되어
  `'required'`로 직접 바꿨다(아래 ⑥ 및 `docs/evidence/03-server-held-ceremony.md` 참고).

## ⑥ 아직 못 막은 것 (알려진 한계)

1. **인증 엔드포인트에 별도의 요청 속도 제한(rate limiting)이 없다.** `/api/register/options`,
   `/api/login/verify` 등은 짧은 시간에 몇 번을 호출해도 서버가 막지 않는다. credential id가
   충분히 무작위(43자)라 무차별 대입으로 맞히는 건 현실적으로 불가능에 가깝지만, 반복 요청
   자체로 서버 자원(패스키 저장소 쓰기 횟수 등)을 소모시키는 것은 여전히 가능하다.
2. **소비되지 않고 만료된 challenge 레코드가 자동으로 청소되지 않는다.** 등록/로그인을
   시작만 하고 끝까지 진행하지 않으면(예: 브라우저를 그냥 닫아버림), 그 challenge
   레코드는 5분 뒤 "쓸모없어지긴" 하지만 DB 배열에서 능동적으로 지워지진 않는다.
   장기적으로 계속 쌓이면 저장 용량을 조금씩 잡아먹는다(별도의 정리 작업이 없음).
3. **패스키를 등록한 유일한 기기를 실제로 분실하면 계정을 되찾을 방법이 없다.** 이
   프로젝트는 의도적으로 "패스키 0개" 상태 자체를 막아 두었지만(`docs/evidence/07-second-passkey-recovery.md`
   C46), 이는 어디까지나 "마지막 남은 패스키의 삭제"만 막을 뿐 "기기 분실·고장"까지
   막지는 못한다. 비밀번호 재설정 메일 같은 대체 복구 수단이 전혀 없다.
