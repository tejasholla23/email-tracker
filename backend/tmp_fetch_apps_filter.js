const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/applications',
  method: 'GET',
  headers: {
    'x-user-email': '1ms23ci126@msrit.edu'
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    const apps = JSON.parse(body);
    const filtered = apps.filter(a => a.company === 'Nokia' || a.programRoles || a.programDuration || a.programStipend || a.deadlineText);
    console.log('FILTERED_COUNT', filtered.length);
    for (const a of filtered) {
      console.log('---');
      console.log('COMPANY', a.company);
      console.log('ROLE', a.role);
      console.log('PROGRAM_ROLES', JSON.stringify(a.programRoles));
      console.log('PROGRAM_DURATION', JSON.stringify(a.programDuration));
      console.log('PROGRAM_STIPEND', JSON.stringify(a.programStipend));
      console.log('DEADLINE_TEXT', JSON.stringify(a.deadlineText));
      console.log('LINK', JSON.stringify(a.link));
      console.log('RAW', JSON.stringify(a.rawText.slice(0, 300)));
    }
  });
});
req.on('error', (err) => console.error('REQ_ERR', err.message));
req.end();
