import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getDB } from '@/lib/db';
import { consumeChallenge } from '@/lib/challenge';
import { createSession, PENDING_ATTEMPT_COOKIE, clearPendingAttemptCookie } from '@/lib/session';
import { origin, rpID } from '@/lib/webauthn';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.response?.id) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const pendingId = req.cookies.get(PENDING_ATTEMPT_COOKIE)?.value;
  if (!pendingId) {
    return NextResponse.json({ error: '로그인 시도가 만료되었습니다. 다시 시도해주세요.' }, { status: 400 });
  }

  const challengeRecord = await consumeChallenge(pendingId);
  if (!challengeRecord || challengeRecord.type !== 'login') {
    return NextResponse.json(
      { error: '로그인 시도가 유효하지 않거나 이미 사용되었습니다.' },
      { status: 400 },
    );
  }

  const db = await getDB();
  await db.read();

  // 삭제된 패스키로 로그인을 시도하면 여기서 못 찾아서 자동으로 거절된다.
  const passkey = db.data.passkeys.find((p) => p.id === body.response.id);
  if (!passkey) {
    return NextResponse.json({ error: '등록되지 않았거나 삭제된 패스키입니다.' }, { status: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64')),
        counter: passkey.counter,
        transports: passkey.transports as any,
      },
    });
  } catch {
    return NextResponse.json({ error: '패스키 인증에 실패했습니다.' }, { status: 401 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: '패스키 인증에 실패했습니다.' }, { status: 401 });
  }

  // 서명 카운터를 갱신해서 복제된 인증장치 사용을 감지할 수 있게 한다.
  passkey.counter = verification.authenticationInfo.newCounter;
  await db.write();

  const res = NextResponse.json({ ok: true });
  clearPendingAttemptCookie(res);
  await createSession(passkey.userId, res);
  return res;
}
