/* Position diagnostics. Historical portions retain MIT; 2.2 additions: see LICENSE. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.Starhop;
  const A=typeof module==='object'&&module.exports?require('./ai.js'):root.StarhopAI;
  const F=typeof module==='object'&&module.exports?require('./race-finish.js'):root.StarhopRaceFinish;
  const finishCache=new Map();
  function finishingEstimate(state,player){
    const key=E.key(state.board,player)+'|'+state.rules.jump+'|'+Boolean(state.rules.goalLock);
    if(finishCache.has(key))return {...finishCache.get(key)};
    // Cold-start analysis needs more than 12 ms on ordinary machines. Cache only proved results.
    const deadline=performance.now()+40;let lowerBound=0;
    // Exclude short finishes first. Even if a complete plan is expensive,
    // a proved lower bound still matters when the other side can finish sooner.
    for(let depth=1;depth<=10;depth++){
      const result=F.finish(state,{player,time:Math.max(1,deadline-performance.now()),depth,maxNodes:4000,exact:true});
      lowerBound=Math.max(lowerBound,result.lowerBound||0);
      if(result.shortest){
        const proved={distance:result.distance,lowerBound:result.distance};
        if(finishCache.size>=256)finishCache.delete(finishCache.keys().next().value);
        finishCache.set(key,proved);return {...proved};
      }
      if(result.status==='blocked-by-frozen-opponent')return null;
      if(result.status!=='unreachable-within-depth'||performance.now()>=deadline)break;
    }
    return lowerBound?{distance:null,lowerBound}:null;
  }
  function side(state,p){
    const goal=(p+3)%6,goals=E.zones[goal],nearest=i=>Math.min(...goals.map(g=>E.distances[i][g]));
    const pieces=[];let lag=0,home=0,arrived=0,mobility=0,jumpRoutes=0;
    for(let i=0;i<121;i++)if(state.board[i]===p){
      const distance=nearest(i),moves=E.pieceMoves(state.board,i,state.rules);
      const gain=Math.max(0,...moves.map(m=>distance-nearest(m.to)));
      const support=E.adjacent[i].filter(j=>j>=0&&state.board[j]>=0).length;
      const isolated=distance>3&&support===0&&!moves.some(m=>m.path.length>2||E.distance(m.from,m.to)>1);
      // Rear pieces with no useful forward jump need special attention. This
      // is a risk flag, not a solved lower bound on moves to completion.
      const stranded=distance>=8&&gain<=1;
      pieces.push({cell:i,coordinate:E.coord(i),distance,gain,support,isolated,stranded,moves:moves.length});
      lag+=distance*distance;home+=Number(E.zoneOf[i]===p);arrived+=Number(E.zoneOf[i]===goal);mobility+=moves.length;
      jumpRoutes+=moves.filter(m=>m.path.length>2||E.distance(m.from,m.to)>1).length;
    }
    const matching=A.assignment(state.board,p),risk=pieces.filter(x=>x.stranded||x.isolated);
    const escapeCost=A.transport(state.board,p,state.rules);
    const blocked=pieces.filter(x=>x.distance>2&&x.gain===0),trailing=pieces.slice().sort((a,b)=>b.distance-a.distance).slice(0,3);
    // Multi-hop opportunities concern the whole current board, including enemy
    // bridges. Weight the rear three pieces: total distance can hide a bottleneck.
    const tailCost=trailing.reduce((v,x)=>v+Math.max(0,x.distance-3)/Math.max(1,x.gain),0);
    const quality=-matching*10-lag*.14-home*2.2+arrived*7-escapeCost-tailCost*2;
    return {player:p,matching,lag,home,arrived,mobility,jumpRoutes,quality,risk,pieces,escapeCost,tailCost,blocked:blocked.map(x=>x.coordinate),rear:Math.max(...pieces.map(x=>x.distance))};
  }
  function analyze(state,perspective=state.players[0]){
    const sides=state.players.map(p=>side(state,p)),own=sides.find(x=>x.player===perspective);
    if(!own)throw new Error('分析视角必须是参与棋手');
    const opponents=sides.filter(x=>x!==own),rival=opponents.reduce((a,b)=>a.quality>b.quality?a:b);
    const score=own.quality-rival.quality,terminal=state.winner!==null;
    const outcome=terminal?(state.winner===perspective?'win':'loss'):null;
    const actor=state.players[state.turn],stopped=state.stopped||(state.draw==='手动结束'?'手动结束':null),draw=stopped?null:state.draw;
    const boardState=stopped?{...state,draw:null,stopped:null}:state;
    const immediate=!terminal&&!draw?E.legalMoves(state.board,actor,state.rules).find(m=>E.isWinner(E.applyMove(boardState,m).state.board,actor)):null;
    let race=null;
    if(!draw&&state.players.length===2&&F&&sides.every(s=>s.arrived>=6)){
      const ownPlan=finishingEstimate(state,perspective),opponentPlan=finishingEstimate(state,sides.find(s=>s.player!==perspective).player);
      if(ownPlan&&opponentPlan){
        race={ownTurns:ownPlan.distance,opponentTurns:opponentPlan.distance,frozenOpponent:true,forcedWin:false};
        if(ownPlan.distance===null||opponentPlan.distance===null){race.ownLowerBound=ownPlan.lowerBound;race.opponentLowerBound=opponentPlan.lowerBound;}
      }
    }
    return {perspective,sides,score,terminal,outcome,draw,stopped,race,adjudication:state.adjudication||null,immediate:immediate?{player:actor,move:immediate}:null,scale:'启发式分数（非胜率、非等级分）',formula:'中盘分数是棋形估计，不是胜率；终局单独显示胜负，不再用 ±1000 代替评分。收官步数是在对方棋子保持不动时，补齐十子的最短自方回合数；≥ 表示已经排除更短走法的步数下界，尚未算出完整最短路线；双方继续走动可能改变路线。目标最小匹配×−10；后子距离平方和×−0.14；原营棋子×−2.2；入营棋子×7；减去当前借力与出口代价，以及最落后三子运输风险×2。多人对最领先对手。'};
  }
  function presentation(data){
    if(data.stopped){const view=presentation({...data,stopped:null});return {...view,verdict:'手动结束 · 未判胜负；'+view.verdict};}
    if(data.draw)return {value:'和棋',verdict:'对局结束 · '+data.draw,compact:'和棋',detail:'',share:50};
    if(data.terminal)return {value:data.outcome==='win'?'胜':'负',verdict:data.adjudication?(data.outcome==='win'?'对手三次重复，判负':'本方三次重复，判负'):(data.outcome==='win'?'已获胜':'对手获胜'),compact:data.outcome==='win'?'已获胜':'对手获胜',detail:'',share:data.outcome==='win'?100:0};
    if(data.immediate){const own=data.immediate.player===data.perspective;return {value:own?'一步可胜':'对手一步可胜',verdict:'轮到走的一方已有合法满营着',compact:own?'一步可胜':'对手一步可胜',detail:'',share:own?95:5};}
    if(data.race){
      const {ownTurns,opponentTurns}=data.race,ownExact=Number.isFinite(ownTurns),opponentExact=Number.isFinite(opponentTurns);
      const own=ownExact?String(ownTurns):'≥'+data.race.ownLowerBound,opponent=opponentExact?String(opponentTurns):'≥'+data.race.opponentLowerBound;
      const lead=ownExact&&opponentExact?opponentTurns-ownTurns:ownExact&&data.race.opponentLowerBound>ownTurns?data.race.opponentLowerBound-ownTurns:opponentExact&&data.race.ownLowerBound>opponentTurns?opponentTurns-data.race.ownLowerBound:0;
      return {value:own+' 步',verdict:'我方 '+own+' 步 / 对手 '+opponent+' 步 · 静态收官',compact:lead>0?'预计收官领先':lead<0?'预计收官落后':ownExact&&opponentExact?'收官步数相同':'收官仍在估算',detail:'我 '+own+' / 对手 '+opponent+' 步',share:50+40*Math.tanh(lead*.7)};
    }
    return {value:(data.score>=0?'+':'')+data.score.toFixed(1),verdict:Math.abs(data.score)<25?'棋形接近 · 胜负未算清':data.score>0?'棋形占优 · 非胜负结论':'棋形落后 · 非胜负结论',compact:Math.abs(data.score)<25?'棋形接近':data.score>0?'棋形占优':'棋形落后',detail:(data.score>=0?'+':'')+data.score.toFixed(1),share:50+45*Math.tanh(data.score/180)};
  }
  function bridges(state,p){
    const original=side(state,p),board=state.board.slice(),result=[];
    for(const anchor of original.pieces){
      board[anchor.cell]=-1;const dependencies=[];
      for(const x of original.pieces){if(x.cell===anchor.cell||x.distance<4)continue;
        const goal=E.zones[(p+3)%6],gain=Math.max(0,...E.pieceMoves(board,x.cell,state.rules).map(m=>x.distance-Math.min(...goal.map(g=>E.distances[m.to][g]))));
        if(x.gain-gain>=2)dependencies.push({cell:x.cell,coordinate:x.coordinate,lostGain:x.gain-gain});
      }board[anchor.cell]=p;
      if(dependencies.length)result.push({cell:anchor.cell,coordinate:anchor.coordinate,dependencies,loss:dependencies.reduce((v,x)=>v+x.lostGain,0)});
    }
    return result.sort((a,b)=>b.loss-a.loss);
  }
  const api={side,analyze,bridges,presentation};if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopAnalysis=api;
})(typeof globalThis==='object'?globalThis:this);
