# 04 — 등록 옵션 HTTP 왕복, challenge 유일성 (T08-C19, C20)

## 요청/응답 예시

```
요청: POST /api/register/options
본문: { "displayName": "tester" }
응답 상태: 200
응답 본문(요약): {
  "options": {
    "challenge": "«REDACTED»",
    "rp": { "name": "패스키 포트폴리오", "id": "t08-passkey-portfolio-three.vercel.app" },
    "user": { "id": "«REDACTED»", "name": "tester", "displayName": "tester" },
    "pubKeyCredParams": [ ...4개 알고리즘... ],
    "authenticatorSelection": { "residentKey": "required", "userVerification": "required" }
  }
}
```

`rp.id`가 배포 도메인과 정확히 일치하는 것도 함께 확인했다 — WebAuthn은 `rp.id`가
실제 접속 도메인과 다르면 브라우저가 아예 요청을 거부한다.

## C20 — 등록 요청마다 challenge 값이 서로 다르다

같은 브라우저 세션에서 `/api/register/options`를 연속으로 두 번 호출한 결과:

```
1번째 challenge: «REDACTED, 43자»
2번째 challenge: «REDACTED, 43자»
두 값이 다른가: true
```

두 challenge는 문자열 자체가 다르며, 이는 `@simplewebauthn/server`의
`generateRegistrationOptions()`가 매 호출마다 새 무작위 값을 만들기 때문이다
(`src/app/api/register/options/route.ts`에서 `challenge` 옵션을 직접 지정하지 않고 라이브러리
기본 동작에 맡긴다 — 즉 코드를 수정하지 않는 한 재사용될 수 없는 구조).
