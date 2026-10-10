/* Position diagnostics, deliberately separate from search evaluation. MIT. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.Starhop;
  const A=typeof module==='object'&&module.exports?require('./ai.js'):root.StarhopAI;
  const M=typeof module==='object'&&module.exports?require('./value-model.js'):root.StarhopValueModel;
  const cached=new WeakMap();
  function stateCache(state){
    // The application uses immutable states, but diagnostics also accept an
    // edited study board. Never return stale routes for the same object.
    const key=E.key(state.board,state.turn)+JSON.stringify(state.rules);
    let row=cached.get(state);if(!row||row.key!==key){row={key,sides:new Map(),bridges:new Map()};cached.set(state,row);}return row;
  }
  function side(state,p){
    const cache=stateCache(state);if(cache.sides.has(p))return cache.sides.get(p);
    const goal=(p+3)%6,goals=E.zones[goal],nearest=i=>M.nearest[p][i],needed=goals.filter(i=>state.board[i]!==p);
    const needDistance=i=>needed.length?Math.min(...needed.map(g=>E.distances[i][g])):0;
    const entries=goals.filter(i=>E.adjacent[i].some(j=>j>=0&&E.zoneOf[j]!==goal));
    const pieces=[],routes=new Map();let lag=0,home=0,arrived=0,mobility=0,jumpRoutes=0,escapeCost=0,homeTransport=0;
    for(let i=0;i<121;i++)if(state.board[i]===p){
      const distance=nearest(i),moves=E.pieceMoves(state.board,i,state.rules);
      routes.set(i,moves);
      const gain=Math.max(0,...moves.map(m=>distance-nearest(m.to)));
      const jumps=moves.filter(M.isJump),jumpGain=Math.max(0,...jumps.map(m=>distance-nearest(m.to)));
      const targetDistance=needDistance(i),targetGain=Math.max(0,...moves.map(m=>targetDistance-needDistance(m.to)));
      const targetJumpGain=Math.max(0,...jumps.map(m=>targetDistance-needDistance(m.to)));
      const canEnterNow=moves.some(m=>needed.includes(m.to)),inGoal=E.zoneOf[i]===goal,inHome=E.zoneOf[i]===p;
      const support=E.adjacent[i].filter(j=>j>=0&&state.board[j]>=0).length;
      const usefulJumps=jumps.filter(m=>needDistance(m.to)<targetDistance).length;
      const isolated=!inGoal&&targetDistance>3&&support===0&&!usefulJumps;
      // Rear pieces with no useful forward jump need special attention. This
      // is a risk flag, not a solved lower bound on moves to completion.
      const stranded=!inGoal&&targetDistance>=8&&targetGain<=1;
      let transport=0;
      if(!inGoal){
        // All reachable landings use the shared rule engine. An empty adjacent
        // cell is not automatically a useful exit, nor is a nearby filled goal
        // a substitute for reaching the remaining deep holes.
        if(!usefulJumps)transport+=targetDistance*targetDistance*.045;
        if(!targetGain)transport+=targetDistance*.65;
        if(!moves.length)transport+=targetDistance*.9;
        transport-=Math.min(targetJumpGain,6)*.7;
        transport+=Math.max(0,targetDistance-distance)*.35;
        escapeCost+=transport;if(inHome)homeTransport+=transport;
      }
      pieces.push({cell:i,coordinate:E.coord(i),distance,gain,jumpGain,targetDistance,targetGain,targetJumpGain,canEnterNow,inGoal,inHome,support,isolated,stranded,moves:moves.length,rolls:moves.length-jumps.length,usefulJumps,transport});
      lag+=distance*distance;home+=Number(inHome);arrived+=Number(inGoal);mobility+=moves.length;jumpRoutes+=jumps.length;
    }
    const matching=A.assignment(state.board,p),risk=pieces.filter(x=>x.stranded||x.isolated);
    const outside=pieces.filter(x=>!x.inGoal),blocked=outside.filter(x=>x.targetGain===0),trailing=outside.slice().sort((a,b)=>b.targetDistance-a.targetDistance).slice(0,3);
    // Multi-hop opportunities concern the whole current board, including enemy
    // bridges. Weight the rear three pieces: total distance can hide a bottleneck.
    const tailCost=trailing.reduce((v,x)=>v+Math.max(0,x.targetDistance-3)/Math.max(1,x.targetGain),0);
    const unfilledHoles=needed.map(cell=>({cell,coordinate:E.coord(cell),depth:Math.min(...entries.map(entry=>E.distances[cell][entry])),occupiedBy:state.board[cell],reachableNow:pieces.some(x=>routes.get(x.cell).some(m=>m.to===cell))}));
    const entryBlocked=arrived>=6?outside.filter(x=>x.distance<=2&&!x.canEnterNow).map(x=>x.coordinate):[];
    const bottleneckCost=arrived>=6?entryBlocked.length*.75+unfilledHoles.reduce((sum,hole)=>sum+(hole.reachableNow?0:hole.depth*.6)+(hole.occupiedBy>=0?1.5:0),0):0;
    const quality=-matching*10-lag*.14-home*2.2+arrived*4-escapeCost-tailCost*2-bottleneckCost;
    const row={player:p,matching,lag,home,arrived,mobility,jumpRoutes,quality,risk,pieces,escapeCost,homeTransport,tailCost,bottleneckCost,entryBlocked,unfilledHoles,usefulJumpPieces:outside.filter(x=>x.usefulJumps>0).length,blocked:blocked.map(x=>x.coordinate),rear:Math.max(...pieces.map(x=>x.distance)),learnedFeatures:M.sideFeatures(state,p,routes)};
    cache.sides.set(p,row);return row;
  }
  function immediateFinish(state,sides){
    if(state.winner!==null||state.draw)return null;
    const cache=stateCache(state);if(cache.finish!==undefined)return cache.finish;
    const player=state.players[state.turn],current=sides.find(x=>x.player===player);
    cache.finish=null;if(current.arrived!==9)return null;
    // Only the side actually on move receives a proof. Another player's
    // apparent access can disappear before its turn, so it is not a forced win.
    for(const piece of current.pieces)if(!piece.inGoal)for(const move of E.pieceMoves(state.board,piece.cell,state.rules)){
      if(E.zoneOf[move.to]!==((player+3)%6))continue;
      const applied=E.applyMove(state,move);
      if(applied.state.winner===player){cache.finish={player,winningMove:applied.move,proof:'shared-rules-one-move-win'};return cache.finish;}
    }
    return null;
  }
  function analyze(state,perspective=state.players[0]){
    const sides=state.players.map(p=>side(state,p)),own=sides.find(x=>x.player===perspective);
    if(!own)throw new Error('分析视角必须是参与棋手');
    const opponents=sides.filter(x=>x!==own),rival=opponents.reduce((a,b)=>a.quality>b.quality?a:b);
    let score=own.quality-rival.quality;
    if(state.winner!==null)score=state.winner===perspective?1000:-1000;
    return {perspective,sides,score,terminal:state.winner!==null,draw:state.draw,immediateFinish:immediateFinish(state,sides),probability:M.estimate(state,perspective,sides.map(x=>x.learnedFeatures)),scale:'启发式分数（非胜率、非等级分）',formula:'结构评分：未填目标孔匹配、后子距离平方、原营后军、实际完整连续跳、无向前落点、孤子与收营瓶颈；运输风险不是完成步数，后续搭桥和对手阻挡仍会改变它。入营数不单独决定趋势。实验胜率趋势另由公开训练的 linear-v2 模型输出，35局训练、11局验证、4局测试；标签为胜1、和0.5、负0，故数字是和棋计半的预期得分，尚未校准，不代表对真人或特定对手的胜率。多人结构评分对最领先对手。'};
  }
  function bridges(state,p){
    const cache=stateCache(state);if(cache.bridges.has(p))return cache.bridges.get(p);
    const original=side(state,p),board=state.board.slice(),result=[];
    for(const anchor of original.pieces){
      board[anchor.cell]=-1;const dependencies=[];
      for(const x of original.pieces){if(x.cell===anchor.cell||x.distance<4)continue;
        const goal=E.zones[(p+3)%6],gain=Math.max(0,...E.pieceMoves(board,x.cell,state.rules).map(m=>x.distance-Math.min(...goal.map(g=>E.distances[m.to][g]))));
        if(x.gain-gain>=2)dependencies.push({cell:x.cell,coordinate:x.coordinate,lostGain:x.gain-gain});
      }board[anchor.cell]=p;
      if(dependencies.length)result.push({cell:anchor.cell,coordinate:anchor.coordinate,dependencies,loss:dependencies.reduce((v,x)=>v+x.lostGain,0)});
    }
    result.sort((a,b)=>b.loss-a.loss);cache.bridges.set(p,result);return result;
  }
  const api={side,analyze,bridges};if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopAnalysis=api;
})(typeof globalThis==='object'?globalThis:this);
