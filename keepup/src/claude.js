// Wires Claude into the pipeline's seams: profile, candidates, judge. A cap or a refusal never loses a run:
// it writes what it has and says so.
import { buildCandidates,                                   } from './candidates.js';
import { withCards } from './cards.js';
import { allSources, loadRecords, retirements } from './db.js';
import { judgeAll } from './judge.js';
import { loadLevers } from './levers.js';
import { libraryFacts } from './library-moves.js';
import { BudgetExceededError,          } from './llm.js';
                                                                                     
import { understandProduct } from './profile.js';
                                                              
                                                            
import { stackLock } from './stack-lock.js';

                                
                    
                                 
                                                
                            
                                    
                                 
                                     
 

function usageOf(llm     )        {
  const seen = llm.usage();
  return { ...seen, max_usd: llm.maxUsd };
}

export function declaredPackages(context                                )              {
  return new Set(context.facts.manifests.flatMap((manifest) => manifest.dependencies.map((dep) => dep.name)));
}

export function claudeSeams(options               )        {
  const { llm, providerOnly } = options;
  const state                                                                                = { dropped: [], log: null, profileError: null };

  const profile = async (context                 )                          => {
    try {
      const understood = await understandProduct(llm, context);
      state.dropped = understood.dropped;
      return { ...understood.profile, stack_lock: [...understood.profile.stack_lock, ...stackLock(context.facts).rules] };
    } catch (error) {
      state.profileError = (error         ).message;
      if (!(error instanceof BudgetExceededError)) process.stderr.write(`keepup: profile failed: ${state.profileError}\n`);
      return null;
    }
  };

  const candidates = async (context                 , understood                , search                                                )                                => {
    if (!understood) return [];
    const built = buildCandidates(understood, search, { lock: stackLock(context.facts), declaredPackages: declaredPackages(context) });
    state.log = { ...built.log, provider_only: providerOnly ?? null };
    return options.online ? withCards(built.candidates, { fetchImpl: options.fetchImpl, cacheDir: options.cardCacheDir }) : built.candidates;
  };

  const judge = async (input            )                       => {
    const changelog = loadRecords(allSources().filter((source) => source === 'changelog'));
    const facts = await libraryFacts(input.context, { online: options.online, cacheDir: options.registryCacheDir, fetchImpl: options.fetchImpl, today: input.context.asOf });
    const retiredIds = new Set([...retirements().flatMap((row) => (row.id ? [row.id] : [])), ...loadLevers().flatMap((lever) => lever.models ?? [])]);
    const judged = await judgeAll(input, { llm, providerOnly, changelog, libraryFacts: facts, retiredIds });
    const profileSkip = state.profileError ? [`Profile: ${state.profileError}`] : [];
    const skipped = [...profileSkip, ...(judged.incomplete?.skipped ?? [])];
    return {
      ...judged,
      dropped: [...state.dropped, ...(judged.dropped ?? [])],
      usage: usageOf(llm),
      candidate_log: state.log ?? undefined,
      incomplete: skipped.length ? { reason: judged.incomplete?.reason ?? 'Stopped early. This is what was checked.', skipped } : undefined,
    };
  };

  return { profile, candidates, judge };
}
