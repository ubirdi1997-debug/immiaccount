// VEVO Proxy & Dynamic Page Injector (Port 8080)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { db, initDatabase, visaOps, adminOps, verifyPassword } from './database.mjs';
import * as cheerio from 'cheerio';

const PORT = process.env.PORT || 8080;
const upstream = 'https://online.immi.gov.au';
const origin = process.env.ORIGIN || 'https://vevo.usafe.in';

// Initialize database
initDatabase();

// Rate limiting map
const attempts = new Map();

// Load VEVO result page template
const vevoResultTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visa Entitlement Verification Online - Result</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        .header {
            background: #1a365d;
            color: white;
            padding: 20px 0;
            border-bottom: 4px solid #d4af37;
        }
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        .coat-of-arms {
            width: 60px;
            height: 60px;
            background: #d4af37;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        .header h1 {
            font-size: 20px;
            font-weight: 400;
        }
        .header h1 strong {
            display: block;
            font-size: 24px;
            font-weight: 700;
        }
        .container {
            max-width: 900px;
            margin: 40px auto;
            padding: 0 20px;
        }
        .result-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .result-header {
            background: {{STATUS_COLOR}};
            color: white;
            padding: 24px;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .status-icon {
            width: 48px;
            height: 48px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        .result-header h2 {
            font-size: 22px;
            font-weight: 600;
        }
        .result-header p {
            opacity: 0.9;
            margin-top: 4px;
        }
        .result-body {
            padding: 32px;
        }
        .section {
            margin-bottom: 32px;
        }
        .section:last-child {
            margin-bottom: 0;
        }
        .section h3 {
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e0e0e0;
        }
        .detail-row {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 16px;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            color: #666;
            font-size: 14px;
        }
        .detail-value {
            font-weight: 500;
            color: #333;
        }
        .entitlements-list {
            list-style: none;
        }
        .entitlements-list li {
            padding: 12px 16px;
            background: #f8f9fa;
            border-left: 4px solid {{STATUS_COLOR}};
            margin-bottom: 8px;
            border-radius: 4px;
        }
        .footer-banner {
            background: #1a365d;
            color: white;
            padding: 24px;
            text-align: center;
            font-size: 13px;
        }
        .disclaimer {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
            font-size: 14px;
        }
        .print-button {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: {{STATUS_COLOR}};
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .print-button:hover {
            opacity: 0.9;
        }
        @media print {
            .print-button { display: none; }
            .result-card { box-shadow: none; }
            body { background: white; }
        }
        @media (max-width: 600px) {
            .detail-row {
                grid-template-columns: 1fr;
                gap: 4px;
            }
            .header-content {
                flex-direction: column;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="coat-of-arms">🇦🇺</div>
            <div>
                <h1><strong>Department of Home Affairs</strong></h1>
                <h1>Visa Entitlement Verification Online (VEVO)</h1>
            </div>
        </div>
    </header>
    
    <div class="container">
        <div class="disclaimer">
            <strong>Disclaimer:</strong> This is a private system for authorized use only. Official visa information should be verified at <a href="https://online.immi.gov.au">online.immi.gov.au</a>
        </div>
        
        <div class="result-card">
            <div class="result-header">
                <div class="status-icon">{{STATUS_ICON}}</div>
                <div>
                    <h2>{{STATUS_TITLE}}</h2>
                    <p>{{VISA_CLASS}}</p>
                </div>
            </div>
            
            <div class="result-body">
                <div class="section">
                    <h3>Visa Holder Details</h3>
                    <div class="detail-row">
                        <span class="detail-label">Name</span>
                        <span class="detail-value">{{GIVEN_NAMES}} {{FAMILY_NAME}}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Date of Birth</span>
                        <span class="detail-value">{{DATE_OF_BIRTH}}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Passport</span>
                        <span class="detail-value">{{PASSPORT_NUMBER}} ({{COUNTRY_OF_PASSPORT}})</span>
                    </div>
                </div>
                
                <div class="section">
                    <h3>Visa Details</h3>
                    <div class="detail-row">
                        <span class="detail-label">Visa Type</span>
                        <span class="detail-value">{{VISA_CLASS}}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Visa Description</span>
                        <span class="detail-value">{{VISA_DESCRIPTION}}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Visa Status</span>
                        <span class="detail-value">{{VISA_STATUS}}</span>
                    </div>
                    {{GRANT_DATE_ROW}}
                    {{EXPIRY_DATE_ROW}}
                    {{ARRIVAL_ROW}}
                    {{PERIOD_ROW}}
                    {{ENTRIES_ROW}}
                    {{LOCATION_ROW}}
                </div>
                
                {{ENTITLEMENTS_SECTION}}
                
                {{CONDITIONS_SECTION}}
            </div>
            
            <div class="footer-banner">
                <p>Visa Entitlement Verification Online (VEVO) - Private System</p>
                <p style="margin-top: 8px; opacity: 0.8;">For official records, visit https://online.immi.gov.au</p>
            </div>
        </div>
    </div>
    
    <button class="print-button" onclick="window.print()">🖨️ Print / Save PDF</button>
    
    <script>
        console.log('Private VEVO System - Use for authorized verification only');
    </script>
</body>
</html>`;

const statusConfig = {
  'In Effect': { color: '#28a745', icon: '✓', title: 'In Effect' },
  'Approved': { color: '#28a745', icon: '✓', title: 'Approved' },
  'In Progress': { color: '#ffc107', icon: '⏳', title: 'In Progress' },
  'Not In Effect': { color: '#6c757d', icon: '⊘', title: 'Not In Effect' },
  'Cancelled': { color: '#dc3545', icon: '✕', title: 'Cancelled' },
  'Rejected': { color: '#dc3545', icon: '✕', title: 'Rejected' }
};

function generateVevoResult(visa) {
  const config = statusConfig[visa.visa_status] || statusConfig['In Progress'];
  
  let html = vevoResultTemplate
    .replace(/\{\{STATUS_COLOR\}\}/g, config.color)
    .replace(/\{\{STATUS_ICON\}\}/g, config.icon)
    .replace(/\{\{STATUS_TITLE\}\}/g, config.title)
    .replace(/\{\{GIVEN_NAMES\}\}/g, visa.given_names)
    .replace(/\{\{FAMILY_NAME\}\}/g, visa.family_name)
    .replace(/\{\{DATE_OF_BIRTH\}\}/g, visa.date_of_birth)
    .replace(/\{\{PASSPORT_NUMBER\}\}/g, visa.passport_number)
    .replace(/\{\{COUNTRY_OF_PASSPORT\}\}/g, visa.country_of_passport)
    .replace(/\{\{VISA_CLASS\}\}/g, visa.visa_class_subclass)
    .replace(/\{\{VISA_DESCRIPTION\}\}/g, visa.visa_description)
    .replace(/\{\{VISA_STATUS\}\}/g, visa.visa_status);
  
  // Optional date fields
  html = html.replace('{{GRANT_DATE_ROW}}', visa.grant_date ? `
    <div class="detail-row">
        <span class="detail-label">Date of Grant</span>
        <span class="detail-value">${visa.grant_date}</span>
    </div>` : '');
  
  html = html.replace('{{EXPIRY_DATE_ROW}}', visa.expiry_date ? `
    <div class="detail-row">
        <span class="detail-label">Expiry Date</span>
        <span class="detail-value">${visa.expiry_date}</span>
    </div>` : '');
  
  html = html.replace('{{ARRIVAL_ROW}}', visa.must_not_arrive_after ? `
    <div class="detail-row">
        <span class="detail-label">Must Not Arrive After</span>
        <span class="detail-value">${visa.must_not_arrive_after}</span>
    </div>` : '');
  
  html = html.replace('{{PERIOD_ROW}}', visa.period_of_stay ? `
    <div class="detail-row">
        <span class="detail-label">Period of Stay</span>
        <span class="detail-value">${visa.period_of_stay}</span>
    </div>` : '');
  
  html = html.replace('{{ENTRIES_ROW}}', visa.entries_allowed ? `
    <div class="detail-row">
        <span class="detail-label">Entries Allowed</span>
        <span class="detail-value">${visa.entries_allowed}</span>
    </div>` : '');
  
  html = html.replace('{{LOCATION_ROW}}', visa.location_at_grant ? `
    <div class="detail-row">
        <span class="detail-label">Location at Time of Grant</span>
        <span class="detail-value">${visa.location_at_grant}</span>
    </div>` : '');
  
  // Entitlements section
  let entitlementsHtml = '';
  if (visa.work_entitlements?.length || visa.study_entitlements?.length) {
    entitlementsHtml = '<div class="section"><h3>Work and Study Entitlements</h3><ul class="entitlements-list">';
    
    if (visa.work_entitlements?.length) {
      for (const ent of visa.work_entitlements) {
        entitlementsHtml += `<li><strong>Work:</strong> ${ent}</li>`;
      }
    }
    
    if (visa.study_entitlements?.length) {
      for (const ent of visa.study_entitlements) {
        entitlementsHtml += `<li><strong>Study:</strong> ${ent}</li>`;
      }
    }
    
    entitlementsHtml += '</ul></div>';
  }
  html = html.replace('{{ENTITLEMENTS_SECTION}}', entitlementsHtml);
  
  // Conditions section
  let conditionsHtml = '';
  if (visa.other_conditions?.length) {
    conditionsHtml = '<div class="section"><h3>Visa Conditions</h3><ul class="entitlements-list">';
    for (const cond of visa.other_conditions) {
      conditionsHtml += `<li>${cond}</li>`;
    }
    conditionsHtml += '</ul></div>';
  }
  html = html.replace('{{CONDITIONS_SECTION}}', conditionsHtml);
  
  return html;
}

// Create proxy server
const server = createServer(async (req, res) => {
  const reply = (status, message, extra = {}) => {
    res.writeHead(status, { 
      'Content-Type': typeof message === 'object' ? 'application/json' : 'text/html',
      'charset': 'utf-8',
      'Cache-Control': 'no-store',
      ...extra 
    });
    res.end(typeof message === 'object' ? JSON.stringify(message) : message);
  };
  
  try {
    // Rate limiting
    const key = req.socket.remoteAddress;
    const now = Date.now();
    for (const [id, entry] of attempts) if (entry.until < now) attempts.delete(id);
    const entry = attempts.get(key) || { count: 0, until: now + 900000 };
    if (entry.count >= 20) {
      return reply(429, '<h1>Too many failed attempts</h1><p>Try again in 15 minutes.</p>');
    }
    
    // Check authentication
    const auth = /^Basic ([A-Za-z0-9+/=]+)$/.exec(req.headers.authorization || '');
    const decoded = auth ? Buffer.from(auth[1], 'base64').toString('utf8') : '';
    const separator = decoded.indexOf(':');
    const login = separator > 0 ? decoded.slice(0, separator) : '';
    const password = separator > 0 ? decoded.slice(separator + 1) : '';
    
    const admin = separator > 0 ? adminOps.verify(login, password) : null;
    
    if (!admin) {
      if (auth) {
        entry.count++;
        attempts.set(key, entry);
      }
      return reply(401, '<h1>Authentication Required</h1><p>Sign in with admin credentials.</p>', {
        'WWW-Authenticate': 'Basic realm="VEVO Proxy", charset="UTF-8"'
      });
    }
    
    // Handle VEVO query
    const url = new URL(req.url, origin);
    
    // Redirect root to query page
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/evo/firstParty?actionType=query' });
      return res.end();
    }
    
    // VEVO query page - proxy from upstream
    if (url.pathname === '/evo/firstParty' && url.searchParams.get('actionType') === 'query') {
      // Check if this is a form submission
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        
        // Parse form data
        const params = new URLSearchParams(body);
        const passport = params.get('passportNo') || params.get('passportNumber');
        const reference = params.get('referenceNumber') || params.get('trn');
        const dob = params.get('dateOfBirth');
        
        if (passport && reference) {
          // Look up in local database
          const visa = visaOps.findByQuery(passport, reference, dob);
          
          if (visa) {
            // Serve replica result page
            const html = generateVevoResult(visa);
            return reply(200, html);
          }
        }
      }
      
      // Pass through to upstream
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.authorization;
      
      const response = await fetch(`${upstream}/evo/firstParty?actionType=query`, {
        headers: { 'User-Agent': headers['user-agent'] }
      });
      
      const html = await response.text();
      
      // Inject our script
      const modifiedHtml = html.replace(
        '</body>',
        `<script>
          console.log('Private VEVO Proxy Active');
          if (window.location.href.includes('firstParty')) {
            const notice = document.createElement('div');
            notice.innerHTML = '<div style="background:#fff3cd;border:1px solid #ffc107;padding:12px 20px;font-size:13px;text-align:center;"><strong>Private VEVO System</strong> - Authenticate to view managed records</div>';
            document.body.prepend(notice);
          }
        </script></body>`
      );
      
      res.writeHead(response.status, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      });
      return res.end(modifiedHtml);
    }
    
    // Proxy all other requests to upstream
    const target = new URL(req.url, upstream);
    const response = await fetch(target.toString(), {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': req.headers.accept
      },
      redirect: 'manual'
    });
    
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'text/html',
      'Cache-Control': 'no-store'
    });
    res.end(await response.arrayBuffer());
    
  } catch (e) {
    console.error('Proxy error:', e);
    if (!res.headersSent) {
      reply(502, '<h1>Service Error</h1><p>The official service could not be reached.</p>');
    }
  }
});

server.listen(PORT, () => {
  console.log(`VEVO Proxy running on port ${PORT}`);
});

export { server };