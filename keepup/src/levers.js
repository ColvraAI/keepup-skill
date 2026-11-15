// Reads db/levers and db/patterns as data. No lever or pattern lives in code. Which folder is src/store.ts's answer at
// call time; in an installed client no lever is on disk at all, and the levers are the ones the server returned for this run.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { curatedDir, servedLevers, storeMode } from './store.js';

/** candidate: written, not vouched for. promoted: a person opened the source and stands behind it. withdrawn and superseded stay on file, because an id is never reused. */
                                                                                

/** The roles that may vouch for a lever. A lever checked by `agent` is a guess and is never served. */
export const REVIEWER_ROLES = ['founder', 'reviewer']         ;

/** One number a lever states, tied to the words it was read from. `quote` is copied exactly from `source`, so code can look for it there again every day. */
                              
                        
                                                                                                       
                         
                                                                                                                                                     
                         
                         
                          
                                                                           
                                       
                                                                                         
                                    
 

/** How to tell a repo already uses what a lever offers, so the brief says "extend what you have" instead of "adopt". */
                              
                                               
                         
 

/** Where a tool a lever installs runs, and what leaves the machine. "not stated" until someone reads the vendor's own page. */
                               
                                                                   
                                
                                    
                                 
 

/** Who publishes what an install lever installs. Organisations only, never a person's name. */
                             
                                    
                                              
                               
                                  
                                 
                                    
                                              
                                           
                                              
                                  
                                     
                                  
 

                        
                      
                        
                           
                        
                                         
                                      
                        
                         
                          
                       
                             
                                          
                          
                          
                                      
                                                                                                      
                                                                                              
                            
                               
                                                                                                                                                 
                                       
                                         
                            
                                
                                     
                                                                                                                    
                                                                                                                                     
                                                                                                           
                                
                                                 
                           
                                  
                                            
                                                   
                                        
                                   
 

/** Only a lever a person promoted is ever served to a customer. Publish and the server use this; loadLevers stays every lever on file. */
export function isServable(lever                                      )          {
  return lever.status === 'promoted' && (REVIEWER_ROLES                     ).includes(lever.checked_by ?? '');
}

                              
                      
                        
                       
                                   
                                                                                           
                             
                                                             
                               
 

function readJsonFiles   (dir        , prefix        )      {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => prefix.test(name) && name.endsWith('.json'))
    .sort()
    .map((name) => {
      try {
        return JSON.parse(readFileSync(join(dir, name), 'utf8'))     ;
      } catch (error) {
        throw new Error(`Can't read ${name}: ${(error         ).message}`);
      }
    });
}

/** Withdrawn and superseded levers stay on file because an id is never reused, but nothing is offered from them. No status is live. */
function isLive(lever                       )          {
  return lever.status !== 'withdrawn' && lever.status !== 'superseded';
}

/**
 * A folder named is always read whole, because the tools that publish and review levers need every one. With none, a
 * client uses only what was served to this run, and only what a person promoted; a checkout uses its live levers.
 */
export function loadLevers(dir         )          {
  if (dir !== undefined) return readJsonFiles       (dir, /^ADV-/);
  if (storeMode() === 'client') return servedLevers().filter(isServable);
  return readJsonFiles       (curatedDir('levers'), /^ADV-/).filter(isLive);
}

export function loadPatternMeta(dir = curatedDir('patterns'))                {
  return readJsonFiles             (dir, /^PAT-/);
}

                                                                                                 

/** Only the change this lever makes. A recipe that tests something else would put another change's number on this one. */
export function recipesFor(lever                                              )           {
  if (!lever) return [];
  const formula = lever.gain_model?.formula ?? '';
  if (/hit_rate/.test(formula) || lever.pattern === 'PAT-prompt-caching-off') return ['prompt caching'];
  if (/decision_cost/.test(formula) || lever.pattern === 'PAT-label-picking-call') return ['decision model'];
  if (lever.pattern === 'PAT-hand-parsed-json') return ['structured outputs'];
  return lever.pattern === 'PAT-one-top-model' ? ['cheaper tier'] : [];
}

/** The Claude-only hard case: a lever tied to another provider never shows; a neutral lever (no providers) always can. */
export function leverAllowed(lever                          , providerOnly                    )          {
  if (!providerOnly || !lever.providers?.length) return true;
  return lever.providers.includes(providerOnly);
}
