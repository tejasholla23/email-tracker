const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\279ae157-6860-45ca-9d81-8c23ca72689c';
const files = fs.readdirSync(dir);

const fileInfos = files.map(file => {
  const filePath = path.join(dir, file);
  const stats = fs.statSync(filePath);
  return {
    name: file,
    mtime: stats.mtime,
    size: stats.size
  };
});

fileInfos.sort((a, b) => b.mtime - a.mtime);

console.log("Newest files in brain directory:");
fileInfos.slice(0, 10).forEach(f => {
  console.log(`- ${f.name} | mtime: ${f.mtime.toISOString()} | size: ${f.size} bytes`);
});
