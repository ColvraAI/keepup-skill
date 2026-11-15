// A lever as our server serves it: the lever file inside a small signed wrapper. `rev` names this exact version of the
// record, so the usage log can say which version an account was served and a client can tell a changed record from the
// one that was signed. The worker builds payloads with leverPayload; the client reads them back with parseLeverPayload.
import { createHash } from 'node:crypto';
                                         
import {                   verifyEnvelope } from './signing.js';
import { RECORD_SHAPE } from './version.js';

                               
                         
                         
                      
                                                                              
                       
                           
                         
 

export class LeverPayloadError extends Error {
  constructor(message        ) {
    super(message);
    this.name = 'LeverPayloadError';
  }
}

const LEVER_ID = /^ADV-[A-Za-z0-9._-]{1,120}$/;
const PATTERN_ID = /^PAT-[a-z0-9-]{1,60}$/;
const REV = /^[0-9a-f]{12}$/;
/** What the engine reads from every lever without checking first. A record without one of these would break a brief. */
const REQUIRED_TEXT = ['id', 'name', 'pattern', 'kind', 'gain', 'proof', 'source', 'how']         ;

export function leverRev(record        )         {
  return createHash('sha256').update(JSON.stringify(record), 'utf8').digest('hex').slice(0, 12);
}

function isObject(value         )                                   {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkedRecord(value         )        {
  if (!isObject(value)) throw new LeverPayloadError('A served lever has no record.');
  const missing = REQUIRED_TEXT.filter((field) => typeof value[field] !== 'string');
  if (missing.length) throw new LeverPayloadError(`A lever record is missing ${missing.join(', ')}.`);
  if (!Array.isArray(value.effects) || !value.effects.every((effect) => typeof effect === 'string')) throw new LeverPayloadError('A lever record has no list of effects.');
  if (!LEVER_ID.test(value.id          )) throw new LeverPayloadError('A lever record has an id keepup does not accept.');
  if (!PATTERN_ID.test(value.pattern          )) throw new LeverPayloadError(`Lever ${String(value.id)} names a pattern keepup does not accept.`);
  return value                    ;
}

/** The exact string that gets signed. The key order is fixed, so the same lever always gives the same bytes. */
export function leverPayload(lever       )         {
  const record = checkedRecord(lever);
  return JSON.stringify({ kind: 'lever', shape: RECORD_SHAPE, id: record.id, rev: leverRev(record), pattern: record.pattern, record });
}

/** Reads a payload whose signature already held. Unknown top-level fields are ignored; everything it relies on is checked. */
export function parseLeverPayload(payload        )               {
  let raw         ;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw new LeverPayloadError('A served lever is not JSON.');
  }
  if (!isObject(raw)) throw new LeverPayloadError('A served lever is not a JSON object.');
  if (raw.kind !== 'lever') throw new LeverPayloadError('This record is not a lever.');
  if (raw.shape !== RECORD_SHAPE) throw new LeverPayloadError(`This lever has shape ${String(raw.shape)}, and this client reads shape ${RECORD_SHAPE}. Update keepup.`);
  if (typeof raw.id !== 'string' || !LEVER_ID.test(raw.id)) throw new LeverPayloadError('A served lever has no id keepup accepts.');
  if (typeof raw.rev !== 'string' || !REV.test(raw.rev)) throw new LeverPayloadError(`Lever ${raw.id} has no version.`);
  if (typeof raw.pattern !== 'string' || !PATTERN_ID.test(raw.pattern)) throw new LeverPayloadError(`Lever ${raw.id} has no pattern keepup accepts.`);
  const record = checkedRecord(raw.record);
  if (record.id !== raw.id || record.pattern !== raw.pattern) throw new LeverPayloadError(`Lever ${raw.id}'s record names another id or pattern.`);
  if (leverRev(record) !== raw.rev) throw new LeverPayloadError(`Lever ${raw.id}'s record is not the version that was signed.`);
  return { kind: 'lever', shape: RECORD_SHAPE, id: raw.id, rev: raw.rev, pattern: raw.pattern, record };
}

/** Verify, then read. Throws SignatureError or LeverPayloadError, and says nothing of the record's text. */
export function openLeverEnvelope(value         , keys             )               {
  return parseLeverPayload(verifyEnvelope(value, keys));
}
