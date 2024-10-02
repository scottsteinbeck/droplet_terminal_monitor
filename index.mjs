

import chalk from 'chalk';
import Table from 'cli-table3';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_TOKEN = process.env.DO_API_TOKEN;
const DROPLET_ID = process.env.DROPLET_ID;

const POLL_INTERVAL = 30000; // 1 minute (60,000 milliseconds)

// Helper function to calculate the percentage
function calculatePercentage(used, total) {
    return ((used / total) * 100).toFixed(2);
}
async function getDropletMetrics(DROPLET_ID) {

    const droplet_res = await axios.get('https://api.digitalocean.com/v2/droplets', {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
        }
    });

    const droplet_ids = droplet_res.data.droplets;


    // Collect all metrics in parallel
    const dropletData = await Promise.all(
        droplet_ids.map(async (droplet) => {
            const metrics = await getMetrics(droplet);
            return metrics;
        })
    );

    // Now display the table or graph
    graphStats(dropletData);
}



// Helper to parse numeric percentage from strings
const parsePercentage = (str) => parseFloat(str.match(/(\d+\.\d+)%/)[1]);

// Function to generate a progress bar string
const generateProgressBar = (percentage, totalBars = 20) => {
  const barLength = Math.round((percentage / 100) * totalBars);
  return chalk.cyan('▮'.repeat(barLength) + '▯'.repeat(totalBars - barLength));
};
async function graphStats (dropletData) {
   //console.clear();

  // Create a table instance
  const table = new Table({
    head: [
      chalk.bold('Name'),
      chalk.bold('Size'),
      chalk.bold('CPU'),
      chalk.bold('Memory'),
      chalk.bold('Load 5m'),
      chalk.bold('File Storage')
    ],
    colWidths: [25, 15,25, 30, 10, 30] // Adjust column widths to fit content
  });

  // Iterate over each droplet and add its data to the table
  dropletData.forEach((droplet) => {
    const cpuUsagePercent = parsePercentage(droplet['CPU']);
    const memoryUsagePercent = parsePercentage(droplet['Memory']);
    const filesystemUsagePercent = parsePercentage(droplet['Filesystem']);

    const cpuCell = `${droplet['CPU']}\n${generateProgressBar(cpuUsagePercent)}`;
    const memoryCell = `${droplet['Memory']}\n${generateProgressBar(memoryUsagePercent)}`;
    const filesystemCell = `${droplet['Filesystem']}\n${generateProgressBar(filesystemUsagePercent)}`;
    const loadCell = droplet['Load 5m'];

    table.push([
      chalk.bold(droplet['Name']),
      chalk.bold(droplet['Size']),
      cpuCell,
      memoryCell,
      chalk.yellow(loadCell),
      filesystemCell
    ]);
  });

  // Output the table to the console
  console.log(table.toString());
}

