(function(){
  'use strict';
  const E=Starhop,A=StarhopAI,D=StarhopAnalysis,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  let cache=new WeakMap(),worker=null,url=null,token=0,lastKey=null,lastStates=null,context=null,renderKey='';
  function cancel(){token++;if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);worker=null;url=null;const shown=context?.states[context.cursor];$('compare-levels').disabled=!shown||shown.winner!==null||!!shown.draw;}
  function node(tag,attrs,parent){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;}
  function resultFor(state,p){let record=cache.get(state);if(!record){record=new Map();cache.set(state,record);}if(!record.has(p))record.set(p,D.analyze(state,p));return record.get(p);}
  function update(states,cursor,perspective,onReview){
    context={states,cursor,perspective,onReview};const state=states[cursor],key=E.key(state.board,state.turn)+JSON.stringify(state.rules)+perspective;
    if(key!==lastKey||states!==lastStates){cancel();$('level-comparison').replaceChildren();lastKey=key;lastStates=states;renderKey='';}
    const rk=key+'|'+states.length+'|'+cursor+'|'+state.draw+'|'+state.winner;if(rk===renderKey)return;renderKey=rk;
    const data=resultFor(state,perspective),own=data.sides.find(s=>s.player===perspective);
    $('position-score').textContent=(data.score>=0?'+':'')+data.score.toFixed(1);
    $('position-verdict').textContent=data.draw?'对局结束 · '+data.draw:data.terminal?(data.score>0?'已获胜':'已结束，另一方获胜'):Math.abs(data.score)<25?'双方接近':data.score>0?'当前视角占优':'当前视角落后';
    $('analysis-perspective').textContent='视角：'+['红','蓝','紫','绿','粉','黄'][perspective]+'方 · 第 '+cursor+' 手';
    $('analysis-details').replaceChildren();
    for(const side of data.sides){const line=document.createElement('div');line.className='analysis-side';line.textContent=['红','蓝','紫','绿','粉','黄'][side.player]+'方：入营 '+side.arrived+'/10 · 匹配距离 '+side.matching+' · 后子最远 '+side.rear+' · 运输风险 '+side.tailCost.toFixed(1)+' · 出口/借力代价 '+side.escapeCost.toFixed(1);$('analysis-details').append(line);
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
