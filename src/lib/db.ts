import path from 'node:path';
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

const dataDir = path.join(process.cwd(), 'data');
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
