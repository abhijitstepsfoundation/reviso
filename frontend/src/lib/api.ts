import { auth } from './firebase';

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');
  return user.getIdToken();
}

/**
 * Every API call carries a fresh Firebase ID token.
 * The backend derives the user identity from that token alone.
 */
export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Reads a File into a base64 string, without the data: prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/** Uploads a file as base64 JSON, so the server needs no multipart parser. */
export async function apiUpload<T = any>(path: string, file: File): Promise<T> {
  const data = await toBase64(file);

  return api<T>(path, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      data,
    }),
  });
}
