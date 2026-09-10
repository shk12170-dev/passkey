import { nanoid } from 'nanoid';
import type { NextRequest, NextResponse } from 'next/server';
import { getDB } from './db';

const SESSION_COOKIE = 'session_id';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

export async function createSession(userId: string, res: NextResponse) {
  const db = await getDB();
  const session = {
    id: nanoid(32),
    userId,
    csrfToken: nanoid(32),
    createdAt: new Date().toISOString(),
  };
  db.data.sessions.push(session);
  await db.write();

  res.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return session;
}

export async function getSession(req: NextRequest) {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = await getDB();
  await db.read();
  return db.data.sessions.find((s) => s.id === sessionId) ?? null;
}

// 서버에 저장된 세션 자체를 지운다. 쿠키만 지우는 로그아웃과 달리
// 예전 쿠키 값을 다시 보내도 더 이상 통하지 않는다.
export async function destroySession(req: NextRequest, res: NextResponse) {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const db = await getDB();
    await db.read();
    db.data.sessions = db.data.sessions.filter((s) => s.id !== sessionId);
    await db.write();
  }
  res.cookies.delete(SESSION_COOKIE);
}

export function checkCSRF(req: NextRequest, expectedToken: string) {
  return req.headers.get('x-csrf-token') === expectedToken;
}

export const PENDING_ATTEMPT_COOKIE = 'pending_attempt';

export function setPendingAttemptCookie(res: NextResponse, challengeId: string) {
  res.cookies.set(PENDING_ATTEMPT_COOKIE, challengeId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 5 * 60,
  });
}

export function clearPendingAttemptCookie(res: NextResponse) {
  res.cookies.delete(PENDING_ATTEMPT_COOKIE);
}
