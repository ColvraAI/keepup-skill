// Renders a run to text in the shape of data/briefs/. Pure: same run, same text. renderSummary is what a founder
// reads, one screen; renderBrief is the whole thing. Repo and model text can't break out of either.
import { accountLines,                   clientCheckedLine, clientQuietLine, heldByServer, noAccount, noLeverServed, packHeader } from './brief-client.js';
import { addDays, humanDate } from './dates.js';
                                                                                                                                                                                    
import { PAYBACK_MONTHS } from './roi.js';
import { AFTER_UPGRADE } from './sdk-notes.js';
import { codeSpan, oneLine, plainText } from './text-safety.js';

export function quietLine(checked        )         {
  return `keepup: nothing new applies · ${checked.toLocaleString('en-US')} checked`;
}

/** What a session really ran. Only keepup's bundles carry candidates, so a saved run or an older session keeps its searches. */
                                  
                            
                         
                               
                         
 

const howMany = (value        , word        )         => `${value.toLocaleString('en-US')} ${word}${value === 1 ? '' : 's'}`;

function ranWords(coverage                 )           {
  const looked = coverage.candidates === undefined ? `${coverage.searches} searches` : `${howMany(coverage.candidates, 'candidate')} shown for ${howMany(coverage.jobs ?? 0, 'job')}`;
  return [looked, `${coverage.reads} read closely`];
}

/** When Claude Code judged, what's true is what really ran, not all of the database. */
export function coveredLine(records        , coverage                 , unchecked                    = [])         {
  return [`keepup: nothing new applies · ${records.toLocaleString('en-US')} in the database`, ...ranWords(coverage), ...unchecked].join(' · ');
}

                                   
                           
                             
                          
                           
 

/** Only what a registry or the database answered counts as checked, and "far behind" is said only of those. With no finding left, a retired or retiring model here was held back, and the line says so instead of "nothing retired". */
export function exactOnlyLine(modelIds        , deps                  , retiredHere = 0)         {
  const models = `${modelIds.toLocaleString('en-US')} model ids`;
  const notChecked = deps.unchecked ? `${deps.unchecked.toLocaleString('en-US')} dependencies not checked (${deps.online ? 'no registry answer' : 'offline'})` : '';
  const checked = deps.checked || !deps.unchecked ? `${deps.checked.toLocaleString('en-US')} dependencies` : '';
  const counted = deps.unchecked ? [models, ...(deps.checked ? [`${deps.checked.toLocaleString('en-US')} dependencies checked`] : []), notChecked].join(' · ') : `${models}, ${checked}`;
  const retired = retiredHere ? `${retiredHere.toLocaleString('en-US')} retired or retiring, held back` : 'nothing retired';
  const outcome = deps.behind ? `${retired}, and ${deps.behind} behind with no named gain` : deps.checked && !deps.unchecked && !retiredHere ? 'nothing retired or far behind' : retired;
  return `keepup: exact checks only · ${counted} · ${outcome}`;
}

/** Models here the exact checks found retired or retiring, at a place that's live. */
function retiredModelsHere(run            )         {
  return (run.exact ?? []).filter((item) => item.kind === 'model' && (item.status === 'retired' || item.status === 'retiring') && livePlaces(item).length > 0).length;
}

/** The session the brief is printed into. Each has its own way to ask for a change; Claude Code is the default. */
                                      
export const HOSTS                  = ['claude', 'codex'];
const APPLY                                 = { claude: '/keepup:apply', codex: '$keepup-apply' };

/** On the plugin path: what keepup printed into the session and what was read, since keepup prepare. The session's own tokens never reach keepup. */
                              
                           
                         
                           
                           
                            
 

/** On the API path: the tokens and list-price dollars the run itself recorded. */
                          
                       
                                                                                                                                                                                                             
 

                                         

/** Where each host shows a person their own token use. */
const OWN_USE                                 = { claude: '/usage', codex: '/status' };

/** Only the fields a brief reads, so a test or an older run file can render too. */
                             
                       
                                                                                  
                       
                        
                                 
                                
                                       
                
                             
                             
                                                         
                                                                        
    
                                                                              
                          
                          
                           
                                                                                                                                                           
                                                                                  
                                                                                                 
                                      
                                                                                                              
                                
                                                                                                 
                                                                                               
                                   
                                   
                                        
                                         
                                          
                                
                                     
                                                                                         
                                                       
                                                 
 

const money = (value        ) => (Math.abs(value) < 1 ? `$${value.toFixed(2)}` : `$${Math.round(value).toLocaleString('en-US')}`);

function isRetirement(finding         )          {
  return Boolean(finding.reach);
}

/** It has a number, and the number says it doesn't pay back at the assumed volume. A worked example can't rank, but it can still say this. */
function losesMoney(finding         )          {
  const value = finding.value;
  if (value?.status === 'priced' && typeof value.value_usd === 'number' && value.value_usd <= 0) return true;
  const options = value?.status === 'worked' && value.roi?.money ? value.roi.options.filter((option) => option.line) : [];
  return options.length > 0 && options.every((option) => option.payback_months == null || option.payback_months > PAYBACK_MONTHS);
}

function latestMeasure(finding         , run            )                          {
  return (run.measurements ?? []).filter((item) => item.finding_rank === finding.rank && item.rows.some((row) => row.status === 'measured')).at(-1);
}

/** What a lever does, in money or speed. Each number carries its label; with neither, this says nothing. */
export function effectLine(finding         , run            )         {
  return effectParts(finding, run).join(' · ');
}

function effectParts(finding         , run            )           {
  const value = finding.value;
  const measured = latestMeasure(finding, run)?.rows.filter((row) => row.headline).map((row) => `${row.headline} [measured, n=${row.n}]`) ?? [];
  const speed = value?.speed ? [`${value.speed.text} [${value.speed.label}]`] : [];
  const calls = value?.inputs.calls_per_month.value;
  const pays = value?.status === 'priced' && losesMoney(finding) && value.break_even_calls_per_month ? [`pays back above about ${value.break_even_calls_per_month.toLocaleString('en-US')} calls a month [projected]; ${Number(calls).toLocaleString('en-US')} calls a month, assumed, doesn't clear its cost`] : [];
  const cheaper = value?.status === 'priced' && !losesMoney(finding) && (value.monthly_gain_usd          ) > 0 ? [`about ${money(value.monthly_gain_usd          )} a month cheaper [projected, at ${Number(calls).toLocaleString('en-US')} calls a month, assumed]`] : [];
  return [...pays, ...measured, ...speed, ...cheaper];
}

/** One line per option, named, with its price, source and date. */
function roiOptionText(option           )         {
  return `${option.name} (${option.price_text}; ${option.source}${option.checked ? `, checked ${option.checked}` : ''})${option.line ? `: ${option.line}` : ''}`;
}

