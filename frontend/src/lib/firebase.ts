import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// These values are public by design. Firebase security comes from
// Firestore/Storage rules and from backend ID-token verification,
// never from hiding this config.
const firebaseConfig = {
  apiKey: 'AIzaSyD_hS8jJY1LROZqfyn1ecv7re1zXu-fjF0',
  authDomain: 'gen-ai-academy-apac-506308.firebaseapp.com',
  projectId: 'gen-ai-academy-apac-506308',
  storageBucket: 'gen-ai-academy-apac-506308.firebasestorage.app',
  messagingSenderId: '903171002994',
  appId: '1:903171002994:web:6ec6786fd278e368eee8eb',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
