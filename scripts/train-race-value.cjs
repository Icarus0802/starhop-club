'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../js/engine.js'),A=require('../js/ai.js'),F=require('../benchmarks/race-features.cjs');
const root=path.resolve(__dirname,'..'),samples=[],files=[];
for(const dir of fs.readdirSync(path.join(root,'arena-results'),{withFileTypes:true}))if(dir.isDirectory()&&!/(?:holdout|acceptance)/.test(dir.name)){
  for(const file of fs.readdirSync(path.join(root,'arena-results',dir.name)))if(/^game-\d+\.json$/.test(file))files.push(path.join(root,'arena-results',dir.name,file));
}
for(const n of ['master-huaxia-jiuxiao-2017','master-huaxia-jiuxiao-2019','user-loss-79','user-loss-93','user-loss-99'])files.push(path.join(root,'tests/fixtures',n+'.json'));
let games=0;
for(const file of files){
  let r,states;try{r=JSON.parse(fs.readFileSync(file,'utf8'));states=E.replay(r).states;}catch{continue;}
  const end=states.at(-1);if(end.players.length!==2||end.rules.jump!=='short'||end.rules.goalLock||end.winner===null)continue;
  const p=end.winner;let remaining=0;const group=games++;
  for(let i=states.length-1;i>=0;i--){
    const s=states[i];if(i<states.length-1&&s.players[s.turn]===p)remaining++;
    if(s.players[s.turn]!==p&&i!==states.length-1)continue;
    samples.push({x:F.features(s.board,p,A.assignment(s.board,p)),y:remaining,validation:group%5===0});
  }
}
function fit(rows){
  const n=F.names.length,mean=Array(n).fill(0),scale=Array(n).fill(0),ym=rows.reduce((s,r)=>s+r.y,0)/rows.length;
  for(const r of rows)for(let i=0;i<n;i++)mean[i]+=r.x[i]/rows.length;
  for(const r of rows)for(let i=0;i<n;i++)scale[i]+=(r.x[i]-mean[i])**2/rows.length;
  for(let i=0;i<n;i++)scale[i]=Math.sqrt(scale[i])||1;
  const matrix=Array.from({length:n},()=>Array(n+1).fill(0));
  for(const r of rows){const x=r.x.map((v,i)=>(v-mean[i])/scale[i]);for(let i=0;i<n;i++){matrix[i][n]+=x[i]*(r.y-ym);for(let j=0;j<n;j++)matrix[i][j]+=x[i]*x[j];}}
  for(let i=0;i<n;i++)matrix[i][i]+=50;
  for(let i=0;i<n;i++){
    let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(matrix[j][i])>Math.abs(matrix[pivot][i]))pivot=j;
    [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];const div=matrix[i][i];for(let j=i;j<=n;j++)matrix[i][j]/=div;
    for(let k=0;k<n;k++)if(k!==i){const v=matrix[k][i];for(let j=i;j<=n;j++)matrix[k][j]-=v*matrix[i][j];}
  }
  const coefficients=matrix.map((r,i)=>r[n]/scale[i]),intercept=ym-coefficients.reduce((s,c,i)=>s+c*mean[i],0);return {coefficients,intercept};
}
const model=fit(samples.filter(r=>!r.validation)),predict=x=>model.intercept+x.reduce((s,v,i)=>s+v*model.coefficients[i],0),rmse=rows=>Math.sqrt(rows.reduce((s,r)=>s+(predict(r.x)-r.y)**2,0)/rows.length);
const report={features:F.names,...model,games,samples:samples.length,trainingRMSE:rmse(samples.filter(r=>!r.validation)),validationRMSE:rmse(samples.filter(r=>r.validation)),note:'Ridge fit to remaining winner turns in archived games; prediction accuracy is not playing strength. Arena acceptance must use new seeds.'};
fs.writeFileSync(path.join(root,'benchmarks/race-value.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
