import { createVerify, X509Certificate, type BinaryLike, type KeyLike } from 'node:crypto';
import { SignedXml, type ErrorFirstCallback, type SignatureAlgorithm } from 'xml-crypto';
import {
  assinarRsaSha256,
  getIcpBrasilCertificatePem,
  type IcpBrasilCertificate,
} from '../../security/icpBrasilSigner.js';

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

export interface EsocialXmlSigningProvider {
  certificatePem(): Promise<string>;
  signRsaSha256(payload: Buffer): Promise<Buffer>;
  certificateValidation?: 'required' | 'skip-for-test';
}

function certificateBody(pem: string): string {
  const body = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
  if (!body) throw new Error('Certificado publico vazio para assinatura XML eSocial.');
  return body;
}

function externalAlgorithm(provider: EsocialXmlSigningProvider): new () => SignatureAlgorithm {
  return class ExternalRsaSha256 implements SignatureAlgorithm {
    getSignature(signedInfo: BinaryLike, _privateKey: KeyLike): string;
    getSignature(signedInfo: BinaryLike, _privateKey: KeyLike, callback: ErrorFirstCallback<string>): void;
    getSignature(signedInfo: BinaryLike, _privateKey: KeyLike, callback?: ErrorFirstCallback<string>): string | void {
      if (!callback) throw new Error('O provedor RSA ICP-Brasil exige assinatura assincrona.');
      const bytes = typeof signedInfo === 'string'
        ? Buffer.from(signedInfo, 'utf8')
        : Buffer.isBuffer(signedInfo)
          ? signedInfo
          : ArrayBuffer.isView(signedInfo)
            ? Buffer.from(signedInfo.buffer, signedInfo.byteOffset, signedInfo.byteLength)
            : Buffer.from(new Uint8Array(signedInfo));
      provider.signRsaSha256(bytes)
        .then((signature) => callback(null, signature.toString('base64')))
        .catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
    }

    verifySignature(material: string, key: KeyLike, signatureValue: string): boolean;
    verifySignature(material: string, key: KeyLike, signatureValue: string, callback: ErrorFirstCallback<boolean>): void;
    verifySignature(material: string, key: KeyLike, signatureValue: string, callback?: ErrorFirstCallback<boolean>): boolean | void {
      const verifier = createVerify('RSA-SHA256');
      verifier.update(material);
      const valid = verifier.verify(key, signatureValue, 'base64');
      if (callback) { callback(null, valid); return; }
      return valid;
    }

    getAlgorithmName(): string { return RSA_SHA256; }
  };
}

export function icpBrasilXmlSigningProvider(certificate?: IcpBrasilCertificate): EsocialXmlSigningProvider {
  return {
    certificatePem: () => getIcpBrasilCertificatePem(certificate),
    signRsaSha256: (payload) => assinarRsaSha256(payload, certificate),
    certificateValidation: 'required',
  };
}

/**
 * XMLDSig enveloped exigido pelo Manual do Desenvolvedor eSocial v1.15:
 * RSA-SHA256, digest SHA-256, C14N 1.0 e apenas X509Certificate em KeyInfo.
 */
export async function signEsocialXml(
  unsignedXml: string,
  provider: EsocialXmlSigningProvider = icpBrasilXmlSigningProvider(),
): Promise<string> {
  const certificatePem = await provider.certificatePem();
  if (provider.certificateValidation !== 'skip-for-test') {
    let type: string | undefined;
    try { type = new X509Certificate(certificatePem).publicKey.asymmetricKeyType; }
    catch { throw new Error('Certificado X.509 invalido para assinatura eSocial.'); }
    if (type !== 'rsa') {
      throw new Error('O eSocial exige certificado com chave RSA para XMLDSig RSA-SHA256.');
    }
  }
  const signer = new SignedXml({
    privateKey: Buffer.from('external-icp-brasil-key'),
    publicCert: certificatePem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certificateBody(certificatePem)}</X509Certificate></X509Data>`,
  });
  signer.SignatureAlgorithms[RSA_SHA256] = externalAlgorithm(provider);
  signer.addReference({
    xpath: "/*[local-name()='eSocial']",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA256,
    uri: '',
    isEmptyUri: true,
  });
  await new Promise<void>((resolve, reject) => {
    signer.computeSignature(unsignedXml, {
      prefix: '',
      location: { reference: "/*[local-name()='eSocial']/*[1]", action: 'after' },
    }, (error) => error ? reject(error) : resolve());
  });
  return signer.getSignedXml();
}
