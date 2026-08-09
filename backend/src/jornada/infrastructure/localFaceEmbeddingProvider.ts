import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { FACIAL_EMBEDDING_DIMENSIONS, FACIAL_TEMPLATE_VERSION } from '../domain/biometric.ts';

const DEFAULT_MATCH_THRESHOLD = 0.82;
const MAX_IMAGE_SIDE = 4_096;
const MAX_IMAGE_PIXELS = 16_000_000;
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type FacialErrorCode = 'FACIAL_PROVIDER_UNAVAILABLE' | 'FACIAL_IMAGE_INVALID' | 'FACIAL_FACE_NOT_FOUND' | 'FACIAL_MULTIPLE_FACES';

export class FacialRecognitionError extends Error {
  constructor(message: string, readonly code: FacialErrorCode) {
    super(message);
    this.name = 'FacialRecognitionError';
  }
}

interface HumanResult {
  face: Array<{ embedding?: number[] }>;
}

interface HumanInstance {
  tf: {
    ready(): Promise<void>;
    tensor3d(values: Uint8Array, shape: [number, number, number], dtype: 'int32'): unknown;
    dispose(tensor: unknown): void;
  };
  load(): Promise<unknown>;
  detect(tensor: unknown): Promise<HumanResult>;
}

interface HumanConstructor {
  new(config: Record<string, unknown>): HumanInstance;
}

interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const nodeRequire = createRequire(import.meta.url);
const humanEntry = nodeRequire.resolve('@vladmandic/human');
const humanDirectory = path.dirname(humanEntry);
const modelDirectoryUrl = pathToFileURL(path.resolve(humanDirectory, '..', 'models')).href.replace(/\/$/, '/') + '/';
const humanWasmUrl = pathToFileURL(path.join(humanDirectory, 'human.node-wasm.js')).href;
let humanPromise: Promise<HumanInstance> | undefined;
let localModelFetchInstalled = false;
let pendingInference = Promise.resolve();

async function serializeInference<T>(work: () => Promise<T>): Promise<T> {
  const previous = pendingInference;
  let release: () => void = () => {};
  pendingInference = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await work(); }
  finally { release(); }
}

function requestedUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function installLocalModelFetch(): void {
  if (localModelFetchInstalled) return;
  const platformFetch = globalThis.fetch;
  if (!platformFetch) throw new FacialRecognitionError('Runtime sem suporte ao carregamento local dos modelos faciais.', 'FACIAL_PROVIDER_UNAVAILABLE');
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestedUrl(input);
    if (url.protocol === 'file:' && url.href.startsWith(modelDirectoryUrl)) {
      try {
        return new Response(await readFile(fileURLToPath(url)), { status: 200 });
      } catch {
        return new Response(null, { status: 404 });
      }
    }
    return platformFetch(input, init);
  };
  localModelFetchInstalled = true;
}

async function localHuman(): Promise<HumanInstance> {
  if (!humanPromise) {
    humanPromise = (async () => {
      installLocalModelFetch();
      const loaded = await import(humanWasmUrl) as { Human?: HumanConstructor };
      if (!loaded.Human) throw new FacialRecognitionError('Biblioteca de reconhecimento facial indisponivel.', 'FACIAL_PROVIDER_UNAVAILABLE');
      const human = new loaded.Human({
        backend: 'wasm', modelBasePath: modelDirectoryUrl, async: false,
        filter: { enabled: false },
        face: {
          enabled: true,
          detector: { enabled: true, rotation: false, maxDetected: 2, minConfidence: 0.2 },
          mesh: { enabled: false }, iris: { enabled: false },
          description: { enabled: true, minConfidence: 0.1 },
          emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false },
        },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
      });
      await human.tf.ready();
      await human.load();
      return human;
    })().catch((error: unknown) => {
      humanPromise = undefined;
      if (error instanceof FacialRecognitionError) throw error;
      throw new FacialRecognitionError('Provedor local de reconhecimento facial indisponivel.', 'FACIAL_PROVIDER_UNAVAILABLE');
    });
  }
  return humanPromise;
}

