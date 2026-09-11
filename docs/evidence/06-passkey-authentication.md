# 06 — 패스키 로그인 (T08-C27 ~ C35)

## C27, C28 — 로그인마다 서버가 새 질문(challenge)을 만들고, 매번 값이 다르다

`/api/login/options`는 호출할 때마다 `generateAuthenticationOptions()`로 새 challenge를
만든다([`src/app/api/login/options/route.ts`](../../src/app/api/login/options/route.ts)).
같은 브라우저 세션에서 연속으로 두 번 호출한 결과:

```
1번째 challenge: «REDACTED, 43자»
2번째 challenge: «REDACTED, 43자»
두 값이 다른가: true
```

## C29, C30 — 저장된 공개키로 서명을 확인한 뒤에만 통과 (성공/실패 나란히)

**성공 사례** — 등록해 둔 진짜 패스키로 로그인:

```
요청: POST /api/login/verify (유효한 서명)
응답 상태: 200
응답 본문: { "ok": true }
```

**실패 사례** — 이미 삭제한(더 이상 서버에 없는) credential id로 로그인 시도:

```
요청: POST /api/login/verify (삭제된 credential id 사용)
응답 상태: 401
응답 본문: { "error": "등록되지 않았거나 삭제된 패스키입니다." }
```

소스([`src/app/api/login/verify/route.ts`](../../src/app/api/login/verify/route.ts)):
서버는 요청이 들어오면 먼저 DB에서 해당 `credential id`로 저장된 공개키를 찾고
(없으면 위처럼 401), 있으면 `verifyAuthenticationResponse()`로 **저장된 공개키를 이용해
서명을 암호학적으로 검증**한다. 검증에 실패하면 여기서도 401을 반환하고 세션을
발급하지 않는다.

## C31 — 이미 한 번 쓴 질문을 재사용하면 거절된다

같은 `pending_attempt`(challenge 참조)로 `/api/login/verify`를 연달아 두 번 호출:

```
요청: POST /api/login/verify 를 같은 challenge로 두 번 호출
(두 번째 요청)
응답 상태: 400
응답 본문: { "error": "로그인 시도가 유효하지 않거나 이미 사용되었습니다." }
```

`consumeChallenge()`가 첫 번째 호출에서 challenge를 DB에서 이미 지워버렸기 때문에,
두 번째 호출은 애초에 찾을 challenge가 없어 거절된다 (`03-server-held-ceremony.md` 참고).

## C32 — 로그인 뒤 무엇으로 사람을 알아보는가: 서버 세션(쿠키)

로그인에 성공하면 서버가 임의의 세션 id를 발급해 DB의 `sessions` 테이블에 저장하고,
그 id를 `session_id`라는 **httpOnly 쿠키**로 브라우저에 내려준다
([`src/lib/session.ts`](../../src/lib/session.ts)의 `createSession()`). JWT처럼 클라이언트가
검증 가능한 토큰을 들고 다니는 방식이 아니라, 매 요청마다 서버가 DB에서 그 세션 id가
아직 유효한지 직접 조회하는 **순수 서버 세션** 방식이다.

## C33 — 로그아웃한 뒤 같은 값으로 다시 요청하면 거절된다

```
요청: POST /api/logout (X-CSRF-Token 헤더 없음)
응답 상태: 403
응답 본문: { "error": "CSRF 토큰이 유효하지 않습니다." }

요청: POST /api/logout (X-CSRF-Token: «REDACTED»)
응답 상태: 200
응답 본문: { "ok": true }

요청: GET /api/me (로그아웃된 쿠키)
응답 상태: 401
응답 본문: { "error": "로그인이 필요합니다." }
```

로그아웃은 쿠키만 지우는 게 아니라 `destroySession()`이 **서버 DB의 세션 레코드 자체를
삭제**하므로([`src/lib/session.ts`](../../src/lib/session.ts)), 로그아웃 이전 쿠키 값을
그대로 다시 보내도 서버에 대응하는 레코드가 없어 통하지 않는다.

## C34 — 위 기록에서 세션·토큰 값이 가려져 있다

이 문서와 다른 모든 증거 문서는 `scripts/generate-evidence.mjs`가 세션 id, CSRF 토큰,
credential id, 공개키처럼 긴 무작위 값을 자동으로 `«REDACTED»`로 치환해 생성한 것이다.

## C35 — 어디에도 비밀번호 입력 칸이 없다

`01-public-private-boundary.md` 참고. 등록/로그인 화면 모두 `<input type="text">`(표시
이름) 하나뿐이며, `<input type="password">`는 프로젝트 전체에 존재하지 않는다.
