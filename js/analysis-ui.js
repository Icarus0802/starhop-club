(function(){
  'use strict';
  const E=Starhop,A=StarhopAI,D=StarhopAnalysis,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  let cache=new WeakMap(),worker=null,url=null,token=0,lastKey=null,lastStates=null,context=null,renderKey='';
  function cancel(){token++;if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);worker=null;url=null;const shown=context?.states[context.cursor];$('compare-levels').disabled=!shown||shown.winner!==null||!!shown.draw||!!shown.stopped;}
  function node(tag,attrs,parent){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;}
  function resultFor(state,p){let record=cache.get(state);if(!record){record=new Map();cache.set(state,record);}if(!record.has(p))record.set(p,D.analyze(state,p));return record.get(p);}
  function update(states,cursor,perspective,onReview,pieceAppearance){
    const colors=pieceAppearance?.colors||['#caa873','#8eb4bc','#a99cca','#709be0','#c78ca4','#c5cbd7'],shortNames=pieceAppearance?.shortNames||['金','青','紫','蓝','玫瑰','银'];
    context={states,cursor,perspective,onReview};const state=states[cursor],key=E.key(state.board,state.turn)+JSON.stringify(state.rules)+perspective;
    if(key!==lastKey||states!==lastStates){cancel();$('level-comparison').replaceChildren();lastKey=key;lastStates=states;renderKey='';}
    const rk=key+'|'+states.length+'|'+cursor+'|'+state.draw+'|'+state.winner+'|'+state.stopped+'|'+colors.join();if(rk===renderKey)return;renderKey=rk;
    const data=resultFor(state,perspective),own=data.sides.find(s=>s.player===perspective);
    const view=D.presentation(data);
    $('position-score').textContent=view.value;
    $('position-verdict').textContent=view.verdict;
    $('compact-verdict').textContent=view.compact;
    $('compact-score').textContent=view.detail;
    $('assessment-fill').style.width=view.share+'%';
    $('assessment-meter').setAttribute('aria-label',$('compact-verdict').textContent+'，'+data.scale);
    $('assessment-meter').title=data.race?'收官测算固定对方棋子；实际走动可能改变路线。不是获胜概率。':'棋形强弱示意，不是获胜概率；一步可胜由合法走法验证。';
    $('analysis-perspective').textContent='视角：'+shortNames[perspective]+'方 · 第 '+cursor+' 手';
    // Reuse the analysis of the displayed position, including while reviewing.
    const rival=data.sides.filter(s=>s!==own).reduce((a,b)=>a.quality>b.quality?a:b);
    $('assessment-fill').style.background=colors[perspective];$('assessment-meter').style.background=colors[rival.player];
    const phase=data.terminal?'已分胜负':data.draw?'和棋':data.sides.every(s=>s.arrived>=6)?'收官':cursor<state.players.length*8?'开局':'中盘';
    $('game-phase').textContent=phase;
    $('race-caption').textContent=data.race?'收官竞速':'十子入营';
    $('race-sides').replaceChildren();
    for(const side of [own,rival]){
      const card=document.createElement('div');card.className='race-side';card.style.setProperty('--player-color',colors[side.player]);
      const label=document.createElement('span');label.className='race-label';label.textContent=(side===own?'本方':'对手')+' · '+shortNames[side.player]+'方';
      const value=document.createElement('b'),unit=document.createElement('small');
      const turns=side===own?data.race?.ownTurns:data.race?.opponentTurns,lower=side===own?data.race?.ownLowerBound:data.race?.opponentLowerBound;
      value.textContent=data.race?(Number.isFinite(turns)?String(turns):'≥'+lower):String(side.arrived);unit.textContent=data.race?'步收官':'/ 10 入营';value.append(unit);
      const detail=document.createElement('span');detail.className='race-detail';detail.textContent=side.arrived===10?'十子全部到达':'还有 '+(10-side.arrived)+' 子在营外';
      card.append(label,value,detail);$('race-sides').append(card);
    }
    $('race-note').textContent=data.race?'固定对方棋子的收官测算，走动会改变路线。':data.terminal?'胜负已确定，可在行棋记录中回看关键走法。':data.sides.length>2?'与棋形最领先的对手比较。':phase==='开局'?'十子协同出营，给后排棋子留出借力路线。':own.risk.length?'留意 '+own.risk.slice(0,2).map(x=>x.coordinate).join('、')+' 的后子运输，可展开下方查看。':'沿中路搭桥，兼顾最后一子的入营路线。';
    $('analysis-details').replaceChildren();
    for(const side of data.sides){const line=document.createElement('div');line.className='analysis-side';line.textContent=shortNames[side.player]+'方：入营 '+side.arrived+'/10 · 匹配距离 '+side.matching+' · 后子最远 '+side.rear+' · 运输风险 '+side.tailCost.toFixed(1)+' · 出口/借力代价 '+side.escapeCost.toFixed(1);$('analysis-details').append(line);
      if(side.risk.length){const risk=document.createElement('div');risk.className='analysis-blocked';risk.append('风险棋子：');for(const x of side.risk){const b=document.createElement('button');b.className='risk-link';b.textContent=x.coordinate+(x.isolated?' 孤子':' 后子');b.title='在棋盘定位 '+x.coordinate;b.onclick=()=>{const cell=$('board').querySelector('[data-i="'+x.cell+'"]');cell?.focus();cell?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};risk.append(b);}$('analysis-details').append(risk);}
      if(side.blocked.length){const risk=document.createElement('div');risk.className='analysis-blocked';risk.textContent='无向前落点：'+side.blocked.join('、');$('analysis-details').append(risk);}}
    const anchors=D.bridges(state,perspective);if(anchors.length){const line=document.createElement('div');line.className='analysis-side';line.textContent='当前关键桥梁：'+anchors.slice(0,3).map(x=>x.coordinate+' 支持 '+x.dependencies.map(d=>d.coordinate).join('、')).join('；')+'。撤走桥子时需另搭跳路。';$('analysis-details').append(line);}
    $('risk-pieces').textContent=own.risk.length?'需照顾的后子 / 孤子：'+own.risk.map(x=>x.coordinate+'（'+(x.stranded?'后子借力不足':'孤子')+'）').join('、'):'当前视角没有触发后子 / 孤子风险标记。';
    const chart=$('trend-chart'),restoreFocus=!!document.activeElement&&chart.contains(document.activeElement);chart.replaceChildren();const rows=states.map(s=>resultFor(s,perspective));
    const limit=Math.max(100,...rows.filter(r=>!r.terminal).map(r=>Math.abs(r.score)));const y=v=>75-Math.max(-limit,Math.min(limit,v))/limit*58,x=i=>20+i/Math.max(1,rows.length-1)*480;
    node('line',{x1:20,x2:500,y1:75,y2:75,stroke:'var(--line)','stroke-dasharray':'4 4'},chart);
    node('polyline',{points:rows.map((r,i)=>x(i)+','+y(r.score)).join(' '),fill:'none',stroke:'var(--green)','stroke-width':2.5},chart);
    rows.forEach((r,i)=>{
      const c=node('circle',{cx:x(i),cy:y(r.score),r:i===cursor?5:3,fill:i===cursor?'var(--accent)':'var(--green)',tabindex:i===cursor?0:-1,'data-ply':i,role:'button','aria-label':'复盘第 '+i+' 手，评分 '+r.score.toFixed(1)},chart);
      c.addEventListener('click',()=>onReview(i));
      c.addEventListener('keydown',ev=>{
        const next=ev.key==='ArrowLeft'?Math.max(0,i-1):ev.key==='ArrowRight'?Math.min(rows.length-1,i+1):ev.key==='Home'?0:ev.key==='End'?rows.length-1:ev.key==='Enter'||ev.key===' '?i:null;
        if(next!==null){ev.preventDefault();onReview(next);chart.querySelector('[data-ply="'+next+'"]')?.focus();}
      });
    });
    node('text',{x:20,y:147,'font-size':11,fill:'var(--muted)'},chart).textContent='开局';node('text',{x:435,y:147,'font-size':11,fill:'var(--muted)'},chart).textContent='第 '+(rows.length-1)+' 手';
    if(restoreFocus)chart.querySelector('[data-ply="'+cursor+'"]')?.focus();
    $('compare-levels').disabled=!!worker||state.winner!==null||!!state.draw||!!state.stopped;$('analysis-formula').textContent=data.formula;
  }
  $('compare-levels').onclick=()=>{
    if(!context)return;cancel();const id=token,{states,cursor}=context,state=states[cursor];
    if(state.winner!==null||state.draw||state.stopped)return;
    $('compare-levels').disabled=true;$('level-comparison').textContent='同一局面：基础 0.08 秒、进阶 0.12 秒、高手 0.22 秒…';
    const reps=new Map();states.slice(0,cursor+1).forEach(s=>{const k=E.key(s.board,s.turn);reps.set(k,(reps.get(k)||0)+1);});
    url=URL.createObjectURL(new Blob([window.STARHOP_WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(url);
    const results=[];
    worker.onmessage=({data})=>{
      if(id!==token)return;if(data.error){$('level-comparison').textContent='分析失败：'+data.error;cancel();return;}
      if(data.result){results.push(data.result);$('level-comparison').replaceChildren();for(const r of results){const line=document.createElement('div');line.className='comparison-row';const m=r.move;line.textContent=A.LEVELS[r.level].label+'：'+(m?E.coord(m.from)+' → '+E.coord(m.to):'无合法走法')+' · '+(r.algorithm==='MCTS'?'MCTS':r.planning?'规划 '+r.depth+' 回合':r.depth+' 层')+' · '+(r.time/1000).toFixed(2)+' 秒';$('level-comparison').append(line);}}
      if(data.done){const note=document.createElement('p');note.className='fine-print';note.textContent='不同预算给出的实际建议；同意更深搜索的走法可作为学习参考，不能据此直接认定人类等级。';$('level-comparison').append(note);cancel();}
    };
    worker.onerror=()=>{if(id!==token)return;$('level-comparison').textContent='分析工作线程启动失败';cancel();};
    worker.postMessage({id,type:'compare',state,options:{...StarhopRepetition.searchOptions(states.slice(0,cursor+1)),repetitions:[...reps],seed:20261010+cursor}});
  };
  window.addEventListener('beforeunload',cancel);window.StarhopAnalysisUI={update,cancel};
})();
