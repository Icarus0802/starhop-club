/* MIT. Browser inference for the frozen outcome-supervised linear-v2 model.
 * Training used wins=1, draws=0.5, losses=0: the sigmoid is an expected score,
 * not a calibrated probability against a human or any particular opponent. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.Starhop;
  const A=typeof module==='object'&&module.exports?require('./ai.js'):root.StarhopAI;
  const theta=Object.freeze([0.2986843970129697,0.29822284137782884,0.2929055601307508,0.2987127600904501,0.2962324091980292,0.29483008697582963,0.2979844572397014,0.29763126824784875,0.1856354582411338,0.29838424846629635,0.2965587511292718,0.2948469636891065]);
  const scales=Object.freeze([100,500,10,10,16,30]);
  const metadata=Object.freeze({version:'linear-v2',featureVersion:'h-transport-phase-v1',trained:true,corpusGames:50,trainingGames:35,validationGames:11,testGames:4,calibrated:false,sourceSha256:'8d8243f64eedc8b6ece1713edab50eaf360ec3ba06384cbe89a28dd0c13932c5',semantics:'win-plus-half-draw',domain:'two-player-short-unlocked'});
  const nearest=E.zones.map((_,p)=>E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(goal=>E.distances[i][goal]))));
  const isJump=move=>move.path.length>2||E.distances[move.from][move.to]>1;
  function directJumps(board,from,rules){
    const result=[];
    for(const ray of E.rays[from]){
      let k=0;if(rules.jump==='long')while(k<ray.length&&board[ray[k]]<0)k++;
      const mid=ray[k],to=ray[2*k+1];if(mid===undefined||to===undefined||board[mid]<0||board[to]>=0)continue;
      let clear=true;for(let j=k+1;j<2*k+1;j++)if(board[ray[j]]>=0){clear=false;break;}
      if(clear)result.push(to);
    }
    return result;
  }
  function sideFeatures(state,p,routes){
    const board=state.board,goal=(p+3)%6,pcs=[];let lagSquared=0,homeRemaining=0,arrived=0,ownBridges=0;
    for(let from=0;from<121;from++)if(board[from]===p){
      const d=nearest[p][from];pcs.push({from,d});lagSquared+=d*d;homeRemaining+=Number(E.zoneOf[from]===p);arrived+=Number(E.zoneOf[from]===goal);
      for(const to of E.adjacent[from])if(to>=0&&board[to]===p)ownBridges++;
    }
    const distances=pcs.filter(piece=>piece.d>0).map(piece=>piece.d).sort((a,b)=>b-a),third=distances[2]??-1,finishing=arrived>=6;
    const needs=finishing?E.zones[goal].filter(cell=>board[cell]!==p):[];let jumpTransport=0;
    for(const {from,d} of pcs){
      if(!d||d<=2&&!finishing)continue;
      let gain=0,forward=0,exit=0,canEnter=false;
      for(const to of E.adjacent[from])if(to>=0&&board[to]<0){exit++;if(nearest[p][to]<d)forward++;if(E.zoneOf[to]===goal)canEnter=true;}
      if(finishing||d>=third){
        const moves=routes?.get(from)||E.pieceMoves(board,from,state.rules);
        for(const move of moves)if(isJump(move)){gain=Math.max(gain,d-nearest[p][move.to]);if(E.zoneOf[move.to]===goal)canEnter=true;}
      }else for(const to of directJumps(board,from,state.rules)){gain=Math.max(gain,d-nearest[p][to]);if(E.zoneOf[to]===goal)canEnter=true;}
      if(d>2){if(gain===0)jumpTransport+=d*d*.045;if(!forward&&gain===0)jumpTransport+=d*.65;if(!exit&&gain===0)jumpTransport+=d*.9;jumpTransport-=Math.min(gain,4)*.7;}
      if(finishing){jumpTransport+=Math.max(0,Math.min(...needs.map(cell=>E.distances[from][cell]))-d)*.35;if(d<=2&&!canEnter)jumpTransport+=.75;}
    }
    return {player:p,assignment:A.assignment(board,p),lagSquared,homeRemaining,arrived,ownBridges:Math.min(ownBridges,16),jumpTransport};
  }
  function featuresFromSides(sides,actor){
    const a=sides[actor],b=sides[actor^1],phase=Math.max(0,Math.min(1,(Math.max(a.arrived,b.arrived)-4)/6));
    const raw=[b.assignment-a.assignment,b.lagSquared-a.lagSquared,b.homeRemaining-a.homeRemaining,a.arrived-b.arrived,a.ownBridges-b.ownBridges,b.jumpTransport-a.jumpTransport];
    return raw.map((value,i)=>value/scales[i]*(1-phase)).concat(raw.map((value,i)=>value/scales[i]*phase));
  }
  function features(state,perspective=state.players[state.turn],sides){
    const actor=state.players.indexOf(perspective);if(state.players.length!==2||actor<0)throw new Error('This learned model requires two participating players');
    return featuresFromSides(sides||state.players.map(p=>sideFeatures(state,p)),actor);
  }
  function predict(vector){let logit=0;for(let i=0;i<12;i++)logit+=theta[i]*vector[i];if(!Number.isFinite(logit))throw new Error('Nonfinite learned trend');return {logit,value:logit>=0?1/(1+Math.exp(-logit)):Math.exp(logit)/(1+Math.exp(logit))};}
  function estimate(state,perspective=state.players[state.turn],sides){
    if(!state.players.includes(perspective))throw new Error('Analysis perspective is not playing');
    if(state.winner!==null)return {...metadata,status:'terminal-fact',value:state.winner===perspective?1:0,logit:null};
    if(state.draw){
      const ruleDraw=['三次重复局面','达到 600 手上限','全部棋手无合法走法'].includes(state.draw);
      return ruleDraw?{...metadata,status:'terminal-fact',value:.5,logit:null}:{...metadata,status:'abandoned',value:null,logit:null,reason:'对局已停止，未产生规则认定的胜负或和棋；不作为实际终局结果。'};
    }
    if(state.players.length!==2||state.rules.jump!=='short'||state.rules.goalLock)return {...metadata,status:'unsupported-rules',value:null,logit:null,reason:'模型只训练过双人短跳、未锁营；当前规则不提供概率估计。'};
    return {...metadata,...predict(features(state,perspective,sides)),status:'experimental-uncalibrated',note:'35局训练、11局验证、4局测试；和棋计半，未做概率校准，不代表对真人或特定对手的胜率。'};
  }
  const api={metadata,theta,scales,nearest,isJump,sideFeatures,featuresFromSides,features,predict,estimate};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopValueModel=api;
})(typeof globalThis==='object'?globalThis:this);
