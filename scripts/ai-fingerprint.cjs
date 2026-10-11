'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function fingerprint(entries,root=path.resolve(__dirname,'..')){
  const hashes={};
  function visit(input){
    const absolute=require.resolve(path.resolve(root,input)),relative=path.relative(root,absolute).split(path.sep).join('/');
    if(hashes[relative])return;
    if(relative.startsWith('../'))throw Error('AI dependency outside project: '+absolute);
    const content=fs.readFileSync(absolute);hashes[relative]=crypto.createHash('sha256').update(content).digest('hex');
    if(/\.(?:c?js)$/.test(absolute))for(const m of content.toString('utf8').matchAll(/require\(['"](\.[^'"]+)['"]\)/g))visit(path.resolve(path.dirname(absolute),m[1]));
  }
  for(const entry of entries.filter(Boolean))visit(entry);
  return hashes;
}
module.exports={fingerprint};
