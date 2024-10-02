# Droplet Terminal Monitor

Droplet Terminal Monitor is a Node.js project that uses the DigitalOcean API to display a table with graphs in the terminal. It provides real-time monitoring of your DigitalOcean droplets, including CPU, memory, and file storage usage.

## Features
- Real-time monitoring of DigitalOcean droplets.
- Displays CPU, memory, and file storage usage.
- Generates a table with visual progress bars for each metric.

## Prerequisites
- Node.js (version 14 or higher)
- npm (Node Package Manager)
- DigitalOcean account with API token

## Installation

1. **Clone the repository:**
    ```sh
    git clone https://github.com/scottsteinbeck/droplet_terminal_monitor.git
    cd droplet_terminal_monitor
    ```

2. **Install dependencies:**
    ```sh
    npm install
    ```

3. **Setup environment variables:**
    Create a `.env` file in the root directory and add your DigitalOcean API token and droplet ID:
    ```env
    DO_API_TOKEN=your_digitalocean_api_token
    ```

## Usage

To start the monitor, run the following command:
```sh
node index.mjs
