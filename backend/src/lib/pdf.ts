import { PDFDocument } from 'pdf-lib';

/**
 * Counts pages in a PDF.
 * Returns null when the file cannot be parsed, so the caller can decide
 * whether to allow it through rather than rejecting a valid upload.
 */
export async function countPdfPages(buffer: Buffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return doc.getPageCount();
  } catch (err) {
    console.warn('Could not read PDF page count:', (err as Error)?.message);
    return null;
  }
}
