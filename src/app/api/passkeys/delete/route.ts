import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { checkCSRF, getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (!checkCSRF(req, session.csrfToken)) {
    return NextResponse.json({ error: 'CSRF 토큰이 유효하지 않습니다.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const credentialId = body?.credentialId;
  if (typeof credentialId !== 'string') {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const db = await getDB();
  await db.read();

  // 반드시 "현재 로그인한 사용자 소유"의 패스키 목록 안에서만 찾는다.
  // -> 다른 계정의 credentialId를 넣어도 지울 수 없다.
  const userPasskeys = db.data.passkeys.filter((p) => p.userId === session.userId);
  const target = userPasskeys.find((p) => p.id === credentialId);
  if (!target) {
    return NextResponse.json({ error: '패스키를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (userPasskeys.length <= 1) {
    return NextResponse.json(
      { error: '마지막 남은 패스키는 삭제할 수 없습니다.' },
      { status: 400 },
    );
  }

  db.data.passkeys = db.data.passkeys.filter((p) => p.id !== credentialId);
  await db.write();

  return NextResponse.json({ ok: true });
}
