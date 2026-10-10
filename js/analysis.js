/* Position diagnostics, deliberately separate from search evaluation. MIT. */
(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.Starhop;
  const A=typeof module==='object'&&module.exports?require('./ai.js'):root.StarhopAI;
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
    const quality=-matching*10-lag*.14-home*2.2+arrived*7;
    return {player:p,matching,lag,home,arrived,mobility,jumpRoutes,quality,risk,pieces,rear:Math.max(...pieces.map(x=>x.distance))};
  }
  function analyze(state,perspective=state.players[0]){
    const sides=state.players.map(p=>side(state,p)),own=sides.find(x=>x.player===perspective);
    if(!own)throw new Error('分析视角必须是参与棋手');
    const opponents=sides.filter(x=>x!==own),rival=opponents.reduce((a,b)=>a.quality>b.quality?a:b);
    let score=own.quality-rival.quality;
    if(state.winner!==null)score=state.winner===perspective?1000:-1000;
    return {perspective,sides,score,terminal:state.winner!==null,draw:state.draw,scale:'启发式分数（非胜率、非等级分）',formula:'目标最小匹配×−10；后子距离平方和×−0.14；原营棋子×−2.2；入营棋子×7。多人对最领先对手。'};
  }
  const api={side,analyze};if(typeof module==='object'&&module.exports)module.exports=api;else root.StarhopAnalysis=api;
})(typeof globalThis==='object'?globalThis:this);
