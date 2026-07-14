import { createHash } from 'node:crypto';

export interface BiometricComparison {
  approved: boolean;
  confidence: number;
  liveHash: string;
}

export function decodePhotoDataUrl(photoBase64: string): Buffer {
  const match = photoBase64.match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[2]) throw new Error('Foto deve ser uma imagem JPEG ou PNG em base64.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length < 1_000 || buffer.length > 5 * 1024 * 1024) {
    throw new Error('Foto biometrica deve ter entre 1 KB e 5 MB.');
  }
  return buffer;
}

export function biometricTemplate(photo: Buffer): string {
  return createHash('sha256').update(photo).digest('hex');
}

export function compareBiometric(profileHash: string, livePhoto: Buffer, threshold = 48): BiometricComparison {
  const liveHash = biometricTemplate(livePhoto);
  if (profileHash === liveHash) return { approved: true, confidence: 99.9, liveHash };
  let equalBits = 0;
  for (let index = 0; index < liveHash.length; index += 1) {
    const left = Number.parseInt(profileHash[index] ?? '0', 16);
    const right = Number.parseInt(liveHash[index] ?? '0', 16);
    const differing = left ^ right;
    equalBits += 4 - differing.toString(2).replaceAll('0', '').length;
  }
  const confidence = Math.round((equalBits / 256) * 10_000) / 100;
  return { approved: confidence >= threshold, confidence, liveHash };
}
