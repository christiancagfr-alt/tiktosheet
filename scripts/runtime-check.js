const [major,minor,patch]=process.versions.node.split('.').map(Number);
const floors={22:[23,4],24:[22,1],26:[12,1]};
const floor=floors[major];
if(!floor || minor<floor[0] || (minor===floor[0]&&patch<floor[1]))throw new Error('请使用修复安全漏洞的 Node.js：22.23.4+ / 24.22.1+ / 26.12.1+（限对应大版本）');
