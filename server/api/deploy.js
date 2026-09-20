const executeUpdateScripts = () => {
    const fs = require('fs');
    const path = require('path');
    const { db, run } = require('../database/db');
    
    // Path to the database update script
    const updateScriptPath = path.join(__dirname, '../database/update.sql');
    
    // Read and execute the update script if exists
    if (fs.existsSync(updateScriptPath)) {
        const updateScript = fs.readFileSync(updateScriptPath).toString();
        
        // Execute the update script against the database
        run(updateScript)
            .then(() => {
                console.log('Database updated successfully.');
                console.log('Update script executed.');
                fs.unlinkSync(updateScriptPath);
            })
            .catch(error => {
                console.error('Error executing update script:', error);
            });
    } else {
        console.log('Update script does not exist.');
    }
};

module.exports = { executeUpdateScripts };