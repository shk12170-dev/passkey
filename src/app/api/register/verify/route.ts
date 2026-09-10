import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getDB } from '@/lib/db';
import { consumeChallenge } from '@/lib/challenge';
import { createSession, PENDING_ATTEMPT_COOKIE, clearPendingAttemptCookie } from '@/lib/session';
import { origin, rpID } from '@/lib/webauthn';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.response) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const pendingId = req.cookies.get(PENDING_ATTEMPT_COOKIE)?.value;
  if (!pendingId) {
    return NextResponse.json({ error: '등록 시도가 만료되었습니다. 다시 시도해주세요.' }, { status: 400 });
  }

  const challengeRecord = await consumeChallenge(pendingId);
  if (!challengeRecord || challengeRecord.type !== 'register' || !challengeRecord.userId) {
    return NextResponse.json(
      { error: '등록 시도가 유효하지 않거나 이미 사용되었습니다.' },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch {
    return NextResponse.json({ error: '패스키 등록 검증에 실패했습니다.' }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: '패스키 등록 검증에 실패했습니다.' }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const deviceName =
    typeof body.deviceName === 'string' && body.deviceName.trim()
      ? body.deviceName.trim().slice(0, 40)
      : '이름 없는 패스키';

  const db = await getDB();
  await db.read();
  db.data.passkeys.push({
    id: credential.id,
    userId: challengeRecord.userId,
    publicKey: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    deviceName,
    transports: credential.transports,
    createdAt: new Date().toISOString(),
  });
  await db.write();

  const res = NextResponse.json({ ok: true });
  clearPendingAttemptCookie(res);
  await createSession(challengeRecord.userId, res);
  return res;
}
