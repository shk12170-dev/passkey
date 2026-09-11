# 03 — 서버가 등록용 질문을 만들어 보관한다 (T08-C19)

## 흐름

1. 클라이언트가 `POST /api/register/options` 호출
2. 서버가 `@simplewebauthn/server`의 `generateRegistrationOptions()`로 무작위 challenge 생성
3. 서버가 그 challenge를 **DB의 `challenges` 테이블에 저장**하고, 브라우저에는
   `pending_attempt` 쿠키(challenge 레코드의 id만) 발급 — challenge 원본 값 자체는 쿠키로 노출하지 않는다.
4. 브라우저가 실제 인증장치(지문/PIN)로 서명한 결과를 `POST /api/register/verify` 로 제출
5. 서버가 쿠키의 id로 challenge 레코드를 DB에서 찾아 **1회용으로 소비(삭제)**하고,
   `verifyRegistrationResponse()`로 challenge 일치 여부와 서명을 확인

## 소스 위치

- 생성/보관: [`src/app/api/register/options/route.ts`](../../src/app/api/register/options/route.ts)
  → [`src/lib/challenge.ts`](../../src/lib/challenge.ts)의 `createChallenge()`
- 확인/소비: [`src/app/api/register/verify/route.ts`](../../src/app/api/register/verify/route.ts)
  → `src/lib/challenge.ts`의 `consumeChallenge()` (조회 즉시 배열에서 제거)

```ts
// src/lib/challenge.ts
export async function consumeChallenge(id: string) {
  const db = await getDB();
  await db.read();
  const index = db.data.challenges.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const [record] = db.data.challenges.splice(index, 1); // 1회용: 찾자마자 제거
  await db.write();
  const age = Date.now() - new Date(record.createdAt).getTime();
  if (age > CHALLENGE_TTL_MS) return null; // 5분 만료
  return record;
}
```

이 설계 덕분에 같은 challenge로 두 번째 검증을 시도하면 이미 배열에서 사라진 뒤라 무조건
거절된다 — 자세한 실제 요청/응답은 `06-passkey-authentication.md`(C31) 참고.

## 등록 취소 시 아무것도 남지 않는지 (C25)

challenge 자체는 검증 전까지 "보관"되어야 하는 게 프로토콜상 당연하지만(그래야 나중에 비교할
수 있으므로), **사용자 계정**은 검증에 실제로 성공하기 전까지 만들지 않는다.

```
요청한 이름: 취소테스트_1789097077198
(옵션만 호출, verify는 호출하지 않음 — 지문 인증 취소를 재현)
서버 DB에 이 이름의 계정이 생겼는가: 아니오 (정상)
```

소스: [`src/app/api/register/options/route.ts`](../../src/app/api/register/options/route.ts)의 주석—

```ts
// 로그인 전 -> 새 계정을 합성 이름으로 만드는 경우.
// 계정 레코드는 아직 만들지 않는다 — 사용자가 등록을 취소하면(지문/PIN 창에서
// 거부·시간초과) 서버에 아무 흔적도 남지 않아야 하기 때문에, 실제로 등록에
// 성공했을 때(register/verify)에만 users 테이블에 기록한다.
```

> **수정 이력**: 처음 구현에서는 이 옵션 호출 시점에 곧바로 `users` 테이블에 계정을 만들고
> 있었다. 그래서 사용자가 지문 인증을 취소해도 서버에 "패스키 없는 유령 계정"이 하나
> 남는 문제가 있었다(C25 위반). 계정 생성을 register/verify 성공 시점으로 옮겨서 고쳤다 —
> 커밋 `fb87eae`.
