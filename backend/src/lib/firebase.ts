import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from '../config';

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId,
    storageBucket: config.storageBucket,
  });
}

export const auth = getAuth();
export const db = getFirestore();
export const bucket = getStorage().bucket();
