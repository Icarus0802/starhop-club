(function(){
  'use strict';
  const E=Starhop,A=StarhopAI,D=StarhopAnalysis,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  let cache=new WeakMap(),worker=null,url=null,token=0,lastKey=null,lastStates=null,context=null,renderKey='';
  function cancel(){token++;if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);worker=null;url=null;const shown=context?.states[context.cursor];$('compare-levels').disabled=!shown||shown.winner!==null||!!shown.draw;}
  function node(tag,attrs,parent){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;}
  function playerName(p,state){return window.StarhopPresentation?.playerName(p)||(state.players.length===2?(state.players.indexOf(p)===0?'先手':'后手'):'第 '+(state.players.indexOf(p)+1)+' 方');}
  function playerColor(p){return window.StarhopPresentation?.playerColor(p)||'var(--green)';}
  function resultFor(state,p){const signature=E.key(state.board,state.turn)+JSON.stringify(state.rules)+'|'+state.winner+'|'+state.draw;let record=cache.get(state);if(!record||record.signature!==signature){record={signature,results:new Map()};cache.set(state,record);}if(!record.results.has(p))record.results.set(p,D.analyze(state,p));return record.results.get(p);}
  function update(states,cursor,perspective,onReview){
    context={states,cursor,perspective,onReview};const state=states[cursor],key=E.key(state.board,state.turn)+JSON.stringify(state.rules)+perspective;
    if(key!==lastKey||states!==lastStates){cancel();$('level-comparison').replaceChildren();lastKey=key;lastStates=states;renderKey='';}
    const rk=key+'|'+states.length+'|'+cursor+'|'+state.draw+'|'+state.winner;if(rk===renderKey)return;renderKey=rk;
    const data=resultFor(state,perspective),own=data.sides.find(s=>s.player===perspective);
    const estimate=data.probability,hasModel=Number.isFinite(estimate?.value),experimental=estimate?.status==='experimental-uncalibrated';
    $('position-score').textContent=data.immediateFinish?(data.immediateFinish.player===perspective?'一步完成':'一步威胁'):(data.score>=0?'+':'')+data.score.toFixed(1);
    $('position-verdict').textContent=data.draw?(estimate?.status==='abandoned'?'对局已停止 · ':'对局结束 · ')+data.draw:data.terminal?(data.score>0?'已获胜':'已结束，另一方获胜'):data.immediateFinish?(data.immediateFinish.player===perspective?'本方下一手即可全部到达':'对手可立即完成'):Math.abs(data.score)<25?'结构评分 · 双方接近':data.score>0?'结构评分 · 当前视角占优':'结构评分 · 当前视角落后';
    if(hasModel){const note=document.createElement('span');note.className='analysis-model-note fine-print';note.style.display='block';note.textContent=(experimental?'实验估计 ':'实际结果 ')+(estimate.value*100).toFixed(1)+'% · 和棋计半'+(experimental?'，未校准':'');$('position-verdict').append(note);}
    $('analysis-perspective').textContent='视角：'+playerName(perspective,state)+' · 第 '+cursor+' 手';
    $('analysis-details').replaceChildren();
    if(data.immediateFinish){const proven=document.createElement('div'),move=data.immediateFinish.winningMove;proven.className='analysis-side';proven.textContent='规则已验证：当前轮到 '+playerName(data.immediateFinish.player,state)+'，'+E.coord(move.from)+' → '+E.coord(move.to)+' 可一步完成全部10子入营。下列实验百分比未作人为上调。';$('analysis-details').append(proven);}
    const modelLine=document.createElement('div');modelLine.className='analysis-side analysis-probability';modelLine.textContent=experimental?'linear-v2：35局训练、11局验证、4局测试；输出为胜1／和0.5／负0的预期得分，不代表对真人或特定对手的胜率。':hasModel?'终局百分比是实际结果，和棋计半。':estimate?.reason||'当前规则不提供模型估计。';$('analysis-details').append(modelLine);
    const structureLine=document.createElement('div');structureLine.className='analysis-side analysis-model-note';structureLine.textContent='结构评分 '+(data.score>=0?'+':'')+data.score.toFixed(1)+'：完整合法跳路与剩余目标孔决定运输风险；风险不是还需多少步。';$('analysis-details').append(structureLine);
    for(const side of data.sides){const line=document.createElement('div');line.className='analysis-side';line.textContent=playerName(side.player,state)+'：入营 '+side.arrived+'/10 · 匹配距离 '+side.matching+' · 后子最远 '+side.rear+' · 后军出口风险 '+side.homeTransport.toFixed(1)+' · 可向未填孔借力 '+side.usefulJumpPieces+' 子 · 运输风险 '+side.tailCost.toFixed(1)+' · 出口/借力代价 '+side.escapeCost.toFixed(1);$('analysis-details').append(line);
      if(side.arrived>=6&&side.unfilledHoles.length){const holes=document.createElement('div');holes.className='analysis-blocked';holes.textContent='未填营孔：'+side.unfilledHoles.map(hole=>hole.coordinate+(hole.occupiedBy>=0?'（被占）':hole.reachableNow?'（本手可达）':'（本手不可达）')).join('、')+(side.entryBlocked.length?'；近营停滞：'+side.entryBlocked.join('、'):'');$('analysis-details').append(holes);}
      if(side.risk.length){const risk=document.createElement('div');risk.className='analysis-blocked';risk.append('风险棋子：');for(const x of side.risk){const b=document.createElement('button');b.className='risk-link';b.textContent=x.coordinate+(x.isolated?' 孤子':' 后子');b.title='在棋盘定位 '+x.coordinate;b.onclick=()=>{const cell=$('board').querySelector('[data-i="'+x.cell+'"]');cell?.focus();cell?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};risk.append(b);}$('analysis-details').append(risk);}
      if(side.blocked.length){const risk=document.createElement('div');risk.className='analysis-blocked';risk.textContent='无向前落点：'+side.blocked.join('、');$('analysis-details').append(risk);}}
    const anchors=D.bridges(state,perspective);if(anchors.length){const line=document.createElement('div');line.className='analysis-side';line.textContent='当前关键桥梁：'+anchors.slice(0,3).map(x=>x.coordinate+' 支持 '+x.dependencies.map(d=>d.coordinate).join('、')).join('；')+'。撤走桥子时需另搭跳路。';$('analysis-details').append(line);}
    $('risk-pieces').textContent=own.risk.length?'需照顾的后子 / 孤子：'+own.risk.map(x=>x.coordinate+'（'+(x.stranded?'后子借力不足':'孤子')+'）').join('、'):'当前视角没有触发后子 / 孤子风险标记。';
    const chart=$('trend-chart'),restoreFocus=!!document.activeElement&&chart.contains(document.activeElement);chart.replaceChildren();const rows=states.map(s=>resultFor(s,perspective));
    const limit=Math.max(100,...rows.filter(r=>!r.terminal).map(r=>Math.abs(r.score)));
    // The small outcome model is currently underfit. Keep real transport and
    // blockade structure as the default trend; its estimate stays secondary.
    const y=r=>75-Math.max(-limit,Math.min(limit,r.score))/limit*58,x=i=>20+i/Math.max(1,rows.length-1)*480,color=playerColor(perspective);
    chart.setAttribute('aria-label','整盘结构评分走势，非胜率，左右键逐手复盘');
    node('line',{x1:20,x2:500,y1:75,y2:75,stroke:'var(--line)','stroke-dasharray':'4 4'},chart);
    node('text',{x:23,y:70,'font-size':10,fill:'var(--muted)'},chart).textContent='结构评分 0';
    node('polyline',{points:rows.map((r,i)=>x(i)+','+y(r)).join(' '),fill:'none',stroke:color,'stroke-width':2.5},chart);
    rows.forEach((r,i)=>{
      const estimateLabel=r.immediateFinish?(r.immediateFinish.player===perspective?'本方下一手即可全部到达；':'对手可立即完成；'):'';
      const c=node('circle',{cx:x(i),cy:y(r),r:i===cursor?5:3,fill:i===cursor?'var(--accent)':color,tabindex:i===cursor?0:-1,'data-ply':i,role:'button','aria-label':'复盘第 '+i+' 手，'+estimateLabel+'结构评分 '+r.score.toFixed(1)},chart);
      c.addEventListener('click',()=>onReview(i));
      c.addEventListener('keydown',ev=>{
        const next=ev.key==='ArrowLeft'?Math.max(0,i-1):ev.key==='ArrowRight'?Math.min(rows.length-1,i+1):ev.key==='Home'?0:ev.key==='End'?rows.length-1:ev.key==='Enter'||ev.key===' '?i:null;
        if(next!==null){ev.preventDefault();onReview(next);chart.querySelector('[data-ply="'+next+'"]')?.focus();}
      });
    });
    node('text',{x:20,y:147,'font-size':11,fill:'var(--muted)'},chart).textContent='开局';node('text',{x:435,y:147,'font-size':11,fill:'var(--muted)'},chart).textContent='第 '+(rows.length-1)+' 手';
    if(restoreFocus)chart.querySelector('[data-ply="'+cursor+'"]')?.focus();
    $('compare-levels').disabled=!!worker||state.winner!==null||!!state.draw;$('analysis-formula').textContent=data.formula;
  }
  $('compare-levels').onclick=()=>{
    if(!context)return;cancel();const id=token,{states,cursor}=context,state=states[cursor];
    if(state.winner!==null||state.draw)return;
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
    worker.postMessage({id,type:'compare',state,options:{repetitions:[...reps],seed:20261010+cursor}});
  };
  window.addEventListener('beforeunload',cancel);window.StarhopAnalysisUI={update,cancel};
})();
