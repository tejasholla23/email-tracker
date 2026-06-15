const https = require('https');

const domain = 'thisisafakedonotexist123.com';
const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

fetch(googleFaviconUrl)
  .then(res => res.arrayBuffer())
  .then(buffer => {
    console.log("Length:", buffer.byteLength);
  });
