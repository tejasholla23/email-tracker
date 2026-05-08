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
  res.on('data', (chunk) => {
    body += chunk.toString();
  });
  res.on('end', () => {
    try {
      const apps = JSON.parse(body);
      console.log('COUNT', apps.length);
      if (apps.length > 0) {
        const a = apps[0];
        console.log('COMPANY', a.company);
        console.log('ROLE', a.role);
        console.log('PROGRAM_ROLES', JSON.stringify(a.programRoles));
        console.log('PROGRAM_DURATION', JSON.stringify(a.programDuration));
        console.log('PROGRAM_STIPEND', JSON.stringify(a.programStipend));
        console.log('DEADLINE_TEXT', JSON.stringify(a.deadlineText));
        console.log('COMPINFO', JSON.stringify(a.companyInfo?.shortDescription));
      }
    } catch (err) {
      console.error('PARSE_ERROR', err.message);
      console.error(body.slice(0, 1000));
    }
  });
});

req.on('error', (err) => {
  console.error('REQUEST_ERROR', err.message);
});
req.end();
