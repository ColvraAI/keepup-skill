// What a connected repo's dashboard receives after a brief: the repo's name, the commit and the time, and for each finding
// its rank, lever id, title, effect, proof label, file and line. Never code: a finding's `where[].text` is the masked
// code line and stays here, as do the bundles' local root path and the session log.
                                              
import { EFFECT_WORDS, PROOF_LABELS } from './run-shape.js';
                                                          
import { CLIENT_VERSION, RECORD_SHAPE } from './version.js';

const MAX_FINDINGS = 50;
const MAX_TITLE = 300;
const MAX_FILE = 400;
const COMMIT = /^[0-9a-f]{7,40}$/;
const LEVER_ID = /^ADV-[A-Za-z0-9._-]{1,120}$/;

                               
                        
                                 
                                        
                            
                                 
                         
 

function oneLineTitle(title        )         {
  const clean = title.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 3)}...` : clean;
}

/** One finding as the run summary sends it, or null when it isn't sent. pr-opened sends the same lever and title, which the server matches by. */
export function summaryFinding(finding         , index        )                    {
  if (!(PROOF_LABELS                     ).includes(finding.proof)) return null;
  const where = finding.where[0];
  const file = where && typeof where.file === 'string' && where.file.length <= MAX_FILE ? where.file : null;
  const line = file !== null && Number.isInteger(where?.line) && (where?.line ?? 0) > 0 ? where.line : null;
  return {
    rank: Number.isInteger(finding.rank) && (finding.rank ?? 0) > 0 ? (finding.rank          ) : index + 1,
    lever: typeof finding.lever === 'string' && LEVER_ID.test(finding.lever) ? finding.lever : null,
    title: oneLineTitle(finding.title),
    effect: finding.effect.filter((word) => (EFFECT_WORDS                     ).includes(word)),
    proof: finding.proof,
    file,
    line,
  };
}

export function runSummary(input              )             {
  const findings = input.findings.flatMap((finding, index) => {
    const kept = summaryFinding(finding, index);
    return kept ? [kept] : [];
  });
  return {
    client: CLIENT_VERSION,
    shape: RECORD_SHAPE,
    repo: input.repo,
    commit: input.commit !== null && COMMIT.test(input.commit) ? input.commit : null,
    ran_at: input.ranAt,
    counts: { findings: findings.length, held_back: input.heldBack, patterns_fired: input.patternsFired },
    findings: findings.slice(0, MAX_FINDINGS),
  };
}
