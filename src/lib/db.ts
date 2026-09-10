import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { JSONFilePreset } from 'lowdb/node';

export type UserRecord = {
  id: string;
  displayName: string;
  createdAt: string;
};

export type PasskeyRecord = {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  deviceName: string;
  transports?: string[];
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  csrfToken: string;
  createdAt: string;
};

export type ChallengeRecord = {
  id: string;
  type: 'register' | 'login';
  userId?: string;
  challenge: string;
  createdAt: string;
};

type DBSchema = {
  users: UserRecord[];
  passkeys: PasskeyRecord[];
  sessions: SessionRecord[];
  challenges: ChallengeRecord[];
};

// Vercel(서버리스) 환경은 배포된 코드 디렉터리가 읽기 전용이라
// process.cwd() 밑에는 쓸 수 없다. 그런 환경에서는 쓰기 가능한 /tmp 를 대신 사용한다.
// (다만 /tmp도 임시 저장소라 인스턴스가 재시작되면 데이터가 초기화될 수 있다.)
const dataDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 't08-passkey-data')
  : path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'db.json');

let dbPromise: ReturnType<typeof JSONFilePreset<DBSchema>> | null = null;

export function getDB() {
  if (!dbPromise) {
    fs.mkdirSync(dataDir, { recursive: true });
    dbPromise = JSONFilePreset<DBSchema>(dbFile, {
      users: [],
      passkeys: [],
      sessions: [],
      challenges: [],
    });
  }
  return dbPromise;
}