function enabledLocalProvider(): void {
  const configured = String(process.env.FACIAL_MATCH_PROVIDER ?? '').trim().toLowerCase();
  if (configured !== 'local') {
    throw new FacialRecognitionError(
      configured
        ? `Provedor facial \"${configured}\" nao esta disponivel nesta implantacao.`
        : 'FACIAL_MATCH_PROVIDER=local deve ser configurado para habilitar o reconhecimento facial.',
      'FACIAL_PROVIDER_UNAVAILABLE',
    );
  }
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 80 || height < 80
      || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new FacialRecognitionError('Resolucao da foto biometrica invalida.', 'FACIAL_IMAGE_INVALID');
  }
}

function decodeImage(photo: Buffer): DecodedImage {
  try {
    if (photo.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      const decoded = PNG.sync.read(photo);
      validateDimensions(decoded.width, decoded.height);
      return { width: decoded.width, height: decoded.height, rgba: decoded.data };
    }
    if (photo.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
      const decoded = decodeJpeg(photo, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 128 });
      validateDimensions(decoded.width, decoded.height);
      return { width: decoded.width, height: decoded.height, rgba: decoded.data };
    }
  } catch {
    throw new FacialRecognitionError('Nao foi possivel decodificar a foto biometrica.', 'FACIAL_IMAGE_INVALID');
  }
  throw new FacialRecognitionError('Formato de foto biometrica invalido.', 'FACIAL_IMAGE_INVALID');
}

function rgbPixels(image: DecodedImage): Uint8Array {
  const rgb = new Uint8Array(image.width * image.height * 3);
  for (let source = 0, target = 0; source < image.rgba.length; source += 4) {
    rgb[target++] = image.rgba[source] ?? 0;
    rgb[target++] = image.rgba[source + 1] ?? 0;
    rgb[target++] = image.rgba[source + 2] ?? 0;
  }
  return rgb;
}

export function facialMatchThreshold(): number {
  const configured = String(process.env.FACIAL_MATCH_THRESHOLD ?? '').trim();
  if (!configured) return DEFAULT_MATCH_THRESHOLD;
  const threshold = Number(configured);
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold >= 1) {
    throw new FacialRecognitionError('FACIAL_MATCH_THRESHOLD deve estar entre 0.50 e 0.99.', 'FACIAL_PROVIDER_UNAVAILABLE');
  }
  return threshold;
}

export async function generateFacialEmbedding(photo: Buffer): Promise<number[]> {
  enabledLocalProvider();
  const image = decodeImage(photo);
  const human = await localHuman();
  const tensor = human.tf.tensor3d(rgbPixels(image), [image.height, image.width, 3], 'int32');
  try {
    return await serializeInference(async () => {
      const result = await human.detect(tensor);
      if (result.face.length === 0) throw new FacialRecognitionError('Nenhum rosto foi encontrado na foto biometrica.', 'FACIAL_FACE_NOT_FOUND');
      if (result.face.length !== 1) throw new FacialRecognitionError('A foto biometrica deve conter exatamente um rosto.', 'FACIAL_MULTIPLE_FACES');
      const embedding = result.face[0]?.embedding;
      if (!embedding || embedding.length !== FACIAL_EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite)) {
        throw new FacialRecognitionError('Nao foi possivel gerar o template facial.', 'FACIAL_PROVIDER_UNAVAILABLE');
      }
      return embedding;
    });
  } catch (error) {
    if (error instanceof FacialRecognitionError) throw error;
    throw new FacialRecognitionError('Provedor local de reconhecimento facial indisponivel.', 'FACIAL_PROVIDER_UNAVAILABLE');
  } finally {
    human.tf.dispose(tensor);
  }
}

export const facialAlgorithm = FACIAL_TEMPLATE_VERSION;