/** The founder's question: what it saves, what it costs, when it pays back. Or that there's no money figure. */
function roiLines(value                        )           {
  const roi = value?.roi;
  if (!roi) return [];
  if (!roi.money) return wrapped(`   ${roi.statement}`);
  return [
    ...roi.options.flatMap((option) => wrapped(`   ${roiOptionText(option)}`)),
    ...wrapped(`   ${roi.assumed}`),
    ...wrapped(`   ${roi.formula}.${roi.what_to_enter ? ` ${roi.what_to_enter}` : ''}`),
  ];
}

export function roiSection(value                        )           {
  const roi = value?.roi;
  if (!roi) return [];
  if (!roi.money) return [`**ROI.** ${plainText(roi.statement ?? '')}`, ''];
  return ['**ROI:**', ...roi.options.map((option) => `- ${roiOptionText(option)}`), '', `${roi.assumed}`, '', `${roi.formula}.${roi.what_to_enter ? ` ${roi.what_to_enter}` : ''}`, ''];
}

function formulaLines(value                        )           {
  if (!value) return [];
  if (value.roi) return value.status === 'priced' ? wrapped(`   Value: ${value.formula}`) : [];
  if (value.status !== 'priced') return wrapped(`   No money number: ${value.reason}`);
  const inputs = [value.inputs.input_tokens && `${value.inputs.input_tokens.value} input tokens (${value.inputs.input_tokens.label})`, value.inputs.model && `${value.inputs.model.value} (${value.inputs.model.label})`].filter(Boolean).join('; ');
  const paysBack = value.break_even_calls_per_month ? `Pays back above about ${value.break_even_calls_per_month.toLocaleString('en-US')} calls a month.` : '';
  return [...wrapped(`   Value: ${value.formula}`), ...wrapped(`   Inputs: ${inputs}. ${paysBack}`)];
}

                                                                             
const livePlaces = (item         )                       => (item                                 ).live_places ?? [];
/** A place that sends the model: a price or capability table only lists it, so a table's ids are never counted as use. */
const sendingPlaces = (item         ) => livePlaces(item).filter((place) => !place.catalog);

function retirementLine(run            , retired                    )         {
  const listed = (run.exact ?? []).filter((item) => item.kind === 'model' && livePlaces(item).length > 0);
  const models = listed.filter((item) => sendingPlaces(item).length > 0);
  const gone = models.filter((item) => item.status === 'retired').length;
  const going = models.length - gone;
  const examples = models.filter((item) => sendingPlaces(item).every((place) => place.context === 'example')).length;
  const counted = [gone ? `${gone} model${gone === 1 ? '' : 's'} here ${gone === 1 ? 'has' : 'have'} shut down` : '', going ? `${going} ${gone ? 'more' : `model${going === 1 ? '' : 's'} here`} ${going === 1 ? 'is' : 'are'} retiring` : ''].filter(Boolean).join(' and ');
  // Examples count, but when they're most of the number, it says so.
  const ofThem = examples * 2 > models.length ? `, ${examples} of them only in examples` : '';
  const tableOnly = listed.length - models.length;
  const fallback = tableOnly ? `${tableOnly} retired or retiring model${tableOnly === 1 ? ' is' : 's are'} only listed in a table here` : `${retired.length} retired or retiring model finding${retired.length === 1 ? '' : 's'}`;
  const place = retired[0]?.where[0];
  return `Also: ${counted ? `${counted}${ofThem}` : fallback}${place ? ` · ${fileName(place.file)}:${place.line}` : ''} · ${OFFER}`;
}

const NOTHING_BIG = 'Nothing big fits this week.';
/** With no account no lever was asked about, so it can say only what the pack proves. */
const NOTHING_FROM_PACK = 'The pack alone proves nothing to change here.';
const NOTHING_CLEARS = 'Nothing clears its cost at the assumed volume.';
const TEAM_FULL = 3;
const TEAM_COMPACT = 2;

function teamLines(run            , compact         )           {
  const rows = run.recommendations ?? [];
  if (rows.length === 0) return [];
  const shown = rows.slice(0, compact ? TEAM_COMPACT : TEAM_FULL);
  const more = rows.length - shown.length;
  return ['', 'For your team (never a pull request):', ...shown.flatMap((row) => [...(compact ? [] : [fit(`  ${row.name}: ${row.why}`)]), ...wrapped(`  ${compact ? `${row.name}: ` : ''}${row.install}`, '    ')]), ...(more > 0 ? [`  And ${more} more, in the run file.`] : [])];
}

function teamSection(run            )           {
  const rows = run.recommendations ?? [];
  if (rows.length === 0) return [];
  return ['## For your team', '', 'For your developers\' own tools. Never a pull request.', '', ...rows.flatMap((row) => [`- **${plainText(row.name)}.** ${plainText(row.why)} ${codeSpan(row.install)} Source: ${oneLine(row.source)}`]), ''];
}

function searched(run            )          {
  return run.ran ? run.ran.search : Boolean(run.usage ?? run.profile);
}

function dependencyCounts(run            )                   {
  const dependencies = (run.exact ?? []).filter((item) => item.kind === 'dependency');
  const answered = dependencies.filter((item) => item.status !== undefined && item.status !== 'no-data' && item.status !== 'git');
  return { checked: answered.length, unchecked: dependencies.length - answered.length, behind: answered.filter((item) => item.status === 'behind').length, online: Boolean(run.ran?.online) };
}

/** What a Claude Code run didn't look at, in the words its header and its quiet line both use. */
function notCheckedNotes(run            )           {
  const deps = dependencyCounts(run);
  const total = deps.checked + deps.unchecked;
  const unknown = run.unrecognised;
  return [
    ...(deps.unchecked ? [`${deps.unchecked.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} dependencies not checked (${deps.online ? 'no registry answer' : 'offline'})`] : []),
    ...(unknown?.count ? [`${unknown.count.toLocaleString('en-US')} model ids on ${unknown.files.length === 1 ? fileName(unknown.files[0]) : 'lists'} not recognised`] : []),
  ];
}

export const STOPPED_LINE = "keepup: stopped early, so this can't say that nothing applies";

/** A repo with nothing for keepup to read gets one plain line. A read that stopped early can't say this. */
export function noAiCode(run            )          {
  return !run.incomplete && run.facts?.ai_call_sites?.length === 0 && run.facts?.model_ids?.length === 0;
}

export function noAiLine(files        )         {
  return `keepup: no AI code found here · ${files.toLocaleString('en-US')} file${files === 1 ? '' : 's'} read · nothing to check`;
}

