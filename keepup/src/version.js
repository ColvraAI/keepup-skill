// One place for the client's version and the record shape it understands. The server only ever adds fields within a
// shape, and a client ignores fields it doesn't know, so this number moves only when an old client would misread a record.
export const CLIENT_VERSION = '0.2.0';
export const RECORD_SHAPE = 1;
