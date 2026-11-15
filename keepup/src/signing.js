// Signed envelopes. Everything our server hands a client is a string and an Ed25519 signature over exactly those bytes,
// so a breach of the site or its database can't put words into a customer's session. The private key lives only in CI;
// the client carries the public keys and checks every envelope when it arrives and again each time it reads its cache.
// The payload stays a string, never a re-serialised object: signing JSON needs one byte order, and a string has one.
import { createPrivateKey, createPublicKey, generateKeyPairSync,                 sign, verify } from 'node:crypto';

                           
                           
                                                                                
                       
                                                                                               
                       
 

/** Key id to public key, as base64 of its SPKI DER form. */
                                                           

export class SignatureError extends Error {
  constructor(message        ) {
    super(message);
    this.name = 'SignatureError';
  }
}

const SIGNATURE_BYTES = 64;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function publicKeyFrom(base64        )            {
  try {
    return createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
  } catch {
    throw new SignatureError('A trusted key in this client is not a public key.');
  }
}

function privateKeyFrom(base64        )            {
  try {
    return createPrivateKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'pkcs8' });
  } catch {
    throw new Error('The signing key is not an Ed25519 private key in base64 PKCS8 form.');
  }
}

/** A new Ed25519 pair as base64 text: the public half goes in the client, the private half in a CI secret and nowhere else. */
export function generateKeyPair()                                                              {
  const pair = generateKeyPairSync('ed25519');
  return {
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

export function signPayload(payload        , privateKeyBase64        , kid        )           {
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKeyFrom(privateKeyBase64));
  return { payload, sig: signature.toString('base64'), kid };
}

function asEnvelope(value         )           {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SignatureError('Not a signed record.');
  const { payload, sig, kid } = value                           ;
  if (typeof payload !== 'string' || typeof sig !== 'string' || typeof kid !== 'string') throw new SignatureError('A signed record is missing its payload, signature or key id.');
  return { payload, sig, kid };
}

/** The payload, once its signature holds under a key this client trusts. Throws SignatureError otherwise, and says nothing of the payload. */
export function verifyEnvelope(value         , keys             )         {
  const envelope = asEnvelope(value);
  if (!Object.hasOwn(keys, envelope.kid)) throw new SignatureError(`Signed with a key this client doesn't trust (${envelope.kid.slice(0, 20)}).`);
  if (!BASE64.test(envelope.sig)) throw new SignatureError('The signature is not base64.');
  const signature = Buffer.from(envelope.sig, 'base64');
  if (signature.length !== SIGNATURE_BYTES) throw new SignatureError('The signature has the wrong length.');
  if (!verify(null, Buffer.from(envelope.payload, 'utf8'), publicKeyFrom(keys[envelope.kid]), signature)) {
    throw new SignatureError('The signature does not match the record.');
  }
  return envelope.payload;
}

/** Verify, then parse. `kind` is inside the signed bytes, so a signed pack can't be passed off as a lever. */
export function openEnvelope   (value         , keys             , kind        )    {
  const payload = verifyEnvelope(value, keys);
  let parsed         ;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new SignatureError('A signed record is not JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new SignatureError('A signed record is not a JSON object.');
  if ((parsed                      ).kind !== kind) throw new SignatureError(`Expected a signed ${kind}, and this is something else.`);
  return parsed     ;
}
