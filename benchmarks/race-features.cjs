'use strict';
const E=require('../js/engine.js');
const near=E.zones.map((_,p)=>E.cells.map((__,i)=>Math.min(...E.zones[(p+3)%6].map(g=>E.distances[i][g]))));
const center=E.cells.flatMap((_,i)=>E.zoneOf[i]<0?[i]:[]),depth=E.cells.map((_,i)=>E.zoneOf[i]>=0?Math.min(...center.map(j=>E.distances[i][j])):0);
const detour=E.zones.map((_,p)=>E.cells.map(({r,c},i)=>E.zoneOf[i]===p||E.zoneOf[i]===(p+3)%6?0:depth[i]**2+.35*Math.max(0,Math.abs((c-12)/2*Math.cos(p*Math.PI/3)+(r-8)*Math.sqrt(3)/2*Math.sin(p*Math.PI/3))-1.5)**2));
const parity=E.cells.map(({r,c})=>(r&1)*2+(((c-r)/2)&1)),jump=E.rays.map(row=>row.map(ray=>ray[1]??-1));
const seen=new Uint32Array(121),queue=new Int16Array(121);let stamp=0;
const names=['assignment','lagSquared','arrived','home','maxDistance','isolation','detour','adjacentPairs','span','pairDistance','parityDeficit','goalDepth1','goalDepth2','goalDepth3','goalDepth4','distance1to3','distance4to6','distance7to9','distance10plus','relayGain','blockedTail','rearRelayGain','goalAccess','maxGap'];
function features(board,p,assignment,pieces){
  if(!pieces)pieces=board.flatMap((v,i)=>v===p?[i]:[]);
  const f=Array(names.length).fill(0),goal=(p+3)%6,pc=[0,0,0,0],gc=[0,0,0,0];let min=99,max=0;
  f[0]=assignment;
  for(const i of E.zones[goal])gc[parity[i]]++;
  for(const i of pieces){
    const d=near[p][i];f[1]+=d*d;f[2]+=d===0;f[3]+=E.zoneOf[i]===p;max=Math.max(max,d);min=Math.min(min,d);f[6]+=detour[p][i];pc[parity[i]]++;
    if(d===0)f[10+depth[i]]++;
    else f[d<=3?15:d<=6?16:d<=9?17:18]++;
    let gap=99;for(const j of pieces)if(i!==j){const dist=E.distances[i][j];gap=Math.min(gap,dist);f[9]+=dist;}
    if(d>2){f[5]+=Math.max(0,gap-2)**2;f[23]=Math.max(f[23],gap);}
    for(const j of E.adjacent[i])if(j>=0&&board[j]===p)f[7]++;
    if(d===0)continue;
    const mark=++stamp;seen[i]=mark;queue[0]=i;let tail=1,gain=0;
    for(let head=0;head<tail;head++){
      const here=queue[head];
      for(let dir=0;dir<6;dir++){
        const mid=E.adjacent[here][dir],to=jump[here][dir];
        if(mid<0||to<0||mid===i||board[mid]!==p||board[to]===p||seen[to]===mark)continue;
        seen[to]=mark;queue[tail++]=to;gain=Math.max(gain,d-near[p][to]);
      }
    }
    f[19]+=Math.min(gain,6);if(d>4){f[20]+=gain<2?d:0;f[21]+=Math.min(gain,6)*d;}
  }
  for(const i of E.zones[goal])if(board[i]!==p)for(const j of E.adjacent[i])if(j>=0&&board[j]===p)f[22]+=depth[i];
  f[4]=max;f[8]=max-min;f[10]=pc.reduce((sum,n,i)=>sum+Math.max(0,gc[i]-n),0);return f;
}
module.exports={features,names};
