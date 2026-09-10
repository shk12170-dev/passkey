import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getDB } from '@/lib/db';
import { getSession, setPendingAttemptCookie } from '@/lib/session';
import { createChallenge } from '@/lib/challenge';
import { rpID, rpName } from '@/lib/webauthn';

export async function POST(req: NextRequest) {
  const db = await getDB();
  await db.read();

  const session = await getSession(req);

  let userId: string;
  let userName: string;

  if (session) {
    // 로그인한 상태 -> 같은 계정에 패스키를 "추가 등록"하는 경우
    const user = db.data.users.find((u) => u.id === session.userId);
    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 401 });
    }
    userId = user.id;
    userName = user.displayName;
  } else {
    // 로그인 전 -> 새 계정을 합성 이름으로 만드는 경우
    const body = await req.json().catch(() => ({}));
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName || displayName.length > 40) {
      return NextResponse.json({ error: '이름을 1~40자 사이로 입력해주세요.' }, { status: 400 });
    }
    userId = nanoid(16);
    userName = displayName;
    db.data.users.push({ id: userId, displayName, createdAt: new Date().toISOString() });
    await db.write();
  }

  const existingCredentials = db.data.passkeys.filter((p) => p.userId === userId);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName,
    userDisplayName: userName,
    userID: new TextEncoder().encode(userId),
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.id,
      transports: c.transports as any,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  const challengeRecord = await createChallenge('register', options.challenge, userId);

  const res = NextResponse.json({ options });
  setPendingAttemptCookie(res, challengeRecord.id);
  return res;
}
