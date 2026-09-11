# 01 — 공개/비공개 경계 (T08-C13 ~ C18)

대상: `https://t08-passkey-portfolio-three.vercel.app`
검증 방식: 재현 가능한 자동 스크립트(`scripts/generate-evidence.mjs`)로 실서버에 요청.

## C13 — 공개 영역과 비공개 영역이 화면에서 구분되어 보인다

- 공개 영역: `/` (첫 화면) — 서비스 소개 문구와 "나만의 공간으로 이동" 버튼만 있다.
- 비공개 영역: `/my-space` 안의 "비공개 자료 (합성 데이터)" 카드 — 로그인해야만 나타난다.
- 소스: [`src/app/page.tsx`](../../src/app/page.tsx)(공개) vs
  [`src/app/my-space/page.tsx`](../../src/app/my-space/page.tsx)의 `{!me ? ... : <>...비공개 자료...</>}` 분기.

## C14 — 비공개 영역에 들어 있는 항목이 세 개 이상이다

[`src/lib/privateData.ts`](../../src/lib/privateData.ts)의 `getSyntheticPrivateItems()`가 항상 3개
(합성 프로젝트 메모 / 합성 비공개 일정 / 합성 학습 기록)를 반환한다. 아래 C15/C36 증거의 응답 본문에서
`privateItems` 배열 길이가 3인 것을 확인할 수 있다.

## C15 — 패스키로 들어가지 않은 상태에서는 비공개 영역의 내용이 화면에 보이지 않는다

```
요청: GET /
응답 상태: 200
응답 본문(요약): {
  "title": "패스키 포트폴리오",
  "비공개자료_포함여부": false
}
```

`/` 페이지의 렌더링된 HTML 텍스트에 "합성 프로젝트 메모"(비공개 자료 제목의 일부)가 전혀 포함되어
있지 않음을 문자열 검색으로 확인했다.

## C16, C17 — 비공개 자료를 서버에 직접 요청하면 401로 거절된다

```
요청: GET /api/me (쿠키 없음)
응답 상태: 401
응답 본문: { "error": "로그인이 필요합니다." }
```

소스: [`src/app/api/me/route.ts`](../../src/app/api/me/route.ts) —
`const session = await getSession(req); if (!session) return NextResponse.json(..., { status: 401 });`
가 비공개 자료(`privateItems`)를 조립하기 **전에** 실행된다.

## C18 — 로그인하지 않은 상태로 받은 페이지의 소스 어디에도 비공개 내용이 없다

`/` 는 서버 컴포넌트([`src/app/page.tsx`](../../src/app/page.tsx))이지만 세션이나 사용자 데이터를
아예 조회하지 않으므로, 렌더링되는 HTML(첫 로드 시 응답되는 원본 소스 포함)에 비공개 데이터가
포함될 여지 자체가 없다. 실제 응답 HTML을 확인해도 위 C15 결과와 같이 비공개 자료 문자열이
존재하지 않는다.

## 관련 항목: C35 — 비밀번호를 입력하는 칸이 없다

`/`, `/my-space` 어디에도 `<input type="password">` 요소가 없다. 로그인/등록 폼에는
표시 이름을 적는 텍스트 입력창(`<input type="text">`)만 있고, 실제 인증은 브라우저의
WebAuthn API(`navigator.credentials.create/get`)가 처리하며 비밀번호 개념 자체가 없다.
