'use strict';
const E=require('../js/engine.js'),F=require('../js/fast-search.js'),P=require('../js/race-finish.js');
module.exports={...F,search(state,options={}){
  const start=performance.now(),budget=options.time||350,p=state.players[state.turn],q=state.players[state.turn^1];
  if(state.winner!==null||state.draw||E.progress(state.board,p)<5||state.rules.jump!=='short')return F.search(state,options);
  const plan=P.finish(state,{...options,time:budget*.65,depth:14});
  if(plan.status==='found'){
    const move=E.pieceMoves(state.board,plan.plan[0].from,state.rules).find(m=>m.to===plan.plan[0].to),next=E.applyMove(state,move).state;
    const safe=next.winner===p||!E.legalMoves(next.board,q,state.rules).some(m=>{const b=next.board.slice();b[m.from]=-1;b[m.to]=q;return E.isWinner(b,q);});
    if(safe)return {move,algorithm:'Race finish',planning:true,plan:plan.plan.map(m=>({...m,player:p})),depth:plan.distance,nodes:plan.nodes,time:performance.now()-start,solved:next.winner===p,score:next.winner===p?100000:0,candidates:[],finish:plan};
  }
  const r=F.search(state,{...options,time:Math.max(15,budget-(performance.now()-start))});return {...r,time:performance.now()-start,finish:plan};
}};
