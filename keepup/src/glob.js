// A small glob matcher: *, **, ?, and {a,b}. A glob with no slash matches the file's name at any depth.
// That's how ripgrep's -g and .gitignore read such a glob.

const compiled = new Map                ();

function translate(glob        )         {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      const followedBySlash = glob[i + 2] === '/';
      out += followedBySlash ? '(?:.*/)?' : '.*';
      i += followedBySlash ? 2 : 1;
    } else if (char === '*') {
      out += '[^/]*';
    } else if (char === '?') {
      out += '[^/]';
    } else if (char === '{') {
      out += '(?:';
    } else if (char === '}') {
      out += ')';
    } else if (char === ',') {
      out += glob.lastIndexOf('{', i) > glob.lastIndexOf('}', i) ? '|' : ',';
    } else {
      out += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
  }
  return out;
}

export function globToRegExp(glob        )         {
  const cached = compiled.get(glob);
  if (cached) return cached;
  const prefix = glob.includes('/') ? '^' : '(?:^|/)';
  const re = new RegExp(`${prefix}${translate(glob)}$`);
  compiled.set(glob, re);
  return re;
}

export function matchesGlob(path        , glob        )          {
  return globToRegExp(glob).test(path);
}

export function matchesAnyGlob(path        , globs                   )          {
  return globs.some((glob) => matchesGlob(path, glob));
}
