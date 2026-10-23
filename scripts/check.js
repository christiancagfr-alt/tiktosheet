import {readdirSync,readFileSync} from 'node:fs';
import './runtime-check.js';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
for(const dir of ['extension','server','scripts','apps-script','test']) {
  for(const file of readdirSync(dir)) {
    const path=`${dir}/${file}`;
    if(file.endsWith('.js')) {const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(result.status!==0)process.exit(result.status || 1);}
    if(file.endsWith('.json'))JSON.parse(readFileSync(path,'utf8'));
  }
}
new vm.Script(readFileSync('apps-script/Code.gs','utf8'));
console.log('All source scripts, generated Apps Script and manifests passed syntax checks.');
