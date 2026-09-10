import { NextRequest, NextResponse } from 'next/server';
import { checkCSRF, destroySession, getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (!checkCSRF(req, session.csrfToken)) {
    return NextResponse.json({ error: 'CSRF 토큰이 유효하지 않습니다.' }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  await destroySession(req, res);
  return res;
}
