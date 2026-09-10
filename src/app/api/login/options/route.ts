import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createChallenge } from '@/lib/challenge';
import { setPendingAttemptCookie } from '@/lib/session';
import { rpID } from '@/lib/webauthn';

export async function POST() {
  // allowCredentials를 비워두면 브라우저가 이 기기에 저장된 패스키 중에서
  // 사용자가 직접 고르게 한다 (아이디 입력 없는 "디스커버러블" 로그인 방식).
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
  });

  const challengeRecord = await createChallenge('login', options.challenge);

  const res = NextResponse.json({ options });
  setPendingAttemptCookie(res, challengeRecord.id);
  return res;
}
