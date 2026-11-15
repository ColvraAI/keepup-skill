// A model's successor can break what worked. The provider says how on the day it ships, in the changelog, so the
// program reads that and checks the repo for the identifier. This never depends on a judge remembering to say it.
                                                                         
                                                         
import { claudeDisplayName, findModelIds } from './model-ids.js';
import { notRuledOutLine } from './sdk-notes.js';

const BREAKS = /\breturns? a \d{3} error\b|\bisn['’]t accepted\b|\bno longer accepted\b/i;
const IDENTIFIER = /\b[a-z]+_[a-z0-9_]+\b/;
const MAX_CAVEATS = 2;
const MAX_MATCHES = 3;
const MAX_ABSENT = 1;
const WINDOW_LINES = 12;
const COMMENT_LINE = /^\s*(?:#|\/\/|\*|\/\*)/;
const TABLE_HEADER = /^\s*\[+\s*([^\]\s]+)\s*\]+/;
/** What a provider's trade-off sentence calls a setting, and what it's called in a file. */
const SETTINGS                                                               = [
  { words: /\bthinking budgets?\b/i, name: 'budget_tokens' },
  { words: /\btemperature\b/i, name: 'temperature' },
  { words: /\btop_p\b/, name: 'top_p' },
  { words: /\btop_k\b/, name: 'top_k' },
  { words: /\bprefill\b/i, name: 'prefill' },
  { words: /\btool_choice\b/, name: 'tool_choice' },
];

                         
                             
                            
                                     
                                     
                          
                                                                                 
                             
                          
 

/** A provider's docs write tool_choice. A JS repo writes toolChoice and a config may write tool-choice: all the same setting. */
export function settingSpellings(name        )           {
  const camel = name.replace(/_([a-z0-9])/g, (_, letter        ) => letter.toUpperCase());
  return [...new Set([name, camel, name.replace(/_/g, '-')])];
}

function spellingPattern(name        )         {
  return new RegExp(`(?<![\\w-])(?:${settingSpellings(name).join('|')})(?![\\w-])`);
}

/** Only a plain word or number is repeated. Anything else on a repo's line stays out of what a founder reads. */
const PLAIN_VALUE = /^["'`]?[\w.-]{1,24}["'`]?$/;

function valueAt(line        , spelling        )                     {
  const after = line.slice(line.indexOf(spelling) + spelling.length).replace(/^["'`]?\s*[:=]\s*/, '');
  const value = after.match(/^(?:"[^"]{0,40}"|'[^']{0,40}'|`[^`]{0,40}`|[\w.-]{1,24})/)?.[0];
  return value && PLAIN_VALUE.test(value) ? value : undefined;
}

function sentencesOf(text        )           {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
}

                 
                            
                             
                          
 

function placesOf(identifier        , files                             )        {
  const spellings = settingSpellings(identifier);
  const pattern = spellingPattern(identifier);
  const places           = [];
  let first                               = null;
  for (const [file, text] of files) {
    if (!spellings.some((spelling) => text.includes(spelling))) continue;
    text.split('\n').forEach((line, index) => {
      const spelling = COMMENT_LINE.test(line) ? undefined : line.match(pattern)?.[0];
      if (!spelling || places.length >= MAX_MATCHES) return;
      places.push(`${file}:${index + 1}`);
      first ??= { spelling, value: valueAt(line, spelling) };
    });
    if (places.length >= MAX_MATCHES) break;
  }
  return { places, ...(first ?? {}) };
}

/** Display names and ids to look for: "Claude Sonnet 5.5" and claude-sonnet-5-5 name the same model. */
export function successorNames(names                   , text        )           {
  const ids = findModelIds(text).map((mention) => mention.id);
  const display = [...names, ...ids].flatMap((name) => {
    const shown = claudeDisplayName(name);
    return shown ? [name, shown] : [name];
  });
  return [...new Set(display)];
}

function launchEntries(names                   , provider                   , entries                           )                                            {
  return entries.flatMap((entry) => {
    if (entry.provider !== provider) return [];
    const name = names.find((candidate) => entry.text.includes(candidate) && new RegExp(`launched [^.]{0,40}${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(entry.text));
    return name ? [{ name, entry }] : [];
  });
}

export function successorCaveats(names                   , provider                   , entries                           , files                             )           {
  const found = launchEntries(names, provider, entries).flatMap(({ name, entry }) => sentencesOf(entry.text).filter((sentence) => BREAKS.test(sentence)).map((sentence) => {
    const identifier = sentence.match(IDENTIFIER)?.[0] ?? null;
    return { successor: name, sentence, identifier, source: entry.url, ...(identifier ? placesOf(identifier, files) : { places: [] }) };
  }));
  const ordered = found.sort((a, b) => b.places.length - a.places.length);
  const present = ordered.filter((caveat) => caveat.places.length > 0 || !caveat.identifier);
  const absent = ordered.filter((caveat) => caveat.places.length === 0 && caveat.identifier).slice(0, MAX_ABSENT);
  return (present.length ? present : absent).slice(0, MAX_CAVEATS);
}

                               
                        
                            
                          
 

/** The table a config line sits in, with its subtables: [a.llm] and [a.llm.extra] are one model's settings, [b] isn't. */
function sectionRange(lines                   , at        )                               {
  const headerAbove = lines.slice(0, at).findLastIndex((line) => TABLE_HEADER.test(line));
  if (headerAbove === -1) return { from: Math.max(0, at - WINDOW_LINES), to: Math.min(lines.length, at + WINDOW_LINES) };
  const name = lines[headerAbove].match(TABLE_HEADER)?.[1] ?? '';
  const below = lines.slice(at + 1).findIndex((line) => {
    const other = line.match(TABLE_HEADER)?.[1];
    return other !== undefined && other !== name && !other.startsWith(`${name}.`);
  });
  return { from: headerAbove, to: below === -1 ? lines.length : at + 1 + below };
}

function settingLines(file        , line        , name        , files                             )                                     {
  const lines = files.get(file)?.split('\n') ?? [];
  const { from, to } = sectionRange(lines, line - 1);
  const setting = new RegExp(`(?<![\\w-])(${settingSpellings(name).join('|')})(?![\\w-])["'\`]?\\s*[:=]`);
  return lines.slice(from, to).flatMap((text, index) => {
    const spelling = text.match(setting)?.[1];
    return spelling && !COMMENT_LINE.test(text) ? [{ spelling, at: `${file}:${from + index + 1}` }] : [];
  });
}

                         
                                                                               
                                                                                                   
 

/** A trade-off a provider states is only worth saying where this repo really sets the thing. The program looks; a judge can't forget. */
export function tradeOffLines(inputs                          , files                             )                 {
  const out = new Map                      ();
  for (const { places, levers } of inputs) {
    for (const lever of levers) {
      for (const sentence of lever.trade_offs ?? []) {
        const found = SETTINGS.flatMap(({ words, name }) => {
          if (!words.test(sentence)) return [];
          const lines = places.flatMap((place) => settingLines(place.file, place.line, name, files));
          const at = [...new Set(lines.map((item) => item.at))].slice(0, MAX_MATCHES);
          return at.length ? [`${lines[0].spelling} at ${at.join(', ')}`] : [];
        });
        if (found.length) out.set(sentence, { sentence, source: lever.source, line: `Check before switching: "${sentence}" This repo sets ${found.join(' and ')}.` });
      }
    }
  }
  return [...out.values()];
}

/** A missing word only says what this repo's text doesn't set. With an SDK writing the request, it can't say more than that. */
function absentLine(identifier        , sdks                            )         {
  return sdks.length ? notRuledOutLine(identifier, sdks) : ` ${identifier} isn't anywhere in this repo's code.`;
}

export function caveatLine(caveat        , sdks                             = [])         {
  const shown = caveat.value ? ` (${caveat.spelling}: ${caveat.value})` : '';
  const found = caveat.identifier
    ? (caveat.places.length ? ` ${caveat.spelling ?? caveat.identifier} is at ${caveat.places.join(', ')}${shown}.` : absentLine(caveat.identifier, sdks))
    : '';
  return `Check before switching to ${caveat.successor}: "${caveat.sentence}"${found}`;
}
