import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getSyntheticPrivateItems } from '@/lib/privateData';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = await getDB();
  await db.read();

  const user = db.data.users.find((u) => u.id === session.userId);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const passkeys = db.data.passkeys
    .filter((p) => p.userId === user.id)
    .map((p) => ({ id: p.id, deviceName: p.deviceName, createdAt: p.createdAt }));

  return NextResponse.json({
    displayName: user.displayName,
    csrfToken: session.csrfToken,
    passkeys,
    privateItems: getSyntheticPrivateItems(user.displayName),
  });
}
