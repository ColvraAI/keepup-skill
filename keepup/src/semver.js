// Just enough version logic to answer one question: does what a repo declares already allow the
// new version? The rules differ by ecosystem: Cargo reads "0.12.0" as a caret range, npm reads it as exact.
                                                

                                                  

                                                

                 
                                             
                           
 

const OPEN_SPEC = /^(?:\*|x|X|latest|next|)$/;
const VERSION_IN_SPEC = /\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?/;

function parts(version        )                                  {
  const clean = version.trim().replace(/^v/, '');
  const [core, ...rest] = clean.split(/[-+]/);
  const [a = 0, b = 0, c = 0] = core.split('.').map((part) => Number(part) || 0);
  return { triple: [a, b, c], pre: clean.includes('-') ? rest.join('-') : '' };
}

export function compareVersions(a        , b        )         {
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.triple[i] !== right.triple[i]) return left.triple[i] - right.triple[i];
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

function format(triple        )         {
  return triple.join('.');
}

function caretBounds(version        )          {
  const pieces = version.split('.').length;
  const [a, b, c] = parts(version).triple;
  let upper         = [a + 1, 0, 0];
  if (a === 0 && (b > 0 || pieces >= 2)) upper = b > 0 || pieces === 2 ? [0, b + 1, 0] : [0, 0, c + 1];
  return [{ op: '>=', version }, { op: '<', version: format(upper) }];
}

function tildeBounds(version        )          {
  const pieces = version.split('.').length;
  const [a, b] = parts(version).triple;
  return [{ op: '>=', version }, { op: '<', version: format(pieces === 1 ? [a + 1, 0, 0] : [a, b + 1, 0]) }];
}

/** x and * ranges: "1.x" and "1.2.*". */
function wildcardBounds(comparator        )                 {
  const match = comparator.match(/^(\d+)(?:\.(\d+))?\.[xX*]$/);
  if (!match) return null;
  const [major, minor] = [Number(match[1]), match[2] === undefined ? null : Number(match[2])];
  const upper         = minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0];
  return [{ op: '>=', version: format([major, minor ?? 0, 0]) }, { op: '<', version: format(upper) }];
}

function comparatorBounds(comparator        , ecosystem           )          {
  const wildcard = wildcardBounds(comparator);
  if (wildcard) return wildcard;
  const match = comparator.match(/^(\^|~=|~|>=|<=|>|<|==|=|!=)?\s*v?(.+)$/);
  if (!match) return [];
  const [, op, version] = match;
  if (op === '^') return caretBounds(version);
  if (op === '~' || op === '~=') return op === '~=' ? compatibleBounds(version) : tildeBounds(version);
  if (op === '!=') return [];
  if (op === '>=' || op === '<=' || op === '>' || op === '<') return [{ op, version }];
  if (op === '=' || op === '==') return [{ op: '=', version }];
  return ecosystem === 'crates' ? caretBounds(version) : [{ op: '=', version }];
}

/** PEP 440 ~=: "~=0.2.0" means >=0.2.0 and <0.3.0; "~=2.2" means >=2.2 and <3. */
function compatibleBounds(version        )          {
  const pieces = version.split('.').map(Number);
  const head = pieces.slice(0, -1);
  head[head.length - 1] += 1;
  return [{ op: '>=', version }, { op: '<', version: head.join('.') }];
}

function meets(version        , bound       )          {
  const order = compareVersions(version, bound.version);
  if (bound.op === '>=') return order >= 0;
  if (bound.op === '>') return order > 0;
  if (bound.op === '<=') return order <= 0;
  if (bound.op === '<') return order < 0;
  return order === 0;
}

function comparatorsOf(spec        )           {
  return spec.replace(/(>=|<=|>|<|==|=|~=|~|\^)\s+/g, '$1').split(/[\s,]+/).filter(Boolean);
}

function hyphenRange(spec        )                {
  const match = spec.match(/^(\S+)\s+-\s+(\S+)$/);
  return match ? `>=${match[1]} <=${match[2]}` : null;
}

export function allowsVersion(spec        , version        , ecosystem           )          {
  const trimmed = spec.trim();
  if (OPEN_SPEC.test(trimmed)) return true;
  return trimmed.split('||').some((alternative) => {
    const clean = alternative.trim();
    const expanded = hyphenRange(clean) ?? clean;
    return comparatorsOf(expanded)
      .flatMap((comparator) => comparatorBounds(comparator, ecosystem))
      .every((bound) => meets(version, bound));
  });
}

export function lowestVersionIn(spec        )                {
  return spec.match(VERSION_IN_SPEC)?.[0] ?? null;
}

export function majorsBehind(from        , to        )         {
  return Math.max(0, parts(to).triple[0] - parts(from).triple[0]);
}

export function specKind(spec        , ecosystem           )           {
  const trimmed = spec.trim();
  if (OPEN_SPEC.test(trimmed)) return 'open';
  if (/^==?\s*\d/.test(trimmed)) return 'exact';
  const isBareVersion = /^v?\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed);
  return isBareVersion && ecosystem === 'npm' ? 'exact' : 'range';
}
