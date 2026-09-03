export const config = {
  port: Number(process.env.PORT || 8080),
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-ai-academy-apac-506308',
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    'gen-ai-academy-apac-506308.firebasestorage.app',
  geminiSecretName: process.env.GEMINI_SECRET_NAME || 'GEMINI_API_KEY',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  isProduction: process.env.NODE_ENV === 'production',
};
