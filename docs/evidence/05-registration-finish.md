# 05 — 등록 완료 (T08-C21 ~ C25)

## C21, C22 — 등록이 끝나면 서버에 "공개키"가 저장된다 (비밀번호 아님)

실제로 등록 한 건을 마친 뒤, 서버 DB(Vercel Blob)에 저장된 원본 레코드를 직접 조회한 결과:

```json
{
  "id": "«REDACTED, 43자»",
  "userId": "«REDACTED, 16자»",
  "publicKey": "«REDACTED, 56자»",
  "counter": 1,
  "deviceName": "내 패스키",
  "transports": ["internal"],
  "createdAt": "2026-09-11T03:24:53.461Z"
}
```

`publicKey` 필드에 저장된 값은 WebAuthn 등록 응답의 `attestationObject`에서 추출한
**공개키**(비대칭 키 쌍 중 남에게 공개해도 되는 절반)이다. 이 필드는 원문 그대로 저장돼도
안전하다는 것이 WebAuthn 표준의 전제이며, 비밀번호처럼 해시/솔트 처리가 필요 없다.
스키마([`src/lib/db.ts`](../../src/lib/db.ts)의 `PasskeyRecord` 타입)에는
`password`, `privateKey` 같은 필드가 애초에 존재하지 않는다.

```ts
export type PasskeyRecord = {
  id: string;
  userId: string;
  publicKey: string; // 공개키(base64) — 개인키 아님
  counter: number;
  deviceName: string;
  transports?: string[];
  createdAt: string;
};
```

## C23 — 개인키가 서버로 전송되지 않는다

브라우저가 실제로 `/api/register/verify`에 보낸 요청 본문의 최상위 필드를 그대로 기록한 것:

```json
{
  "deviceName": "내 패스키",
  "response (최상위 키만)": ["id", "rawId", "response", "type", "clientExtensionResults", "authenticatorAttachment"],
  "response.response (WebAuthn 표준 attestation 필드, 최상위 키만)": [
    "attestationObject",
    "clientDataJSON",
    "transports",
    "publicKeyAlgorithm",
    "publicKey",
    "authenticatorData"
  ]
}
```

`attestationObject`/`clientDataJSON`은 WebAuthn 표준이 정의하는 **서명·공개키 관련 공개
데이터**이며, `privateKey`나 이에 준하는 필드는 어디에도 없다. 이는 우연이 아니라
WebAuthn API(`navigator.credentials.create()`) 자체가 개인키를 JavaScript로 꺼낼 수 있는
방법을 제공하지 않기 때문이다 — 개인키는 브라우저/OS의 보안 하드웨어(TPM, Secure
Enclave 등) 밖으로 절대 나가지 않는다.

## C24 — 등록한 패스키에 사람이 알아볼 수 있는 이름이 붙는다

등록 성공 직후 클라이언트가 `window.prompt()`로 기기 이름을 물어보고, 그 값을
`deviceName` 필드로 함께 전송한다([`src/app/my-space/page.tsx`](../../src/app/my-space/page.tsx)의
`handleRegister()`). 화면의 "등록된 패스키" 목록에 이 이름과 등록일이 함께 표시된다
(예: `passkey-kim9.10.15:33` — 사용자가 직접 붙인 이름).

## C25 — 등록을 중간에 취소하면 서버에 아무것도 저장되지 않는다

`03-server-held-ceremony.md`에서 자세히 다룬다. 요약: 옵션만 요청하고 실제 인증(지문/PIN)
없이 중단하면, 서버 DB에 해당 이름의 계정이 전혀 생기지 않는다. 이 항목은 원래
위반되고 있었던 실제 버그였고(옵션 요청 시점에 곧바로 계정을 만들었음), 계정 생성
시점을 검증 성공 이후로 옮겨 수정했다(커밋 `fb87eae`).

화면 안내: 취소/시간초과 시 `NotAllowedError`를 감지해 "취소되었거나 시간이
초과되었습니다."라는 안내 문구를 보여준다([`src/app/my-space/page.tsx`](../../src/app/my-space/page.tsx)의
`errorMessage()`).
