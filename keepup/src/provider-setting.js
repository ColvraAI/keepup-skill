// --provider-only: this product uses one provider, by choice. A program rule over what the judge said, so the model never
// hides a retirement it wasn't shown. A model the code already sends stays whichever provider it's from: keeping it
// working isn't a switch. Only a suggestion to adopt another provider's API goes.
                                         
                                                 
                                                                  

const PROVIDER_HOSTS                                   = {
  'developers.openai.com': 'openai',
  'platform.openai.com': 'openai',
  'openai.com': 'openai',
  'ai.google.dev': 'gemini',
  'platform.claude.com': 'anthropic',
  'docs.anthropic.com': 'anthropic',
};

function providerOf(url        , levers                  )                {
  const lever = levers.find((candidate) => candidate.source === url);
  if (lever?.providers?.length) return lever.providers[0];
  if (lever) return null;
  try {
    return PROVIDER_HOSTS[new URL(url).hostname] ?? null;
  } catch {
    return null;
  }
}

                 
                               
                            
 

function withoutOtherProviders(finding         , providerOnly        , levers                  )                 {
  const isOff = (url        ) => {
    const owner = providerOf(url, levers);
    return owner !== null && owner !== providerOnly;
  };
  const options = finding.options.filter((option) => !isOff(option.source));
  const sources = finding.sources.filter((url) => !isOff(url));
  if (sources.length === 0 || (finding.options.length > 0 && options.length === 0)) return null;
  const lever = levers.find((candidate) => candidate.id === finding.lever);
  const nextLever = lever && isOff(lever.source) ? levers.find((candidate) => options.some((option) => option.source === candidate.source))?.id ?? null : finding.lever;
  return { ...finding, options, sources, lever: nextLever };
}

function splitFindings(findings                    , providerOnly        , levers                  )        {
  const kept            = [];
  const held             = [];
  for (const finding of findings) {
    const trimmed = finding.locked ? finding : withoutOtherProviders(finding, providerOnly, levers);
    if (trimmed) kept.push(trimmed);
    else held.push({ thing: finding.title, date: null, reason: `This product uses only ${providerOnly}, by choice, so another provider's API isn't suggested.`, source: finding.sources[0] ?? null });
  }
  return { findings: kept, held };
}

export function applyProviderSetting(result             , providerOnly                    , levers                  )              {
  if (!providerOnly) return result;
  const split = splitFindings(result.findings, providerOnly, levers);
  const isAllowed = (item          ) => {
    const owner = providerOf(item.source, levers);
    return owner === null || owner === providerOnly;
  };
  return { ...result, findings: split.findings, watching: result.watching.filter(isAllowed), trusted_held_back: [...split.held, ...(result.trusted_held_back ?? [])], provider_only: providerOnly };
}
