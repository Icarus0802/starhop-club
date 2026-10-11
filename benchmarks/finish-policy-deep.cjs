/* Experimental deeper friendly-only finish planner. MIT.
 * Plans use only friendly bridges; every remaining move is revalidated against
 * the real board after each opponent reply. This is not a forced-win solver. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('../js/engine.js'):root.Starhop;
  const F=typeof module==='object'&&module.exports?require('./finish-v2.cjs'):root.StarhopFriendlyFinish;
  const ownKey=(state,p)=>state.board.map((v,i)=>v===p?i:'').join(',')+'|'+JSON.stringify(state.rules);
  function validatePlan(state,p,plan,repetitions=[]){
    let board=state.board.slice();const moves=[],history=new Map(repetitions);
    for(const input of plan){
      if(board[input.from]!==p)return null;
      const move=F.pieceMoves(board,input.from,state.rules).find(m=>m.to===input.to);
      if(!move)return null;
      board=board.slice();board[move.from]=-1;board[move.to]=p;moves.push(move);
      if(moves.length===1&&!E.isWinner(board,p)&&(history.get(E.key(board,(state.turn+1)%state.players.length))||0)>=2)return null;
    }
    return E.isWinner(board,p)?moves:null;
  }
  function create(){
    const cache=new Map();
    function search(state,options={}){
      const start=performance.now(),p=state.players[state.turn],budget=Number(options.time)||350;
      if(state.winner!==null||state.draw||state.stopped||state.players.length!==2)return null;
      const legal=E.legalMoves(state.board,p,state.rules);
      const win=legal.find(m=>{const b=state.board.slice();b[m.from]=-1;b[m.to]=p;return E.isWinner(b,p);});
      function result(plan,extra={}){
        const next=state.board.slice();next[plan[0].from]=-1;next[plan[0].to]=p;
        // A short solo route must never suppress a necessary defensive move.
        const opponent=state.players.find(v=>v!==p);
        if(plan.length>1&&E.progress(next,opponent)===9&&E.legalMoves(next,opponent,state.rules).some(m=>{
          const b=next.slice();b[m.from]=-1;b[m.to]=opponent;return E.isWinner(b,opponent);
        })){cache.delete(p);return null;}
        cache.set(p,{key:ownKey({...state,board:next},p),plan:plan.slice(1)});
        return {move:plan[0],plan:plan.map(m=>({...m,player:p})),algorithm:'Deep verified finish route',finishTurns:plan.length,
          frozenOpponent:true,forcedWin:!!win,planning:true,depth:null,nodes:extra.nodes||0,time:performance.now()-start,...extra};
      }
      if(win)return result([win],{finishSource:'immediate'});
      const saved=cache.get(p);
      if(saved?.key===ownKey(state,p)&&saved.plan.length){
        const plan=validatePlan(state,p,saved.plan,options.repetitions);
        if(plan)return result(plan,{finishSource:'continued-route',shortest:false});
      }
      cache.delete(p);
      const goals=E.zones[(p+3)%6],pieces=state.board.flatMap((v,i)=>v===p?[i]:[]);
      if(E.progress(state.board,p)<5||pieces.some(i=>Math.min(...goals.map(g=>E.distances[i][g]))>7))return null;
      // Opposing pieces remain obstacles but cannot be borrowed as bridges.
      const route=F.finish(state,{player:p,time:Math.max(1,Math.min(4000,budget*.3)),depth:14,maxNodes:650000,exact:true});
      if(!route.shortest||!route.plan.length)return null;
      const plan=validatePlan(state,p,route.plan,options.repetitions);
      return plan?result(plan,{nodes:route.nodes,finishSource:'friendly-bridges',shortest:false,soloShortest:true}):null;
    }
    return {search,clear:()=>cache.clear()};
  }
  const api={create,validatePlan};if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopFinishPolicy=api;
})(typeof globalThis==='object'?globalThis:this);
