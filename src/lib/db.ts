import path from 'node:path';
import fs from 'node:fs';
import { JSONFilePreset } from 'lowdb/node';
import { get, put, BlobNotFoundError } from '@vercel/blob';

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
  // 신규(비로그인) 등록 시 계정 레코드는 등록이 실제로 성공할 때까지 만들지 않는다.
  // 그 전까지는 이름만 challenge에 잠깐 들고 있는다.
  pendingDisplayName?: string;
  challenge: string;
  createdAt: string;
};

type DBSchema = {
  users: UserRecord[];
  passkeys: PasskeyRecord[];
  sessions: SessionRecord[];
  challenges: ChallengeRecord[];
};

function emptyData(): DBSchema {
  return { users: [], passkeys: [], sessions: [], challenges: [] };
}

export interface DB {
  data: DBSchema;
  read(): Promise<void>;
  write(): Promise<void>;
}

// Vercel(서버리스) 환경은 배포된 코드 디렉터리가 읽기 전용이라 로컬 파일에 쓸 수 없다.
// 그곳에서는 Vercel Blob(별도로 만든 영구 저장소)을 대신 사용해서
// 재배포/재시작과 무관하게 데이터가 계속 유지되게 한다.
const BLOB_PATHNAME = 't08-passkey-db.json';
const useBlob = Boolean(process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN);

class BlobDB implements DB {
  data: DBSchema = emptyData();

  async read() {
    try {
      const result = await get(BLOB_PATHNAME, { access: 'private', useCache: false });
      if (result?.statusCode === 200) {
        const text = await new Response(result.stream).text();
        this.data = JSON.parse(text) as DBSchema;
      }
    } catch (err) {
      if (err instanceof BlobNotFoundError) {
        this.data = emptyData();
      } else {
        throw err;
      }
    }
  }

  async write() {
    await put(BLOB_PATHNAME, JSON.stringify(this.data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
  }
}

let blobInstance: BlobDB | null = null;
let filePromise: ReturnType<typeof JSONFilePreset<DBSchema>> | null = null;

export async function getDB(): Promise<DB> {
  if (useBlob) {
    if (!blobInstance) {
      blobInstance = new BlobDB();
      await blobInstance.read();
    }
    // 서버리스 인스턴스마다 메모리가 분리되어 있으므로 매번 최신 상태로 새로고침한다.
    await blobInstance.read();
    return blobInstance;
  }

  if (!filePromise) {
    const dataDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    filePromise = JSONFilePreset<DBSchema>(path.join(dataDir, 'db.json'), emptyData());
  }
  return filePromise;
}
