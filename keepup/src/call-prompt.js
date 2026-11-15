// The prompt a model call really passes, read as text and never run: the call at a place, the argument it gives, and that
// argument followed back to its text. Never the nearest string, so a docstring, a debug line or code can't be mistaken for it.
// Token counts come from it, labelled as an estimate, and `keepup measure` sends it. What only exists at runtime is said to.
const CHARS_PER_TOKEN = 4;
const MIN_LITERAL = 40;
const PLACEHOLDER = /\{[a-zA-Z_][\w]*\}/g;
const NOT_PROSE = /^(?:https?:|[\w./-]+$|<\/?\w)/;
const CALL = /(?:\.messages\.(?:create|stream|parse)|\.chat\.completions\.(?:create|parse)|\.responses\.(?:create|parse)|\.completions\.create|\bgenerateText|\bstreamText|\bgenerateObject|\bstreamObject|\bgenerate_content|\bgenerateContent|\bacompletion|\blitellm\.completion|\.chat)\s*\(/g;
const COMMENT_LINE = /^\s*(?:#|\/\/|\*|\/\*)/;
const STRING_START = /^([rRbBuUfF]{0,2})(?=["'`])/;
const PATH = /^(?:this\.|self\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const SYSTEM_ARGS = ['system', 'system_instruction', 'systemInstruction', 'instructions'];
const PROMPT_ARGS = ['prompt', 'input', 'contents'];
const OPENERS = '([{';
const CLOSERS = ')]}';
const MAX_DEPTH = 6;
const SHOWN_CHARS = 60;

                                
                        
                        
                         
                                                                              
                                           
                                                                              
                            
                                                          
                         
 

                            
                                        
                        
                           
                        
 

                               
                                        
                                                       
                          
                                  
 

export function estimateTokens(text        )         {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const lineAt = (text        , index        ) => text.slice(0, index).split('\n').length;

/** The index just past a string that starts at `start`. */
function pastString(text        , start        )         {
  const quote = text[start];
  const triple = (quote === '"' || quote === "'") && text.startsWith(quote.repeat(3), start);
  const close = triple ? quote.repeat(3) : quote;
  for (let at = start + close.length; at < text.length; at += 1) {
    if (text[at] === '\\') { at += 1; continue; }
    if (text.startsWith(close, at)) return at + close.length;
    if (!triple && quote !== '`' && text[at] === '\n') return at;
  }
  return text.length;
}

function pastComment(text        , at        )         {
  const end = text.indexOf('\n', at);
  return end === -1 ? text.length : end;
}

/** Walks code from `start`, skipping strings and comments, and stops where `stop` says, at any depth it asks about. */
function walk(text        , start        , stop                                        )         {
  let depth = 0;
  for (let at = start; at < text.length; at += 1) {
    const char = text[at];
    if (char === '"' || char === "'" || char === '`') { at = pastString(text, at) - 1; continue; }
    if (char === '#' || text.startsWith('//', at)) { at = pastComment(text, at) - 1; continue; }
    if (stop(at, depth)) return at;
    if (OPENERS.includes(char)) depth += 1;
    else if (CLOSERS.includes(char)) depth -= 1;
  }
  return text.length;
}

function closeOf(text        , open        )         {
  return walk(text, open + 1, (at, depth) => depth === 0 && CLOSERS.includes(text[at]));
}

function splitTop(text        , separator        )           {
  const parts           = [];
  let from = 0;
  walk(text, 0, (at, depth) => {
    if (depth === 0 && text[at] === separator) { parts.push(text.slice(from, at)); from = at + 1; }
    return false;
  });
  return [...parts, text.slice(from)].map((part) => part.trim()).filter(Boolean);
}

function callsIn(text        )              {
  return [...text.matchAll(CALL)].flatMap((match) => {
    const line = lineAt(text, match.index);
    if (COMMENT_LINE.test(text.split('\n')[line - 1] ?? '')) return [];
    const open = match.index + match[0].length - 1;
    const close = closeOf(text, open);
    return [{ line, endLine: lineAt(text, close), args: text.slice(open + 1, close) }];
  });
}

/** The call at this line, or the last one before it, as a parser sits after its call, or else the next one. */
export function nearestCall(text        , line        , reach = 60)                   {
  const calls = callsIn(text);
  const within = calls.find((call) => call.line <= line && line <= call.endLine);
  if (within) return within;
  const before = calls.filter((call) => call.endLine < line && line - call.endLine <= reach).at(-1);
  return before ?? calls.find((call) => call.line > line && call.line - line <= reach) ?? null;
}

                                                                      

function argsOf(inner        )        {
  const parts = splitTop(inner, ',');
  const single = parts.length === 1 && parts[0].startsWith('{') ? splitTop(parts[0].slice(1, closeOf(parts[0], 0)), ',') : parts;
  return single.map((part) => {
    const named = part.match(/^["']?([A-Za-z_$][\w$]*)["']?\s*[:=](?!=)\s*/);
    return named ? { name: named[1], value: part.slice(named[0].length) } : { name: null, value: part };
  });
}

                 
                        
                            
                               
                         
 

                                                                  
                                                                                                               

const RUNTIME        = { text: '', runtime: true, line: null };

function joinPieces(pieces                  )        {
  const first = pieces.find((piece) => piece.line !== null);
  return { text: pieces.map((piece) => piece.text).join(''), runtime: pieces.some((piece) => piece.runtime), line: first?.line ?? null, ...(first?.file ? { file: first.file } : {}) };
}

function escapeRe(text        )         {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decode(raw        )         {
  return raw.replace(/\\\r?\n[ \t]*/g, '').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(["'`\\])/g, '$1');
}

/** Where `name =` is assigned. More than one assignment means it changes at runtime, so only exactly one counts. */
function assignedAt(text        , name        )                {
  const re = new RegExp(`(?:^|\\n)[ \\t]*(?:export\\s+)?(?:const\\s+|let\\s+|var\\s+)?${escapeRe(name)}\\s*(?::\\s*[\\w<>\\[\\]| .]+)?=(?!=)`, 'g');
  const found = [...text.matchAll(re)];
  return found.length === 1 ? found[0].index + found[0][0].length : null;
}

function memberAt(text        , owner        , member        )                {
  const start = text.search(new RegExp(`(?:class\\s+${escapeRe(owner)}\\b|(?:const|let|var)\\s+${escapeRe(owner)}\\s*=\\s*\\{)`));
  if (start === -1) return null;
  const match = new RegExp(`\\b${escapeRe(member)}["']?\\s*[:=](?!=)\\s*`).exec(text.slice(start));
  return match ? start + match.index + match[0].length : null;
}

function declaredAt(text        , path        )                {
  const parts = path.split('.');
  if (parts.length === 1 || /^(?:this|self)\./.test(path)) return assignedAt(text, path);
  return parts.length === 2 ? memberAt(text, parts[0], parts[1]) : null;
}

/** The expression assigned at `start`, up to the end of its statement. */
function valueFrom(text        , start        )         {
  const end = walk(text, start, (at, depth) => depth === 0 && (text[at] === '\n' || text[at] === ';' || CLOSERS.includes(text[at])));
  return text.slice(start, end).trim();
}

function found(ctx     , path        )                                                       {
  const here = declaredAt(ctx.source.text, path);
  if (here !== null) return { value: valueFrom(ctx.source.text, here), source: ctx.source, at: here };
  if (/^(?:this|self)\./.test(path)) return null;
  const elsewhere = [...ctx.others].flatMap(([file, text]) => {
    const at = file === ctx.source.file ? null : declaredAt(text, path);
    return at === null ? [] : [{ file, text, at }];
  });
  if (elsewhere.length !== 1) return null;
  const [{ file, text, at }] = elsewhere;
  return { value: valueFrom(text, at), source: { text, file }, at };
}

function interpolated(raw        , kind                                  , ctx     , line        )        {
  const literal = (text        )        => ({ text: decode(text), runtime: false, line: text.trim() ? line : null, ...(ctx.source.file ? { file: ctx.source.file } : {}) });
  if (kind === 'plain' || (kind === 'template' && !raw.includes('${'))) return literal(raw);
  const slots = kind === 'template' ? /\$\{([^{}]*)\}/g : /\{([^{}]*)\}/g;
  const pieces          = [];
  let from = 0;
  for (const match of raw.matchAll(slots)) {
    pieces.push(literal(raw.slice(from, match.index)), resolved(match[1], { ...ctx, depth: ctx.depth + 1 }));
    from = match.index + match[0].length;
  }
  return joinPieces([...pieces, literal(raw.slice(from))]);
}

/** One string, or several run together as Python allows. Null when this isn't only strings. */
function stringsIn(expression        , ctx     , at        )               {
  const pieces          = [];
  let rest = expression.trim();
  while (rest) {
    const prefix = rest.match(STRING_START);
    if (!prefix) return null;
    const start = prefix[1].length;
    const end = pastString(rest, start);
    const quote = rest.startsWith(rest[start].repeat(3), start) && rest[start] !== '`' ? 3 : 1;
    const raw = rest.slice(start + quote, Math.max(start + quote, end - quote));
    pieces.push(interpolated(raw, rest[start] === '`' ? 'template' : /f/i.test(prefix[1]) ? 'fstring' : 'plain', ctx, lineAt(ctx.source.text, at)));
    rest = rest.slice(end).trim();
  }
  return pieces.length ? joinPieces(pieces) : null;
}

function withoutParens(expression        )         {
  const trimmed = expression.trim();
  return trimmed.startsWith('(') && closeOf(trimmed, 0) === trimmed.length - 1 ? withoutParens(trimmed.slice(1, -1)) : trimmed;
}

/** An expression, followed back to its text as far as the code alone shows it. */
function resolved(expression        , ctx     , at = 0)        {
  if (ctx.depth > MAX_DEPTH) return RUNTIME;
  const plain = withoutParens(expression);
  const added = splitTop(plain, '+');
  if (added.length > 1) return joinPieces(added.map((part) => resolved(part, { ...ctx, depth: ctx.depth + 1 }, at)));
  const strings = stringsIn(plain, ctx, at);
  if (strings) return strings;
  if (!PATH.test(plain)) return RUNTIME;
  const held = found(ctx, plain);
  return held ? resolved(held.value, { ...ctx, source: held.source, depth: ctx.depth + 1 }, held.at) : RUNTIME;
}

const shown = (expression        ) => expression.replace(/\s+/g, ' ').slice(0, SHOWN_CHARS);

/** A list of messages, as code wrote it: the content of the first with this role, or the name the list goes by. */
function messageContent(expression        , role        , ctx     )                {
  const plain = withoutParens(expression);
  const list = PATH.test(plain) ? found(ctx, plain)?.value : plain;
  if (!list?.startsWith('[')) return null;
  const items = splitTop(list.slice(1, closeOf(list, 0)), ',').filter((item) => item.startsWith('{')).map((item) => argsOf(item));
  const hit = items.find((fields) => fields.some((field) => field.name === 'role' && new RegExp(`^["'\`]${role}["'\`]$`).test(field.value)));
  const content = hit?.find((field) => field.name === 'content')?.value;
  if (!content?.startsWith('[')) return content ?? null;
  const blocks = splitTop(content.slice(1, closeOf(content, 0)), ',').filter((item) => item.startsWith('{')).map((item) => argsOf(item));
  return blocks.flatMap((block) => block.filter((field) => field.name === 'text').map((field) => field.value))[0] ?? null;
}

/** What this call gives as its prompt, most stable first: the system prompt, then a prompt, then the user's first message. */
function promptArgument(args                , ctx     )                                          {
  const named = (names                   ) => args.find((arg) => arg.name && names.includes(arg.name));
  const system = named(SYSTEM_ARGS);
  if (system) return { label: system.name          , value: system.value };
  const messages = named(['messages']);
  const inMessages = messages ? messageContent(messages.value, 'system', ctx) : null;
  if (inMessages) return { label: 'the system message', value: inMessages };
  const prompt = named(PROMPT_ARGS) ?? args.find((arg) => arg.name === null && !arg.value.startsWith('...'));
  if (prompt) return { label: prompt.name ?? 'its first argument', value: prompt.value };
  const user = messages ? messageContent(messages.value, 'user', ctx) : null;
  return user ? { label: 'the user message', value: user } : messages ? { label: 'messages', value: messages.value } : null;
}

export function promptAtCall(text        , line        , others                              = new Map(), reach = 60)               {
  const call = nearestCall(text, line, reach);
  if (!call) return { prompt: null, reason: 'no model call is near this line', call: null };
  const ctx      = { source: { text }, others, depth: 0 };
  const argument = promptArgument(argsOf(call.args), ctx);
  if (!argument) return { prompt: null, reason: 'the call at this line passes no prompt keepup can see', call };
  const piece = resolved(argument.value, ctx, text.split('\n').slice(0, call.line - 1).join('\n').length);
  const literal = piece.text;
  const unreadable = literal.replace(PLACEHOLDER, '').trim().length < MIN_LITERAL || NOT_PROSE.test(literal.trim()) || !/\s/.test(literal.trim());
  if (unreadable) return { prompt: null, reason: `the call passes ${argument.label} as ${shown(argument.value)}, which is built at runtime`, call };
  return {
    prompt: { text: literal, line: piece.line ?? call.line, chars: literal.length, placeholders: [...new Set(literal.match(PLACEHOLDER) ?? [])], runtime: piece.runtime, ...(piece.file ? { file: piece.file } : {}) },
    reason: piece.runtime ? `the call passes ${argument.label} as ${shown(argument.value)}, and part of it is built at runtime` : '',
    call,
  };
}

const PROMPT_CONSTANT = /\b[A-Z][A-Z0-9_]*(?:PROMPT|INSTRUCTIONS)[A-Z0-9_]*\b/g;

/**
 * For a token count only, when an agent framework sends the prompt and no model call is in sight: a constant named as a
 * prompt, used within reach of this line, followed back to its text. `keepup measure` never sends this: it needs the call.
 */
export function namedPromptNear(text        , line        , others                              = new Map(), reach = 30)                       {
  const lines = text.split('\n');
  const near = lines.slice(Math.max(0, line - 1 - reach), line + reach).filter((row) => !COMMENT_LINE.test(row) && !/^\s*(?:export\s+)?(?:const|let|var)\s+[A-Z]/.test(row));
  const names = [...new Set(near.flatMap((row) => row.match(PROMPT_CONSTANT) ?? []))];
  for (const name of names) {
    const held = found({ source: { text }, others, depth: 0 }, name);
    if (!held) continue;
    const piece = resolved(held.value, { source: held.source, others, depth: 1 }, held.at);
    const literal = piece.text.trim();
    if (literal.replace(PLACEHOLDER, '').trim().length < MIN_LITERAL || NOT_PROSE.test(literal)) continue;
    return { text: piece.text, line: piece.line ?? line, chars: piece.text.length, placeholders: [...new Set(piece.text.match(PLACEHOLDER) ?? [])], runtime: piece.runtime, ...(piece.file ? { file: piece.file } : {}) };
  }
  return null;
}

/** The readable prompt, or null. */
export function literalPromptNear(text        , line        , others                              = new Map(), reach = 60)                       {
  return promptAtCall(text, line, others, reach).prompt;
}

/** The model this call names, when the code alone shows it. A setting read at runtime is null. */
export function modelAtCall(text        , line        , others                              = new Map(), reach = 60)                {
  const call = nearestCall(text, line, reach);
  const model = call ? argsOf(call.args).find((arg) => arg.name === 'model') : undefined;
  if (!model) return null;
  const piece = resolved(model.value, { source: { text }, others, depth: 0 });
  return !piece.runtime && /^[\w.:/-]+$/.test(piece.text) ? piece.text : null;
}
