'use strict';
const E=require('../js/engine.js'),F=require('../js/fast-search.js'),P=require('../js/race-finish.js');
module.exports={...F,search(state,options={}){
  const start=performance.now(),budget=options.time||350,p=state.players[state.turn],q=state.players[state.turn^1];
  if(state.winner!==null||state.draw||state.players.length!==2||E.progress(state.board,p)<7||state.rules.jump!=='short')return F.search(state,options);
  const plan=P.finish(state,{...options,time:Math.min(45,budget*.15),depth:6,exact:true});
  const remaining=()=>Math.max(15,budget-(performance.now()-start));
  if(plan.status==='found'&&plan.distance<=5){
    const move=E.pieceMoves(state.board,plan.plan[0].from,state.rules).find(m=>m.to===plan.plan[0].to),next=E.applyMove(state,move).state;
    const safe=next.winner===p||!E.legalMoves(next.board,q,state.rules).some(m=>{const b=next.board.slice();b[m.from]=-1;b[m.to]=q;return E.isWinner(b,q);});
    if(safe){
      const result=F.search(state,{...options,time:remaining(),rootMoves:[move]});
      return {...result,algorithm:'Fast PVS + exact solo finish',planning:true,plan:plan.plan.map(m=>({...m,player:p})),time:performance.now()-start,finish:plan};
    }
  }
  const result=F.search(state,{...options,time:remaining()});return {...result,time:performance.now()-start,finish:plan};
}};
