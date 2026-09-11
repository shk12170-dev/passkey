# 08 — 양방향 타 계정 조회 거절 (T08-C36 ~ C41)

두 개의 완전히 별도인 계정(각자 다른 가상 인증장치로 등록)을 만들어 테스트했다.

## C36 — 두 계정의 비공개 내용이 실제로 서로 다르다

```
계정1(증거용테스트) 비공개 자료 제목:
  증거용테스트님의 합성 프로젝트 메모 / 증거용테스트님의 합성 비공개 일정 / 증거용테스트님의 합성 학습 기록
계정2(증거용다른계정) 비공개 자료 제목:
  증거용다른계정님의 합성 프로젝트 메모 / 증거용다른계정님의 합성 비공개 일정 / 증거용다른계정님의 합성 학습 기록
서로 다른가: true
```

(참고: 처음 구현에서는 3개 항목 중 1개만 이름이 반영되고 나머지 2개는 모든 계정에 완전히
동일한 문구였다. C36을 명확히 만족시키기 위해 세 항목 모두에 표시 이름을 반영하도록
[`src/lib/privateData.ts`](../../src/lib/privateData.ts)를 수정했다 — 커밋 `08aac49`.)

## C37, C40 — 한쪽이 다른 쪽 자료를 요청 본문에 직접 적어 요청 → 거절

```
요청: POST /api/passkeys/delete (계정2 세션 + 계정1 소유 credential id)
응답 상태: 404
응답 본문: { "error": "패스키를 찾을 수 없습니다." }
```

계정2로 로그인한 상태에서, 요청 본문(`credentialId`)에 **계정1이 소유한** credential id를
직접 적어 삭제를 시도했다. 세션은 계정2의 것이 유효하지만(로그인 자체는 통과), 그 안에서
찾는 대상이 계정1 소유라 거절된다.

## C39 — 거절 앞뒤로 상대편 자료 건수가 같다

```
거절 시도 전: 1개
거절 시도 후: 1개
그대로 유지되었는가: true
```

계정1의 패스키 개수를 공격 시도 직전/직후에 각각 조회해 비교했다 — 거절된 요청은 아무
부작용도 남기지 않는다.

## C38 — 반대 방향도 똑같이 거절된다

```
요청: POST /api/passkeys/delete (계정1 세션 + 계정2 소유 credential id)
응답 상태: 404
응답 본문: { "error": "패스키를 찾을 수 없습니다." }
```

```
계정2 패스키 개수 — 거절 시도 전: 1개 / 거절 시도 후: 1개
```

## C41 — 이 거절을 만들어 내는 소스 위치

[`src/app/api/passkeys/delete/route.ts`](../../src/app/api/passkeys/delete/route.ts):

```ts
// 반드시 "현재 로그인한 사용자 소유"의 패스키 목록 안에서만 찾는다.
// -> 다른 계정의 credentialId를 넣어도 지울 수 없다.
const userPasskeys = db.data.passkeys.filter((p) => p.userId === session.userId);
const target = userPasskeys.find((p) => p.id === credentialId);
if (!target) {
  return NextResponse.json({ error: '패스키를 찾을 수 없습니다.' }, { status: 404 });
}
```

[`src/app/api/me/route.ts`](../../src/app/api/me/route.ts)도 동일하게 항상
`session.userId` 기준으로만 데이터를 조회한다 — 클라이언트가 어떤 값을 요청 본문/URL에
적어 보내도, 서버는 세션이 가리키는 계정 외의 데이터를 절대 반환하지 않는 구조다.
