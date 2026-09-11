# 07 — 기기를 잃어버렸을 때 (T08-C42 ~ C46)

## C42 — 한 계정에 패스키가 두 개 등록되어 있다

로그인한 상태에서 "다른 기기에서 쓸 패스키 추가" 버튼으로 두 번째 (별도 가상) 인증장치의
패스키를 추가 등록했다. 등록 직후 `/api/me` 응답의 `passkeys` 배열 길이가 2가 되는 것을
확인했다(화면에도 "등록된 패스키 (2개)"로 표시).

## C43 — 등록된 패스키 목록에 이름과 등록일이 보인다

[`src/app/my-space/page.tsx`](../../src/app/my-space/page.tsx)의 목록 렌더링:

```tsx
<strong>{p.deviceName}</strong>
<div className="hint">등록일: {new Date(p.createdAt).toLocaleString('ko-KR')}</div>
```

실제 화면 예시(사용자가 직접 등록한 계정): `passkey-kim9.10.15:33` / 등록일: 2026. 9. 10. 오후 3:33:41

## C44 — 패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다

```
요청: POST /api/passkeys/delete
응답 상태: 200
응답 본문: { "ok": true }
```

삭제 후 로그아웃 → 남은 패스키로 재로그인까지 실제로 성공했다
(`scripts/e2e-passkey-test.mjs`의 14~16번 확인 항목, 21개 중 21개 통과).

## C45 — 지운 패스키로는 더 이상 들어갈 수 없다

```
요청: POST /api/login/verify (삭제된 credential id 사용)
응답 상태: 401
응답 본문: { "error": "등록되지 않았거나 삭제된 패스키입니다." }
```

로그인 시도 때마다 서버가 DB에서 credential id를 다시 조회하므로([`06-passkey-authentication.md`](06-passkey-authentication.md)
C29 참고), 삭제되어 DB에 없는 credential은 조회 단계에서 걸러진다.

## C46 — 패스키가 하나도 남지 않으면 어떻게 되는가

이 앱은 애초에 **패스키가 0개가 되는 상황 자체를 막는다.** 본인 소유 패스키가 1개뿐일 때
그 패스키를 삭제하려 하면 서버가 거절한다:

```
요청: POST /api/passkeys/delete (본인 소유 마지막 1개)
응답 상태: 400
응답 본문: { "error": "마지막 남은 패스키는 삭제할 수 없습니다." }
```

화면에서도 남은 패스키가 1개면 삭제 버튼이 비활성화되고 "마지막 패스키는 삭제할 수
없습니다" 툴팁이 뜬다([`src/app/my-space/page.tsx`](../../src/app/my-space/page.tsx)의
`disabled={busy || me.passkeys.length <= 1}`). 이 앱은 비밀번호 같은 대체 로그인 수단이
없는 순수 패스키 전용 시스템이므로, 마지막 패스키가 사라지면 그 계정은 영구히 잠기게
된다 — 그래서 "0개가 되는 경로 자체를 차단"하는 것을 설계상의 답으로 택했다. 이 결정은
`T08-AUTH-GUIDE.md`의 ⑥(아직 못 막은 것)에서 한계로도 다시 언급한다: 만약 사용자가 유일한
패스키가 등록된 기기를 실제로 분실하면, 이 서비스 안에는 계정을 복구할 다른 수단이 없다.
