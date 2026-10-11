/* Match-level anti-shuffling rule. Kept outside the frozen geometry/search core. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.Starhop;
  const RULE='own-threefold-loss';
  const enabled=state=>state.players.length===2&&state.rules.repetitionRule===RULE;
  function position(board,player){const cells=[];for(let i=0;i<board.length;i++)if(board[i]===player)cells.push(i);return player+':'+cells.join(',');}
  // Count the initial formation once, then only changes made by that player.
  // Opponent turns and forced passes must never increase this counter.
  function history(states){
    const map=new Map();if(!states.length)return map;
    for(const p of states[0].players)map.set(position(states[0].board,p),[states[0].ply]);
    for(let i=1;i<states.length;i++){
      const before=states[i-1],after=states[i],p=before.players[before.turn],key=position(after.board,p);
      if(key===position(before.board,p))continue;
      const plies=map.get(key)||[];plies.push(after.ply);map.set(key,plies);
    }
    return map;
  }
  function violation(states,next){
    const before=states.at(-1);if(!before||!enabled(before)||next.winner!==null)return null;
    const p=before.players[before.turn],key=position(next.board,p);
    if(key===position(before.board,p))return null;
    const plies=history(states).get(key)||[];if(plies.length<2)return null;
    return {type:RULE,loser:p,winner:before.players.find(v=>v!==p),ply:next.ply,occurrences:[...plies,next.ply],reason:'同一方阵形第三次重复，违规方判负'};
  }
  function adjudicate(states,next){
    const verdict=violation(states,next);
    return verdict?{...next,winner:verdict.winner,draw:null,stopped:null,adjudication:verdict}:next;
  }
  function replay(record){
    if(record?.options?.repetitionRule!==RULE||Number(record?.options?.players)!==2)return E.replay(record);
    const initial=E.replay({...record,moves:[]}).state;
    if(!Array.isArray(record.moves)||record.moves.length>10000)throw Error('棋谱格式不正确');
    let state={...initial,rules:{...initial.rules,repetitionRule:RULE}};const states=[state],moves=[];
    for(const input of record.moves){
      if(!input||(!input.pass&&(!Number.isInteger(input.from)||!Number.isInteger(input.to))))throw Error('棋谱走法格式不正确');
      const result=E.applyMove(state,input);state=adjudicate(states,result.state);
      if(state.winner===null&&!state.draw&&state.ply>=600)state={...state,draw:'达到 600 手上限'};
      moves.push(result.move);states.push(state);
    }
    return {state,states,moves};
  }
  function searchOptions(states){return {ownRepetitions:[...history(states)].map(([key,plies])=>[key,plies.length])};}
  function allowedMoves(state,options={}){
    const player=state.players[state.turn],moves=E.legalMoves(state.board,player,state.rules);
    if(!enabled(state))return moves;
    const seen=new Map(options.ownRepetitions||[]);
    return moves.filter(move=>{const next=E.applyMove(state,move).state;return next.winner!==null||(seen.get(position(next.board,player))||0)<2;});
  }
  function prepareOptions(state,options={}){
    if(!enabled(state))return options;
    const allowed=allowedMoves(state,options),keys=new Set(allowed.map(m=>m.from+':'+m.to)),seen=new Map(options.repetitions||[]);
    // Existing engines already avoid a root whose full position has two visits.
    for(const m of E.legalMoves(state.board,state.players[state.turn],state.rules))if(!keys.has(m.from+':'+m.to)){
      const next=E.applyMove(state,m).state;seen.set(E.key(next.board,next.turn),2);
    }
    return {...options,repetitions:[...seen],rootMoves:allowed};
  }
  function guardResult(state,options,result){
    if(!enabled(state)||!result?.move)return result;
    const allowed=allowedMoves(state,options),same=m=>m.from===result.move.from&&m.to===result.move.to;
    if(allowed.some(same))return result;
    // If every legal move forfeits, actually play and adjudicate it. Do not pass,
    // freeze the game, or silently turn the loss into a draw.
    if(!allowed.length)return {...result,forcedRepetitionLoss:true};
    const Fast=typeof module==='object'&&module.exports?require('./fast-search.js'):root.StarhopFastAI;
    const replacement=Fast.search(state,{...prepareOptions(state,options),algorithm:'auto',level:4,time:60,depth:2,rootMoves:allowed,onIteration:undefined});
    if(!allowed.some(m=>m.from===replacement.move?.from&&m.to===replacement.move?.to))throw Error('重复规则筛选失败');
    return {...replacement,native:false,ruleFiltered:true,algorithm:'防重复 · 合规选步',nativeFallback:result.nativeFallback||'Avoided third own-formation repetition',time:(result.time||0)+replacement.time};
  }
  const api={RULE,enabled,position,history,violation,adjudicate,replay,searchOptions,allowedMoves,prepareOptions,guardResult};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopRepetition=api;
})(typeof globalThis==='object'?globalThis:this);
