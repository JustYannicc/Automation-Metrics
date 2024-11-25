// server.js
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const app = express();

const PORT = 8070;
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Ensure data directory and files exist on startup
async function initializeFiles() {
    try {
        // Create data directory if it doesn't exist
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });

        // Initialize stats.json if it doesn't exist
        try {
            await fs.access(STATS_FILE);
        } catch {
            const initialStats = {
                total_automations: 0,
                total_time_saved: 0,
                total_steps_saved: 0,
                last_updated: new Date().toISOString(),
                projects: {}
            };
            await fs.writeFile(STATS_FILE, JSON.stringify(initialStats, null, 2));
        }

        // Initialize config.json if it doesn't exist
        try {
            await fs.access(CONFIG_FILE);
        } catch {
            const initialConfig = {
                telemetry_password: "your_telemetry_password", // Change this!
                hourly_rates: {}
            };
            await fs.writeFile(CONFIG_FILE, JSON.stringify(initialConfig, null, 2));
        }
    } catch (error) {
        console.error('Error initializing files:', error);
    }
}

// Routes
app.get('/stats.json', async (req, res) => {
    try {
        const stats = await fs.readFile(STATS_FILE, 'utf8');
        res.json(JSON.parse(stats));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read stats' });
    }
});

app.get('/config.json', async (req, res) => {
    try {
        const config = await fs.readFile(CONFIG_FILE, 'utf8');
        res.json(JSON.parse(config));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read config' });
    }
});

app.post('/telemetry', async (req, res) => {
    try {
        const { password, project_name, time_saved_minutes, manual_steps_saved, timestamp } = req.body;
        
        // Validate password
        const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
        if (password !== config.telemetry_password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Update stats
        const stats = JSON.parse(await fs.readFile(STATS_FILE, 'utf8'));
        
        // Initialize project if it doesn't exist
        if (!stats.projects[project_name]) {
            stats.projects[project_name] = {
                automations: 0,
                time_saved_minutes: 0,
                steps_saved: 0,
                last_success: null,
                automation_history: [] // Add this
            };
        }

        // Store automation with timestamp
        stats.projects[project_name].automation_history.push({
            timestamp: timestamp || new Date().toISOString(),
            time_saved_minutes,
            manual_steps_saved
        });

        // Update totals
        const project = stats.projects[project_name];
        project.automations += 1;
        project.time_saved_minutes += time_saved_minutes;
        project.steps_saved += manual_steps_saved;
        project.last_success = new Date().toISOString();

        stats.total_automations += 1;
        stats.total_time_saved += time_saved_minutes;
        stats.total_steps_saved += manual_steps_saved;
        stats.last_updated = new Date().toISOString();

        await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process telemetry' });
    }
});

app.post('/update-rate', async (req, res) => {
    try {
        const { password, project, new_rate, effective_date } = req.body;
        
        // Validate password
        const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
        if (password !== config.telemetry_password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Initialize project rates if needed
        if (!config.hourly_rates[project]) {
            config.hourly_rates[project] = {
                current_rate: new_rate,
                history: []
            };
        }

        // Add new rate to history
        config.hourly_rates[project].history.push({
            rate: new_rate,
            start_date: effective_date
        });
        config.hourly_rates[project].current_rate = new_rate;

        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update rate' });
    }
});

// Start server
initializeFiles().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});