function emptyLine(run            )         {
  if (run.incomplete) return STOPPED_LINE;
  if (run.coverage && noAiCode(run)) return noAiLine(run.facts?.checked?.files ?? 0);
  if (run.client) return clientQuietLine(run.client, run.coverage?.reads ?? 0, notCheckedNotes(run));
  if (run.coverage && searched(run)) return coveredLine(run.db.records, run.coverage, notCheckedNotes(run));
  if (searched(run)) return quietLine(run.db.records);
  return exactOnlyLine(run.facts?.model_ids?.length ?? 0, dependencyCounts(run), retiredModelsHere(run));
}

function cell(text        )         {
  return plainText(text).replace(/\|/g, '\\|');
}

function capitalise(text        )         {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function commitLine(run            )         {
  if (run.base_commit) return `Uncommitted changes on top of ${run.base_commit.slice(0, 7)}`;
  const short = run.commit ? run.commit.slice(0, 7) : 'working tree';
  const when = run.commit_date ? ` (${humanDate(run.commit_date)})` : '';
  return `Commit ${short}${when}`;
}

const STALE_DATA_DAYS = 7;

/**
 * One line when the data is more than a week older than the day it was checked against, since anything since isn't in it.
 * It gives the age, not the day checked: that is a UTC date, and a day off from the calendar of a reader far from UTC.
 */
function staleDataLines(run            )           {
  const dataDate = run.client?.pack.as_of || run.db.fetched;
  if (!run.as_of || addDays(dataDate, STALE_DATA_DAYS) >= run.as_of) return [];
  const days = Math.round((Date.parse(run.as_of) - Date.parse(dataDate)) / 86_400_000);
  return [`${run.client ? 'The pack' : 'The database'} is from ${humanDate(dataDate)}, ${days} days before this check: anything since then isn’t in it.`];
}

function header(run            )           {
  return [`# keepup brief: ${oneLine(run.repo)}`, '', `${commitLine(run)}. Database as of ${humanDate(run.db.fetched)}.`, ...staleDataLines(run), ''];
}

function profileSection(profile         )           {
  const jobs = profile.jobs.map((job) => {
    const where = job.where.map((place) => `${fileName(place.file)}:${place.line}`).join(', ');
    return `| ${cell(job.job)} | ${cell(job.how)} | ${where} |`;
  });
  return [
    '## What we understood', '',
    `**The product.** ${plainText(profile.one_liner)}`, '',
    `**The stack.** ${profile.stack.map(plainText).join(', ')}`, '',
    '**The AI jobs in the code:**', '',
    "| Job | How it's done today | Where |", '| --- | --- | --- |', ...jobs, '',
    '**Stack lock.** keepup only considers:', ...profile.stack_lock.map((item) => `- ${plainText(item)}`), '',
  ];
}

/** A repo's file name is its own kind of untrusted text. */
function fileName(file        )         {
  return plainText(file);
}

function placeText(place                          )         {
  return `${fileName(place.file)}:${place.line}${place.text ? ` ${codeSpan(place.text)}` : ''}`;
}

function whereLines(finding         )           {
  if (finding.where.length === 1) return [`**Where.** ${placeText(finding.where[0])}`, ''];
  return ['**Where:**', ...finding.where.map((w) => `- ${placeText(w)}`), ''];
}

function optionLines(finding         )           {
  if (finding.options.length === 0) return [];
  const rows = finding.options.map((option) => `| ${cell(option.name)} | ${cell(option.what)} | ${option.needs ? `${cell(option.needs)} ` : ''}|`);
  return ['**The options:**', '', '| Option | What it is | Needs |', '| --- | --- | --- |', ...rows, ''];
}

function sourceLines(sources                   )           {
  if (sources.length === 1) return [`**Source.** ${oneLine(sources[0])}`, ''];
  return ['**Sources:**', ...sources.map((source) => `- ${oneLine(source)}`), ''];
}

/** Where the repo already uses what the lever offers. The value is the lever's, the place the repo's, and both are only data here. */
function inUseSentence(inUse       )         {
  const at = `${fileName(inUse.file)}:${inUse.line}`;
  const value = plainText(inUse.value);
  if (inUse.kind === 'dependency') return `Extend the ${value} you already use in ${at}.`;
  return `Extend what you already use: ${at} ${inUse.kind === 'env' ? 'reads' : 'has'} ${value}.`;
}

const ALREADY_SET_UP = 'the account and key already exist, so there\'s no new vendor to set up';

function findingSection(finding         , index        )           {
  return [
    `### ${finding.rank ?? index + 1}. ${plainText(finding.title)} · ${finding.effect.join(', ')}`, '',
    ...(finding.in_use ? [`**In use.** ${inUseSentence(finding.in_use)} For the ROI, ${ALREADY_SET_UP}.`, ''] : []),
    ...roiSection(finding.value),
    ...(finding.value?.status === 'priced' ? [`**Value.** ${oneLine(finding.value.formula)}. Inputs: ${Object.entries(finding.value.inputs).map(([key, input]) => `${key} ${input.value} (${input.label})`).join('; ')}.`, ''] : finding.value?.reason && !finding.value.roi ? [`**Value.** No money number: ${plainText(finding.value.reason)}`, ''] : []),
    ...(finding.value?.speed ? [`**Speed.** ${finding.value.speed.text} [${finding.value.speed.label}].`, ''] : []),
    ...whereLines(finding),
    `**Why it fits.** ${plainText(finding.why)}`, '',
    ...optionLines(finding),
    `**Proof.** ${capitalise(finding.proof)}.`, '',
    `**Effort.** ${finding.effort}.`, '',
    ...sourceLines([...new Set([...finding.sources, ...finding.options.map((option) => option.source)])].filter(Boolean)),
    ...(finding.pr ? [`**Pull request.** ${oneLine(finding.pr)}`, ''] : []),
  ];
}

/** What can be adopted. A retirement isn't counted here: it has its own line. */
function fitCount(run            )         {
  return run.findings.filter((finding) => !isRetirement(finding)).length;
}

function shortOfSearch(run            )         {
  if (!run.ran?.judge) return "The search and the judge didn't run.";
  return run.coverage?.candidates === undefined ? "The searches fell short, so this doesn't count as compared with the database." : "Some of keepup's bundles went unread, so this doesn't count as compared with the database.";
}

function checkedLine(run            )         {
  if (run.client) return clientCheckedLine(run.client, run.coverage?.reads ?? 0, notCheckedNotes(run), fitCount(run));
  if (!searched(run)) {
    const deps = dependencyCounts(run);
    const counted = deps.unchecked ? `${deps.checked + deps.unchecked} dependencies, ${deps.unchecked} of them not checked` : `${deps.checked} dependencies`;
    return `Exact checks only: ${run.facts?.model_ids?.length ?? 0} model ids and ${counted}. ${shortOfSearch(run)} ${fitCount(run)} fit.`;
  }
  if (run.coverage) return `${[`Compared with a database of ${run.db.records.toLocaleString('en-US')}`, ...ranWords(run.coverage), ...notCheckedNotes(run)].join(' · ')}. ${fitCount(run)} fit.`;
  const sources = Object.keys(run.db.by_source).length;
  return `Compared with ${run.db.records.toLocaleString('en-US')} new or updated things from ${sources} sources, fetched ${humanDate(run.db.fetched)}. ${fitCount(run)} fit.`;
}

function findingsSection(run            )           {
  const levers = run.findings.filter((finding) => !isRetirement(finding));
  const retired = run.findings.filter(isRetirement);
  const lead = levers[0];
  const heading = lead ? (losesMoney(lead) ? `${NOTHING_CLEARS} Closest: ${plainText(lead.title)}` : `Biggest lever: ${plainText(lead.title)}`) : NOTHING_BIG;
  return [
    `## ${heading}`, '',
    ...(lead && effectLine(lead, run) ? [effectLine(lead, run), ''] : []),
    `## ${checkedLine(run)}`, '',
    ...(run.rank_explanation ? [run.rank_explanation, ''] : []),
    ...levers.flatMap(findingSection),
    ...(retired.length ? [retirementLine(run, retired), ''] : []),
  ];
}

function watchingSection(watching                     )           {
  if (watching.length === 0) return [];
  return [
    '## Watching', '', "These fit a job you have, but aren't ready to recommend.", '',
    ...watching.map((item) => `- **${plainText(item.thing)}.** ${plainText(item.why)} Source: ${oneLine(item.source)}`), '',
  ];
}

const HELD_BACK_ROWS = 15;

/** One screen: the rest stay in the run file. */
function heldBackSection(heldBack                     )           {
  if (heldBack.length === 0) return [];
  const rest = heldBack.length - HELD_BACK_ROWS;
  const rows = heldBack.slice(0, HELD_BACK_ROWS).map((item) => `| ${cell(item.thing)} | ${item.date ? humanDate(item.date) : '—'} | ${cell(item.reason)} |`);
  return ['## Checked and held back', '', "| Thing | Date | Why it's held back |", '| --- | --- | --- |', ...rows, '', ...(rest > 0 ? [`And ${rest} more, in the run file.`, ''] : [])];
}

const CATEGORIES                              = [
  // First, and anchored, because the rest of this row is the finding's own title, which can hold any of the words below.
  [/^the session left out /, 'the session left out what the program proved, so it stays'],
  [/reads like an instruction|reads like a command|tells a founder to adopt/, 'it read like an instruction from the repo'],
  [/\blink\b|\bmarkup\b|isn't from any record or lever/, 'it had a link no record gives'],
  [/\bpackage\b|\bthe name\b/, 'it named a package no record gives'],
  [/^its shape\b/, 'its shape wasn\'t what verify takes'],
  [/\bwording\b/, 'its wording'],
  [/\bquote\b|that line says|not in the repo|no line|no quoted text|file and line|doesn't say that|citations/, 'its place in the code didn\'t hold up'],
  [/caching setting/, 'it broke a rule of the judge\'s own'],
  [/\bversion\b|\bmodel id\b|can't be read|\bdeadline\b|shutdown|announcement|price/, 'a number, date or name no source holds'],
  [/says what|promise|sources don't say/, 'a claim its source doesn\'t make'],
  [/effect word|proof|"keeps working"|"new capability"|gain|effort word|measures nothing/, 'a label that doesn\'t fit'],
  [/stays, because|sends nothing|isn't on this finding/, 'a judge\'s call the program overruled'],
];

/** Why something was dropped, in words the program chose. The rejected text itself stays in the run file. */
export function droppedCategory(item                      )         {
  return CATEGORIES.find(([re]) => re.test(item.why))?.[1] ?? 'a check failed';
}

const SAFE_TOKEN = /^(?:[$\d.,%xXKMB]{1,24}|\d{1,2} [A-Z][a-z]{2}(?: \d{4})?|--\d\d-\d\d)$/;

/** Which number it was and where it was looked for, so a true one can be cited. Only a number or a date: the rest of a rejected sentence stays in the run file. */
export function droppedDetail(item                      )                {
  const token = item.why.match(/^(.{1,24}) can't be read from any source$/)?.[1];
  return token && SAFE_TOKEN.test(token) ? `${token} isn't in its sources or on a line it cites` : null;
}

export function droppedLine(item         )         {
  const detail = droppedDetail(item);
  return `${item.lever ? `${oneLine(item.lever)}, ` : ''}${item.where ? `${oneLine(item.where)}: ` : ''}${droppedCategory(item)}${detail ? `: ${detail}` : ''}`;
}

/** A lever the checks took out is said by name. It's the point of the brief, so it comes first and survives a short screen. */
function droppedLevers(checks              )            {
  return checks.dropped.filter((item) => item.lever);
}

function droppedFirst(checks              )            {
  return [...droppedLevers(checks), ...checks.dropped.filter((item) => !item.lever)];
}

function droppedSection(checks              )           {
  if (checks.dropped.length === 0) return [];
  return ['## Dropped by the checks', '', ...droppedFirst(checks).map((item) => `- ${droppedLine(item)}`), ''];
}

function incompleteSection(run            )           {
  if (!run.incomplete) return [];
  return ['## Incomplete', '', plainText(run.incomplete.reason), '', ...run.incomplete.skipped.map((item) => `- ${plainText(item)}`), ''];
}

function finish(lines                   )         {
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderBrief(run            )         {
  const tail = [...heldBackSection(run.held_back), ...droppedSection(run.checks), ...incompleteSection(run)];
  if (run.findings.length === 0 && run.watching.length === 0) {
    return finish([emptyLine(run), ...(tail.length ? ['', ...tail] : [])]);
  }
  return finish([
    ...header(run),
    ...(run.profile ? profileSection(run.profile) : []),
    ...findingsSection(run),
    ...teamSection(run),
    ...watchingSection(run.watching),
    ...tail,
  ]);
}

const IN_FULL = 3;
const SUMMARY_HELD = 1;
const SUMMARY_WATCHING = 1;
const SUMMARY_DROPPED = 2;
const MAX_LINE = 118;
const SUMMARY_PLACES = 2;
const HELD_LINES = 2;
export const OFFER = 'want the change?';

/** Cuts at a word, so what's left still reads. */
function atWord(text        , room        )         {
  if (text.length <= room) return text;
  const cut = text.slice(0, Math.max(0, room - 3));
  const space = cut.lastIndexOf(' ');
  return `${(space > room / 2 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

function fit(text        )         {
  return atWord(oneLine(text), MAX_LINE);
}

const WRAP_INDENT = '       ';

/** An action or a reason is never cut: it carries on, indented, on the next line. */
function wrapped(text        , indent = WRAP_INDENT)           {
  const flat = oneLine(text).trimEnd();
  const lead = flat.match(/^ */)?.[0] ?? '';
  const out           = [];
  let line = '';
  for (const word of flat.trimStart().split(/ +/)) {
    if (line && line.length + word.length + 1 > MAX_LINE) {
      out.push(line);
      line = `${indent}${word}`;
    } else line = line ? `${line} ${word}` : `${lead}${word}`;
  }
  return [...out, line];
}

const DO_LINES = 2;

/** As many whole sentences as fit in two lines, and always the first, whatever its length. A sentence is never cut; the rest stays in the run file. */
function wholeSentences(text        )           {
  const all = wrapped(text);
  if (all.length <= DO_LINES) return all;
  const [first, ...rest] = oneLine(text).split(/(?<=[.!?])\s+(?=[A-Z])/);
  let kept = first;
  for (const sentence of rest) {
    if (wrapped(`${kept} ${sentence}`).length > DO_LINES) break;
    kept = `${kept} ${sentence}`;
  }
  return wrapped(kept);
}

/** Up to this many lines, for what isn't an action: a held-back row can run long, and the run file holds all of it. */
function wrappedUpTo(text        , lines        )           {
  const all = wrapped(text, '  ');
  if (all.length <= lines) return all;
  const whole = wholeSentences(text).map((line) => line.replace(/^ {7}/, '  '));
  return whole.length <= lines ? whole : [...all.slice(0, lines - 1), atWord(all.slice(lines - 1).join(' '), MAX_LINE)];
}

/** What has to survive goes in `tail`, and the head gives way. */
function fitWithTail(head        , tail        )         {
  const flatTail = oneLine(tail);
  return `${atWord(oneLine(head), MAX_LINE - flatTail.length)}${flatTail}`;
}

function labels(finding         )         {
  return `${finding.effect.join(', ')} · ${finding.proof} · ${finding.effort}`;
}

/** gpt-4-turbo, o3-mini to gpt-5.6-sol; o4-mini to gpt-5.6-terra: only ids in this repo, and where each goes. */
function movesText(moves                 )         {
  const groups = new Map                  ();
  for (const move of moves) groups.set(move.to.join(' or '), [...(groups.get(move.to.join(' or ')) ?? []), move.from]);
  const parts = [...groups].sort(([a], [b]) => Number(!a) - Number(!b)).map(([to, from]) => (to ? `${from.join(', ')} to ${to}` : `${from.join(', ')} ${from.length === 1 ? 'has' : 'have'} no successor named`));
  return parts.join('; ');
}

/** A move is a retirement's: a lever finding at the same line keeps its own options, so its Do never names a successor. */
function movesOf(finding         , run            )         {
  if (finding.sdk_unverified || finding.lever) return [];
  const places = new Set(finding.where.map((place) => `${place.file}:${place.line}`));
  return (run.moves ?? []).filter((move) => move.places.some((place) => places.has(place)));
}

function sourceLine(source        )           {
  return wrapped(`       ${source}`);
}

/** What to do, for each option: its name, how, and the vendor's number where the option carries it. The ids in this repo, when the program knows them. */
function doLines(finding         , run            )           {
  const moves = movesOf(finding, run);
  const firstSource = finding.options[0]?.source;
  if (moves.length) return [...wrapped(`   Do: ${movesText(moves)}`), ...(firstSource && firstSource !== finding.sources[0] ? sourceLine(firstSource) : [])];
  const shown = new Set([finding.sources[0]]);
  // With an SDK in the way, "move to the successor" is the very thing that isn't safe to say alone.
  const named = finding.sdk_unverified ? undefined : successors(finding.why);
  return finding.options.filter((option) => !option.needs.startsWith(AFTER_UPGRADE)).flatMap((option) => {
    const whole = oneLine(`   Do: ${optionName(option.name, finding)}: ${option.what}`);
    // Too long for a line, and the finding already knows the one thing to act on.
    const line = wholeSentences(named && whole.length > MAX_LINE ? `   Do: move to ${named}` : whole);
    if (!option.source || shown.has(option.source)) return line;
    shown.add(option.source);
    return [...line, ...sourceLine(option.source)];
  });
}

const NAMED_SUCCESSOR = /Named successor: (.+?)\.(?:\s|$)/;
const ITSELF_SHUT_DOWN = /(\S+) was itself shut down[^.]*(?:\.\d[^.]*)*\.(?: \w+ names (\S+) after it\.)?/g;

/** What to move to, across every model a finding groups. A successor that was itself shut down gives way to the one its maker names after it, or to nothing. */
function successors(why        )                     {
  const named = [...why.matchAll(new RegExp(NAMED_SUCCESSOR, 'g'))].flatMap((match) => match[1].split(' or '));
  if (named.length === 0) return undefined;
  const chain = new Map([...why.matchAll(ITSELF_SHUT_DOWN)].map((match) => [match[1], match[2]]));
  const live = named.flatMap((model) => (chain.has(model) ? (chain.get(model) ? [chain.get(model)          ] : []) : [model]));
  return live.length ? [...new Set(live)].join(' or ') : undefined;
}

const CHECK_FIRST = /Check before switching[^"]*"([^"]+)"/;

const LATEST = /The latest is (\d[\w.-]*\w)/;

/** An option that says "the named successors" says which, since that's what someone acts on. */
function optionName(name        , finding         )         {
  const named = finding.why.match(NAMED_SUCCESSOR)?.[1];
  return named ? name.replace(/\bthe named successors?\b/i, named) : name;
}

/** With no options: the successor a provider names, the version a library is at, or else what the finding says first. */
function plainDo(finding         )           {
  const named = successors(finding.why) ?? finding.why.match(LATEST)?.[1];
  const first = finding.why.split(/(?<=[.!?])\s+/)[0] ?? '';
  return wrapped(`   Do: ${named ? `move to ${named}` : first}`);
}

function checkLine(finding         )           {
  const caveat = finding.why.match(CHECK_FIRST)?.[1];
  const sdk = finding.sdk_unverified;
  return [
    ...(caveat ? wrapped(`   Check first: ${caveat}`) : []),
    ...(sdk ? wrapped(`   Not ruled out: this repo's text has no ${sdk.identifier}, but ${sdk.sdks.join(' and ')} can send it themselves. Not verified on those versions.`) : []),
  ];
}

function placesLine(finding         , shown        )         {
  const places = finding.where.slice(0, shown).map((place) => `${fileName(place.file)}:${place.line}`);
  const more = finding.where.length - places.length;
  return fit(`   ${places.join(', ')}${more > 0 ? ` and ${more} more` : ''}`);
}

function fullFinding(finding         , index        , run            )           {
  const showSum = index === 0;
  return [
    fit(`${finding.rank ?? index + 1}. ${finding.title}`),
    fit(`   ${labels(finding)}`),
    ...(index > 0 && effectLine(finding, run) ? wrapped(`   ${effectLine(finding, run)}`) : []),
    ...roiLines(finding.value),
    ...(showSum ? formulaLines(finding.value) : []),
    placesLine(finding, SUMMARY_PLACES),
    fit(`   ${finding.sources[0] ?? ''}`),
    ...(finding.options.length ? doLines(finding, run) : plainDo(finding)),
    ...checkLine(finding),
  ];
}

/** One line for what to do: the first option's source goes with it, so a link is never lost to the width of a line. */
function shortDo(finding         , run            )           {
  if (finding.options.length === 0) return plainDo(finding);
  const source = finding.options[0].source;
  const moves = movesOf(finding, run);
  const names = moves.length ? movesText(moves) : finding.options.map((option) => optionName(option.name, finding)).join(' or ');
  return wrapped(`   Do: ${names} · ${source}`);
}

/** Further down a full screen: the lines alone, saying their inputs are assumed. The lead lever always prints all of it. */
function roiShort(value                        )           {
  const roi = value?.roi;
  if (!roi) return [];
  return roi.money ? roi.options.flatMap((option) => wrapped(`   ${option.name}: ${option.line ?? 'enter your model and calls a month'} (assumed inputs, in the run file)`)) : wrapped(`   ${roi.statement}`);
}

/** Past the top three: one line of labels, the first place, and what to do. Every finding says where. */
function shortFinding(finding         , index        , run            )           {
  return [fitWithTail(`${finding.rank ?? index + 1}. ${finding.title}`, ` · ${labels(finding)}`), ...(index === 0 ? roiLines(finding.value) : roiShort(finding.value)), placesLine(finding, 1), ...shortDo(finding, run), ...checkLine(finding)];
}

function summaryTail(run            , compact         )           {
  const watching = compact ? [] : run.watching.slice(0, SUMMARY_WATCHING).map((item) => fit(`  ${item.thing}: ${item.why}`));
  const held = compact ? [] : run.held_back.slice(0, SUMMARY_HELD).flatMap((item) => wrappedUpTo(`  ${item.thing}: ${item.reason}`, HELD_LINES));
  const dropped = (compact ? droppedLevers(run.checks) : droppedFirst(run.checks)).slice(0, SUMMARY_DROPPED).map((item) => fit(`  ${droppedLine(item)}`));
  const counted = [
    ...(run.watching.length ? [compact ? `Watching: ${run.watching.length}, in the run file.` : 'Watching:', ...watching] : []),
    ...(run.held_back.length ? [`Checked and held back: ${run.held_back.length}, in the run file.${held.length ? ' The first:' : ''}`, ...held] : []),
    ...(run.checks.dropped.length ? [`Dropped by the checks: ${run.checks.dropped.length}.`, ...dropped] : []),
    ...(run.incomplete ? [fit(`Incomplete: ${run.incomplete.reason}`)] : []),
  ];
  return counted.length ? ['', ...counted] : [];
}

/** Quiet means the line alone. What was held back stays in the run file; only something that went wrong is said aloud. */
function quietTail(run            )           {
  const dropped = droppedFirst(run.checks).slice(0, SUMMARY_DROPPED).map((item) => fit(`  ${droppedLine(item)}`));
  return [
    ...(dropped.length ? ['', `Dropped by the checks: ${run.checks.dropped.length}.`, ...dropped] : []),
    ...(run.incomplete ? ['', fit(`Incomplete: ${run.incomplete.reason}`)] : []),
  ];
}

const SCREEN_LINES = 40;
/** The fullest shape that fits: the tail comes down to counts first, then fewer findings get their whole block. Nothing is cut to get there. */
const SHAPES                                                                    = [{ inFull: IN_FULL, compact: false }, { inFull: IN_FULL, compact: true }, { inFull: 2, compact: true }, { inFull: 1, compact: true }, { inFull: 0, compact: true }];

function retiredLines(run            , inFull        , compact         )           {
  const retired = run.findings.filter(isRetirement);
  return [
    `keepup: ${oneLine(run.repo)} · ${commitLine(run)}`,
    ...wrapped(checkedLine(run)),
    ...retired.slice(0, inFull).flatMap((finding, index) => fullFinding(finding, index, run)),
    ...retired.slice(inFull).flatMap((finding, index) => shortFinding(finding, index + inFull, run)),
    ...summaryTail(run, compact),
    ...(retired.length ? ['', OFFER] : []),
  ];
}

const WHAT_KEEPUP_DOES = 'keepup reads your code, checks it against a database of AI changes, and offers the few worth making.';
const FULL_SUM = 'Each sum in full, with what it assumes: keepup get verified.findings';
const TABLE_CAPS = { effect: 46, effort: 20, proof: 18 }         ;
/** The table is the one thing that can't wrap and still read, so it fits an 80-column terminal. */
const TABLE_LINE = 80;
const TABLE_MINS = { change: 12, effect: 20, effort: 10, proof: 10 }         ;
                                                                                                                                             

/** Narrows the change first (the block below has the whole title), then effort and proof, and the effect last, since a cut effect loses its source label. */
function fitTable(widths             )              {
  const keys = ['change', 'effort', 'proof', 'effect']         ;
  const room = (w             ) => TABLE_LINE - 9 - w.n - keys.reduce((sum, key) => sum + w[key], 0);
  let w = widths;
  while (room(w) < 0) {
    const key = keys.find((k) => w[k] > TABLE_MINS[k]);
    if (!key) break;
    w = { ...w, [key]: w[key] - 1 };
  }
  return w;
}

/** The number keepup can source, labelled; else a plain phrase from the record. Never a number it made up. */
function effectCell(finding         , run            )         {
  const sourced = effectParts(finding, run)[0];
  if (sourced) return sourced.replace(/ \[projected, at [^\]]*\]/, ' [projected]').replace(/ cheaper \[projected\]$/, ' [projected]');
  const roi = finding.value?.roi;
  const best = roi?.money ? roi.options.filter((option) => (option.monthly_usd ?? 0) > 0).sort((a, b) => (b.monthly_usd ?? 0) - (a.monthly_usd ?? 0))[0] : undefined;
  if (best) return `about ${money(best.monthly_usd          )} a month [projected${roi?.basis === 'example' ? ', example' : ''}]`;
  return finding.value?.lever_gain ?? finding.effect.join(', ');
}

const pad = (text        , width        ) => text.padEnd(width);

function tableLines(levers                    , run            )           {
  const rows = levers.map((lever, index) => ({ n: String(lever.rank ?? index + 1), change: oneLine(lever.title), effect: oneLine(effectCell(lever, run)), effort: oneLine(lever.effort), proof: oneLine(lever.proof) }));
  const width = (key                                                , head        , cap = MAX_LINE) => Math.min(cap, Math.max(head.length, ...rows.map((row) => row[key].length)));
  const fixed = { n: width('n', '#'), effect: width('effect', 'Effect', TABLE_CAPS.effect), effort: width('effort', 'Effort', TABLE_CAPS.effort), proof: width('proof', 'Proof', TABLE_CAPS.proof) };
  const w = fitTable({ ...fixed, change: width('change', 'Change') });
  const line = (n        , change        , eff        , effort        , proof        ) => ` ${n.padStart(w.n)}  ${pad(atWord(change, w.change), w.change)}  ${pad(atWord(eff, w.effect), w.effect)}  ${pad(atWord(effort, w.effort), w.effort)}  ${atWord(proof, w.proof)}`.trimEnd();
  return ['Ranked by fit to your code, best first:', line('#', 'Change', 'Effect', 'Effort', 'Proof'), ...rows.map((row) => line(row.n, row.change, row.effect, row.effort, row.proof))];
}

const DECISION = /decision[ -]?model|label-picking/i;
const GATE = /\b(?:below|above|under|over) (an? (?:confidence|threshold|score)[^.;,]*?\d?\.?\d+%?)/i;

/** A decision model's call: it answers with a confidence, and the code it replaces still runs below the gate. */
function decisionPrefix(finding         )         {
  if (!DECISION.test(`${finding.lever ?? ''} ${finding.title}`)) return '';
  const gate = `${finding.options.map((option) => option.what).join(' ')} ${finding.why}`.match(GATE)?.[1];
  return `it returns a confidence; today's call stays the fallback below ${gate ?? 'the gate the lever sets'}. `;
}

/** Each option in the record's own words, with its source where it isn't the lever's. A decision model says how it gates first. */
function whatLines(finding         , trim = false)           {
  const options = finding.options.filter((option) => !option.needs.startsWith(AFTER_UPGRADE));
  const gate = decisionPrefix(finding);
  if (options.length === 0) return wrapped(`   What it does: ${gate}${plainDo(finding).join(' ').replace(/^ {3}Do: /, '')}`);
  const shown = new Set([finding.sources[0]]);
  // A decision model's gate is its own line, so the options under it are never cut to make room.
  const label = (index        ) => (index > 0 ? 'Or: ' : gate ? 'Option: ' : 'What it does: ');
  return [...(gate ? wrapped(`   What it does: ${gate.trimEnd()}`) : []), ...options.flatMap((option, index) => {
    const line = wholeSentences(`   ${label(index)}${optionName(option.name, finding)}: ${option.what}`);
    if (trim || !option.source || shown.has(option.source)) return line;
    shown.add(option.source);
    return [...line, ...sourceLine(option.source)];
  })];
}

function whereLine(finding         )         {
  const [place] = finding.where;
  if (!place) return '   Where: no single line; see the source';
  const more = finding.where.length - 1;
  return fitWithTail(`   Where: ${fileName(place.file)}:${place.line}${place.text ? `, ${oneLine(place.text).trim()}` : ''}`, more > 0 ? ` (and ${more} more)` : '');
}

/** The one-line ROI per option, and the model it's priced on: the code's, or an example, said plainly. */
function roiBlock(finding         , run            , trim = false)           {
  const value = finding.value;
  const roi = value?.roi;
  if (!roi && value?.status === 'priced') return wrapped(`   ROI: ${effectParts(finding, run).filter((part) => !part.endsWith(`[${value.speed?.label}]`)).join(' · ') || money(value.value_usd ?? 0)}`);
  if (!roi) return value?.status === 'no_number' && value.reason ? wrapped(`   ROI: no money number: ${value.reason}`) : [];
  if (!roi.money) return wrapped(`   ROI: ${roi.statement}`);
  const sent = roi.model?.label.match(/sends (\S+) \(read at/)?.[1];
  const basis = !roi.model ? [] : roi.basis === 'example' ? [`Priced on an example model, ${roi.model.id}, because there's no price on file for ${sent ?? 'the model this code sends'}: enter the model this call really uses and your calls a month.`] : [`Priced on ${roi.model.id}, ${roi.model.label}.`];
  // A source the block already prints isn't printed again: the price and its date stay with the sum.
  const printed = new Set([finding.sources[0], ...finding.options.map((option) => option.source)]);
  if (trim) return roi.options.flatMap((option) => wrapped(`   ROI: ${option.name}: ${option.line ?? 'enter your model and calls a month'}`));
  const text = (option           ) => (printed.has(option.source) ? `${option.name} (${option.price_text}${option.checked ? `, checked ${option.checked}` : ''})${option.line ? `: ${option.line}` : ''}` : roiOptionText(option));
  return [...roi.options.flatMap((option) => wrapped(`   ROI: ${text(option)}`)), ...basis.flatMap((line) => wrapped(`   ${line}`)), ...(roi.what_to_enter && roi.basis !== 'example' ? wrapped(`   ${roi.what_to_enter}`) : [])];
}

/** Trimmed, it keeps What it does, Where, one ROI line per option, Source and Next: never the lever itself. */
function leverBlock(finding         , index        , run            , trim = false)           {
  const n = finding.rank ?? index + 1;
  const source = finding.sources[0] ?? finding.options[0]?.source;
  return ['', fit(`${n}. ${finding.title}`), ...inUseLine(finding), ...whatLines(finding, trim), ...checkLine(finding), whereLine(finding), ...inUseRoi(finding), ...roiBlock(finding, run, trim), ...(source ? wrapped(`   Source: ${source}`) : []), `   Next: ${APPLY[run.host ?? 'claude']} ${n}`];
}

/** Said first, because it changes how the rest of the block reads: extend what's there, not adopt something new. */
function inUseLine(finding         )           {
  return finding.in_use ? wrapped(`   In use: ${inUseSentence(finding.in_use)}`) : [];
}

function inUseRoi(finding         )           {
  return finding.in_use ? wrapped(`   ROI: ${ALREADY_SET_UP}.`) : [];
}

/** The best option's own ROI line, as roiBlock prints it, with its [projected] label. */
function breakEven(lever         )         {
  const roi = lever.value?.roi;
  if (!roi?.money) return '';
  const best = roi.options.filter((option) => option.line).sort((a, b) => (b.monthly_usd ?? 0) - (a.monthly_usd ?? 0))[0];
  return best ? `${best.name}: ${best.line}` : '';
}

function sessionLead(lever         , run            )           {
  if (!losesMoney(lever)) return wrapped(`${run.client && noLeverServed(run.client) ? 'Biggest finding' : 'Biggest lever'}: ${lever.title}`);
  // Under the honest heading, only the break-even says why; the table carries the rest.
  const effect = lever.value?.status === 'priced' ? effectLine(lever, run) : breakEven(lever);
  return [...wrapped(`${NOTHING_CLEARS} Closest: ${lever.title}`), ...(effect ? wrapped(effect, '  ') : [])];
}

/** How much a summary sheds to fit: 1 drops the team lines, 2 the counts too, 3 the retirement line too. Trim shortens the lead block last. */
                                                                                                                                                    

/**
 * With no levers at all: "Nothing big fits", unless no account means levers were never asked about. Then the pack's own
 * biggest finding leads, a retired model if there is one, and the line that would have said "Also" isn't repeated.
 */
function noLeverLead(run            , retired                    )           {
  if (!run.client || !noAccount(run.client)) return [NOTHING_BIG];
  // The offer closes the brief, so the lead doesn't ask it as well.
  return retired.length ? wrapped(retirementLine(run, retired).replace(/^Also: /, 'Biggest finding: ').replace(` · ${OFFER}`, '')) : [NOTHING_FROM_PACK];
}

function summaryLines(run            , { inFull, compact, rest, shed, trim }              )           {
  const levers = run.findings.filter((finding) => !isRetirement(finding));
  const retired = run.findings.filter(isRetirement);
  const unshown = levers.length - inFull;
  const retiredLeads = levers.length === 0 && Boolean(run.client && noAccount(run.client));
  return [
    `keepup: ${oneLine(run.repo)} · ${commitLine(run)} · ${run.client ? packHeader(run.client) : `database as of ${humanDate(run.db.fetched)}`}`,
    ...staleDataLines(run),
    WHAT_KEEPUP_DOES,
    ...wrapped(checkedLine(run)),
    '',
    ...(levers.length ? [...sessionLead(levers[0], run), ...tableLines(levers, run)] : noLeverLead(run, retired)),
    ...levers.slice(0, inFull).flatMap((finding, index) => leverBlock(finding, index, run, trim)),
    ...(rest ? levers.slice(inFull).flatMap((finding, index) => shortFinding(finding, index + inFull, run)) : []),
    ...(levers.length ? ['', fit(`${!rest && unshown > 0 ? `${inFull ? `The other ${unshown} are` : 'Each one is'} in the table above. ` : ''}${FULL_SUM}`)] : []),
    ...(retired.length && shed < 3 && !retiredLeads ? ['', ...wrapped(retirementLine(run, retired))] : []),
    ...(shed < 1 ? teamLines(run, compact) : []),
    ...(shed < 2 ? summaryTail(run, compact) : run.incomplete ? ['', fit(`Incomplete: ${run.incomplete.reason}`)] : []),
    ...(run.client ? heldByServer(run.client) : []),
    ...costLines(run),
    ...(run.findings.length ? ['', ...(!run.client && measureOffer(levers) ? [measureOffer(levers)] : []), OFFER] : []),
    ...(run.client ? accountLines(run.client) : []),
  ];
}

/** Only what keepup counted itself. No token estimate and no dollars: the session's tokens and the person's plan never reach keepup. */
function sessionCostText(cost             )         {
  const minutes = cost.minutes === undefined ? '' : cost.minutes < 1 ? ' in under a minute since prepare' : ` over ${Math.round(cost.minutes).toLocaleString('en-US')} min since prepare`;
  return `Cost: keepup printed ${howMany(cost.chars, 'character')} into this session (${howMany(cost.bundles, 'bundle')}, ${howMany(cost.windows, 'code window')})${minutes}.`;
}

function inWords(parts                   )         {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('');
}

/** What the run's own calls to Claude used, as the API counted it, at the list price it records with its source. */
function apiCostText({ usage }         )         {
  const counts                                         = [[usage.input_tokens, 'input tokens'], [usage.cache_creation_input_tokens ?? 0, 'cache writes'], [usage.cache_read_input_tokens ?? 0, 'cache reads'], [usage.output_tokens, 'output tokens']];
  const used = counts.filter(([count, word]) => count > 0 || word === 'input tokens' || word === 'output tokens').map(([count, word]) => `${count.toLocaleString('en-US')} ${word}`);
  const calls = usage.calls ? `, over ${howMany(usage.calls, 'call')}` : '';
  const replayed = usage.replayed_calls ? ` ${howMany(usage.replayed_calls, 'answer')} came from the cache and cost nothing this time.` : '';
  return `Cost: ${inWords(used)} on ${usage.model}${calls}: $${usage.usd.toFixed(2)} at list price (${usage.price_source}).${replayed}`;
}

/** The closing lines on what this run cost, before the offer, so the question stays last. */
function costLines(run            )           {
  const cost = run.cost;
  if (!cost) return [];
  if (cost.kind === 'api') return ['', ...wrapped(apiCostText(cost))];
  return ['', ...wrapped(sessionCostText(cost)), `Your own token use, which keepup can't see, is in ${OWN_USE[run.host ?? 'claude']}.`];
}

function measureOffer(levers                    )         {
  const first = levers.find((lever) => lever.value?.measurable);
  return first ? `Measure it on your own prompt, on your key: keepup measure . --finding ${first.rank ?? 1}` : '';
}

/** What "Also" stands for, only when someone asks: each retired or retiring model with where it is and what to do. Never the brief itself. */
export function renderRetired(run            )         {
  const shaped = SHAPES.map(({ inFull, compact }) => retiredLines(run, inFull, compact));
  return finish(shaped.find((lines) => lines.length <= SCREEN_LINES) ?? (shaped.at(-1)            ));
}

// The top lever always keeps its block: the rest go to the table, then the tail goes, then the block is trimmed.
const SUMMARY_SHAPES                          = [
  ...SHAPES.filter(({ inFull }) => inFull > 0).map(({ inFull, compact }) => ({ inFull, compact, rest: true, shed: 0, trim: false })),
  ...SHAPES.filter(({ inFull, compact }) => inFull > 0 && compact).map(({ inFull }) => ({ inFull, compact: true, rest: false, shed: 0, trim: false })),
  ...[1, 2, 3].map((shed) => ({ inFull: 1, compact: true, rest: false, shed, trim: false })),
  { inFull: 1, compact: true, rest: false, shed: 3, trim: true },
];

/** One screen: the top findings with where and source, the rest shorter, and a count of what was held back. */
export function renderSummary(run            )         {
  // A repo with no AI code keeps its one line: there was nothing a lever could have matched.
  const closing = run.client && !(run.coverage && noAiCode(run)) ? accountLines(run.client) : [];
  if (run.findings.length === 0 && run.watching.length === 0) return finish([emptyLine(run), ...quietTail(run), ...costLines(run), ...closing]);
  // Past the levers in full, the rest keep their short form, or else the table alone carries them.
  const shaped = SUMMARY_SHAPES.map((shape) => summaryLines(run, shape));
  return finish(shaped.find((lines) => lines.length <= SCREEN_LINES) ?? (shaped.at(-1)            ));
}
