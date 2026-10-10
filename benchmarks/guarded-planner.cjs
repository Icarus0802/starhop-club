/* Isolated experiment: planning remains the decision policy; full-width PVS
 * only vetoes a shortlisted move when a forced terminal loss is established.
 * Static AB scores never override the planner's long-range team objective. */
'use strict';
const P=require('../js/team-planner.js'),F=require('../js/fast-search.js');
function search(state,options={}){
  if(state.players.length!==2||Number(options.level??4)<2)return P.search(state,options);
  const started=performance.now(),budget=Math.max(30,Number(options.time)||250),plan=P.search(state,{...options,time:budget*.85});
  if(plan.solved||!plan.move||plan.candidates.length<2)return {...plan,time:performance.now()-started,guarded:true,guardChanged:false};
  const tactical=F.search(state,{...options,time:Math.max(15,budget-(performance.now()-started)),rootMoves:plan.candidates.slice(0,3),selective:false,weights:{lag:.32,home:2.5,done:4,transport:1}});
  const original=tactical.candidates.find(m=>m.from===plan.move.from&&m.to===plan.move.to);
  const changed=original&&original.score<=-99999&&tactical.score>-99999;
  return {...plan,move:changed?tactical.move:plan.move,algorithm:'Team planner + terminal guard',time:performance.now()-started,nodes:plan.nodes+tactical.nodes,guarded:true,guardChanged:!!changed,guardDepth:tactical.depth,guardMs:tactical.time,guardCandidates:tactical.candidates};
}
module.exports={...P,search};
