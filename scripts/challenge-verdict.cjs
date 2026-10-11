'use strict';
const DRAW_POLICY='equal-own-turns-count-as-defeat';
// This is a strength-test requirement, not a change to the game's winner.
// A first-player finish with a one-turn reply is an equal-own-turn finish.
function verdict(result){
  if(result.draw==='测试主动中止')return {qualifiedWin:false,failed:false,outcome:'interrupted'};
  if(result.winner!=='A')return {qualifiedWin:false,failed:true,outcome:result.winner===null?'draw-counted-as-defeat':'defeat'};
  if(result.adjudication)return {qualifiedWin:false,failed:true,outcome:'forfeit-not-a-finish-win'};
  const m=result.margin;
  if(m?.exact&&Number.isFinite(m.completionTurnLead))return m.completionTurnLead>0
    ?{qualifiedWin:true,failed:false,outcome:'win'}
    :{qualifiedWin:false,failed:true,outcome:'equal-turns-counted-as-defeat'};
  if(Number.isFinite(m?.lowerBound)&&m.lowerBound-(m.tempoCorrection||0)>0)return {qualifiedWin:true,failed:false,outcome:'win-margin-unresolved'};
  return {qualifiedWin:false,failed:false,outcome:'unresolved'};
}
module.exports={DRAW_POLICY,verdict};