async function getMetrics(droplet) {
    const now = new Date();
    const endTime = now.toISOString(); // Current time
    const startTime = new Date(now.getTime() - POLL_INTERVAL).toISOString(); // 1 minute ago

    // API endpoints for different metrics
    const cpuUrl = `https://api.digitalocean.com/v2/monitoring/metrics/droplet/cpu`;
    const memoryAvailableUrl = `https://api.digitalocean.com/v2/monitoring/metrics/droplet/memory_available`;
    const memoryTotalUrl = `https://api.digitalocean.com/v2/monitoring/metrics/droplet/memory_total`;
    const load5Url = `https://api.digitalocean.com/v2/monitoring/metrics/droplet/load_5`;
    const filesystemSizeUrl = `https://api.digitalocean.com/v2/monitoring/metrics/droplet/filesystem_size`;
    const filesystemFreeUrl = `https://api.digitalocean.com/v2/monitoring/metrics/droplet/filesystem_free`;
    const data = {
        'Name': droplet.name,
        'Size': droplet.size_slug,
        'CPU': 'N/A',
        'Memory': 'N/A',
        'Filesystem': '',
        'Load 5m': 'N/A',
    };

    const params = {
        host_id: droplet.id,
        start: startTime,
        end: endTime,
        granularity: '1m', // 1 minute granularity
    };

    try {
        // Fetch CPU metrics
        const cpuResponse = await axios.get(cpuUrl, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            params: params,
        });

        // Process CPU metrics
        const cpuData = cpuResponse.data.data.result;
        let totalIdle = 0;
        let totalActive = 0;

        cpuData.forEach((cpuMetric) => {
            const mode = cpuMetric.metric.mode;
            const latestValue = cpuMetric.values[cpuMetric.values.length - 1][1]; // Get the most recent value

            if (mode === 'idle') {
                totalIdle += parseFloat(latestValue);
            } else if (['user', 'system'].includes(mode)) {
                totalActive += parseFloat(latestValue);
            }
        });

        // Calculate total time and CPU usage percentage
        const totalTime = totalIdle + totalActive;
        const cpuUsagePercent = calculatePercentage(totalActive, totalTime);

        data['CPU'] = `${cpuUsagePercent}%`;

        // Fetch memory free metrics
        const memoryAvailableResponse = await axios.get(memoryAvailableUrl, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            params: params,
        });

        // Fetch memory total metrics
        const memoryTotalResponse = await axios.get(memoryTotalUrl, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            params: params,
        });

        // Process memory free and total metrics
        const memoryAvailableData = memoryAvailableResponse.data.data.result;
        const memoryTotalData = memoryTotalResponse.data.data.result;

        const memoryAvailable = memoryAvailableData.length ? parseFloat(memoryAvailableData[0].values[memoryAvailableData[0].values.length - 1][1]) : 0;
        const memoryTotal = memoryTotalData.length ? parseFloat(memoryTotalData[0].values[memoryTotalData[0].values.length - 1][1]) : 0;
        //console.log(name, 'memoryAvailable', memoryAvailable/1024, 'memoryTotal', memoryTotal/1024);
        if (memoryAvailable && memoryTotal) {
            const memoryUsed = memoryTotal - memoryAvailable;
            const memoryUsagePercent = calculatePercentage(memoryUsed, memoryTotal);
            data['Memory'] = `${memoryUsagePercent}% (${(memoryUsed / (1024 * 1024 * 1024)).toFixed(2)}GB/${(memoryTotal / (1024 * 1024 * 1024)).toFixed(2)}GB)`;
            //console.log(`Memory Usage: ${memoryUsagePercent}% (${(memoryUsed / (1024 * 1024 * 1024)).toFixed(2)} GB used of ${(memoryTotal / (1024 * 1024 * 1024)).toFixed(2)} GB total)`);
        }

        // Fetch and process filesystem metrics
        const filesystemSizeResponse = await axios.get(filesystemSizeUrl, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            params: params,
        });

        const filesystemFreeResponse = await axios.get(filesystemFreeUrl, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            params: params,
        });

        const filesystemSizeData = filesystemSizeResponse.data.data.result;
        const filesystemFreeData = filesystemFreeResponse.data.data.result;

        // Loop through the filesystem data and calculate usage
        filesystemSizeData.forEach((sizeEntry, index) => {
            const device = sizeEntry.metric.device;
            const mountpoint = sizeEntry.metric.mountpoint;

            const latestSize = parseFloat(sizeEntry.values[sizeEntry.values.length - 1][1]);
            const latestFree = parseFloat(filesystemFreeData[index].values[filesystemFreeData[index].values.length - 1][1]);

            const usedSpace = latestSize - latestFree;
            const usagePercent = calculatePercentage(usedSpace, latestSize);
            if(mountpoint === '/'){
                data['Filesystem'] = `${usagePercent}% (${(usedSpace / (1024 * 1024 * 1024)).toFixed(2)}GB/${(latestSize / (1024 * 1024 * 1024)).toFixed(2)}GB)`;
            }
            //console.log(`Filesystem Usage on ${mountpoint} (${device}): ${usagePercent}% (${(usedSpace / (1024 * 1024 * 1024)).toFixed(2)} GB used of ${(latestSize / (1024 * 1024 * 1024)).toFixed(2)} GB total)`);
        });

        // Fetch and process load5 metrics
        const load5Response = await axios.get(load5Url, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            params: params,
        });

        const load5Data = load5Response.data.data.result;
        if (load5Data.length) {
            const load5Value = load5Data[0].values[load5Data[0].values.length - 1][1];
            data['Load 5m'] = load5Value;
           //console.log(`Load (5 min average): ${load5Value}`);
        }

    } catch (error) {
        console.error('Error fetching metrics:', error.response ? error.response.data : error.message);
    }
    return data;
}

// Poll every minute
setInterval(getDropletMetrics, POLL_INTERVAL);

// Immediately fetch once on startup
getDropletMetrics();
