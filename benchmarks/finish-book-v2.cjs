'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),E=require('../js/engine.js');
const folder=path.resolve(__dirname,'../arena-results/finish-book-v2');
const files=[path.join(folder,'manifest.json'),path.join(folder,'book.bin')];
const rotated=E.cells.map(({r,c})=>E.at(16-r,24-c)),bits=E.cells.map((_,i)=>1n<<BigInt(i));
let data,index,manifest;
function load(){
  if(index)return;
  manifest=JSON.parse(fs.readFileSync(files[0],'utf8'));data=fs.readFileSync(files[1]);
  if(manifest.format!=='starhop-friendly-reverse-v1'||data.length!==manifest.entries*24||crypto.createHash('sha256').update(data).digest('hex')!==manifest.sha256)throw Error('Invalid finish database');
  index=new Map();for(let i=0;i<manifest.entries;i++){const o=i*24;index.set(data.readBigUInt64LE(o)|(data.readBigUInt64LE(o+8)<<64n),i);}
}
function continuation(board,p){
  if(p!==0&&p!==3)return null;
  let mask=0n;for(let i=0;i<121;i++)if(board[i]===p)mask|=bits[p===3?i:rotated[i]];
  return continuationMask(mask,p);
}
function continuationMask(mask,p=3){
  const id=index.get(mask);if(id===undefined)return null;
  const plan=[];let n=id;
  while(n){const o=n*24,code=data.readUInt16LE(o+20);let from=code>>>7,to=code&127;if(p===0){from=rotated[from];to=rotated[to];}plan.push({from,to});n=data.readUInt32LE(o+16);}
  return plan;
}
module.exports={load,continuation,continuationMask,files};
