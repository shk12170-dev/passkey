import { nanoid } from 'nanoid';
import { getDB, type ChallengeRecord } from './db';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function createChallenge(
  type: ChallengeRecord['type'],
  challenge: string,
  userId?: string,
  pendingDisplayName?: string,
) {
  const db = await getDB();
  const record: ChallengeRecord = {
    id: nanoid(24),
    type,
    userId,
    pendingDisplayName,
    challenge,
    createdAt: new Date().toISOString(),
  };
  db.data.challenges.push(record);
  await db.write();
  return record;
}

// Challenge는 한 번 쓰면 즉시 지운다 (challenge 재사용 공격 방지).
export async function consumeChallenge(id: string) {
  const db = await getDB();
  await db.read();
  const index = db.data.challenges.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const [record] = db.data.challenges.splice(index, 1);
  await db.write();

  const age = Date.now() - new Date(record.createdAt).getTime();
  if (age > CHALLENGE_TTL_MS) return null;

  return record;
}
