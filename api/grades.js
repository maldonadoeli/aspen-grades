const https = require('https');
const http = require('http');
const { URLSearchParams } = require('url');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const lib = options.protocol === 'http:' ? http : https;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return {};
  const cookies = {};
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  headers.forEach(h => {
    const part = h.split(';')[0];
    const [key, ...vals] = part.split('=');
    if (key) cookies[key.trim()] = vals.join('=').trim();
  });
  return cookies;
}

function cookieString(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function scrapeGrades(html) {
  const courses = [];
  const rowRegex = /<tr[^>]*class="[^"]*listRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
      cells.push(text);
    }
    if (cells.length >= 3) {
      const name = cells[0];
      const teacher = cells[1] || '';
      const grade = cells[cells.length - 1];
      if (name && name.length > 2 && !name.includes('Course') && grade) {
        const gradeNum = parseFloat(grade);
        courses.push({ name, teacher, grade, gradeNum: isNaN(gradeNum) ? null : gradeNum });
      }
    }
  }
  return courses;
}

function letterGrade(pct) {
  if (pct === null || pct === undefined) return '—';
  if (pct >= 97) return 'A+';
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 60) return 'D';
  return 'F';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });

  let username, password, district;
  try { ({ username, password, district } = JSON.parse(body)); }
  catch { return res.status(400).json({ error: 'Invalid request body' }); }

  if (!username || !password || !district)
    return res.status(400).json({ error: 'Missing fields' });

  const baseHost = `${district}.myfollett.com`;
  const basePath = '/aspen';

  try {
    const loginPageRes = await request({
      hostname: baseHost, path: `${basePath}/logon.do`, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
    });
    const sessionCookies = parseCookies(loginPageRes.headers['set-cookie']);
    const tokenMatch = loginPageRes.body.match(/name="org\.apache\.struts\.taglib\.html\.TOKEN"\s+value="([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : '';

    const postParams = new URLSearchParams({
      'org.apache.struts.taglib.html.TOKEN': token,
      userEvent: '930', deploymentId: 'x2sis',
      username, password, mobile: '0',
    });
    const postData = postParams.toString();

    const loginRes = await request({
      hostname: baseHost, path: `${basePath}/logon.do`, method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': cookieString(sessionCookies),
        'Referer': `https://${baseHost}${basePath}/logon.do`,
      },
    }, postData);

    const authCookies = { ...sessionCookies, ...parseCookies(loginRes.headers['set-cookie']) };

    const homeRes = await request({
      hostname: baseHost, path: `${basePath}/home.do`, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieString(authCookies) },
    });

    if (homeRes.body.includes('logon.do'))
      return res.status(401).json({ error: 'Invalid username or password' });

    const gradesRes = await request({
      hostname: baseHost, path: `${basePath}/portalStudentDetail.do?navkey=academics.classes.list`, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieString(authCookies) },
    });

    const courses = scrapeGrades(gradesRes.body).map(c => ({ ...c, letter: letterGrade(c.gradeNum) }));
    const gpaMap = { 'A+':4.0,'A':4.0,'A-':3.7,'B+':3.3,'B':3.0,'B-':2.7,'C+':2.3,'C':2.0,'C-':1.7,'D+':1.3,'D':1.0,'F':0.0 };
    const graded = courses.filter(c => c.letter !== '—');
    const gpa = graded.length ? (graded.reduce((s,c) => s+(gpaMap[c.letter]||0),0)/graded.length).toFixed(2) : null;

    return res.status(200).json({ courses, gpa, count: courses.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch grades', detail: err.message });
  }
};
