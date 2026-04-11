# VPS Deployment Guide for NIKKE UniRaid Calculator


This document provides a complete A-to-Z guide for deploying the NIKKE UniRaid Calculator project to a brand-new VPS (running Ubuntu 22.04 / 24.04), including configuring a custom domain and installing SSL.

In particular, this guide is optimized for the **On-Demand (Pay-Per-Hour) VPS model**: spin up quickly at the start of a Raid season → restore data from the previous season → when the season ends, back up the data and destroy the server.

---

## VPS Information to Record

After renting a VPS, note down the following details for use throughout the deployment process:

| Parameter | Value |
|-----------|-------|
| **IPv4** | `<YOUR_VPS_IP>` |
| **OS** | Ubuntu 22.04 / 24.04 LTS (64-bit) |
| **Specs** | See **Recommended VPS Configuration** below |
| **SSH** | `root@<YOUR_VPS_IP>` — Port `22` |

## Recommended VPS Configuration

> [!IMPORTANT]
> **Minimum configuration to handle peak load:**
>
> | Parameter | Recommended | Minimum | Notes |
> |-----------|-------------|---------|-------|
> | **vCPU** | 2 Cores x86_64 | 1 Core | ILP solver is single-threaded, solves in < 1 second |
> | **RAM** | 2 GB | 1 GB | Runtime ~200MB; build peak ~1.5GB (only during `npm run build`) |
> | **Storage** | 20 GB SSD | 10 GB SSD | `node_modules` ~350MB + `.next` build ~150MB + DB ~1MB |
> | **OS** | Ubuntu 22.04 / 24.04 LTS | Any x86_64 Linux with Node.js 20+ |
>
> The current VPS (2 vCPU / 2 GB / 20 GB) **fully handles** both build and runtime.

### Peak Load Analysis

The application has **3 operational phases** with different resource requirements:

| Phase | CPU | RAM | Duration | Notes |
|-------|-----|-----|----------|-------|
| **Build** (`npm run build`) | 100% 1 core | ~1.5 GB peak | 60–120 seconds | Runs once only on deploy/update |
| **Runtime idle** (SSR + API) | < 5% | ~150–200 MB | Continuous | Next.js standalone server serving the web |
| **ILP Solver** (`POST /api/optimize`) | 100% 1 core | +50–80 MB | **< 1 second** | Heaviest load but extremely brief |

#### ILP Solver Details (peak workload)

The solver uses **GLPK.js** (WASM, 287KB binary) to solve an Integer Linear Programming optimization problem:

| Metric | Measured value (32 members × 5 bosses × 3 levels) |
|--------|----------------------------------------------------|
| **Binary variables** | ~1,400 (y_m_c) + 2 gate vars |
| **Constraints** | ~50–70 (member + damage + level gate) |
| **Solve time** | **400–800ms** (Optimal solution) |
| **WASM memory** | ~50 MB peak |
| **Result** | 22/32 members assigned, total effective ~1.44T |

> **Conclusion:** The solver is fast enough that the HTTP request completes in < 2 seconds (including DB read/write). No need for 4 cores or 4GB RAM. **2 vCPU + 2GB is more than sufficient** for runtime. For building on the same machine, 2GB RAM is enough (Next.js standalone build is lighter than a full build).
>
> *(Tip: With 1 vCPU + 1GB RAM, many VPS providers charge very little per hour — roughly **$1–2 for an entire 3–5 day Raid season**!)*

> [!TIP]
> **If the build fails with `FATAL ERROR: Reached heap limit` on a 1GB RAM VPS:**
> Create a temporary 2GB swap file just for building, then remove it afterward:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> npm run build
> sudo swapoff /swapfile && sudo rm /swapfile
> ```

**Pre-requisites Before Running Commands:**
1. Successfully SSH'd into the VPS: `ssh root@<YOUR_VPS_IP>`
2. You have the `prod.db` SQLite file backed up from the previous season. If this is the Union's first time, skip this.
3. *(Optional)* A domain name already purchased, to be pointed to the VPS in Stage 5.

## Stage 1: Install Platform Software

Run the following commands in sequence to install **Node.js (v20)** and the **PM2** process manager.

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 and build tools
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential

# Install PM2 (manages the app running 24/7 in the background)
sudo npm install -g pm2
```

## Stage 2: Download Source Code and Configure

```bash
# 1. Clone the source code to the VPS
git clone <YOUR_REPOSITORY_URL> /var/www/nikke-raid

# 2. Navigate to the source directory (ALL commands from this point run from here)
cd /var/www/nikke-raid

# 3. Create the data directory for the SQLite database
mkdir -p data

# 4. Create the environment variables file (.env)
cat > .env << 'EOF'
DATABASE_URL="file:/var/www/nikke-raid/data/prod.db"
NODE_ENV=production
ADMIN_PASSWORD=change_me_in_production
EOF
```

> [!WARNING]
> **Required:** Change `ADMIN_PASSWORD` to a genuinely strong password before sharing the link with your Union. This is the password the Leader uses to access administrative features (creating Raids, configuring Bosses, running Optimize).

> [!TIP]
> **If you have data from a previous Raid season:** Use **WinSCP** or **FileZilla** to upload the `prod.db` file to `/var/www/nikke-raid/data/prod.db` **immediately after step 3**, before proceeding to Stage 3.

## Stage 3: Install Libraries, Initialize Database, and Build

Must be run **in exact order** from top to bottom — do not skip any step.

```bash
# 1. Install all dependencies
npm install

# 2. Generate the Prisma Client from the schema (required)
npm run db:generate

# 3. Create/update the table structure in the database
#    (automatically creates prod.db if it doesn't exist)
npm run db:push

# 4. Seed the database with initial data
npm run db:seed
```

> [!IMPORTANT]
> **`npm run db:seed` is required** whether this is the first season or you already have an existing `prod.db` from a previous season. This command seeds:
> - **185+ NIKKE characters** from `nikke_characters.json` (upsert — idempotent if run again)
> - **Union member list** with Synchro Device Levels (configured in `prisma/seed-data/members.ts`)
> - **Sample Raid configuration** (status: draft/closed) ready to use
>
> If skipped, the website will function but **will not display the member list or character list**.
>
> You need to edit `prisma/seed-data/members.ts` to update the member list for your Union before running seed.

```bash
# 5. Clear old build cache (REQUIRED: prevents stale cache errors)
rm -rf .next

# 6. Compile the Next.js project (standalone output)
npm run build

# 7. Copy static files (REQUIRED: prevents blank screen errors)
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
```

> [!WARNING]
> **`rm -rf .next` is required** before every build. Next.js Turbopack has very aggressive build caching — without clearing it, old compiled server code may be retained in the standalone output even after source changes. This was previously the cause of the ILP solver running incorrectly on VPS (missing SCALE factor → numerical instability → incorrect damage allocation).

> [!NOTE]
> The project configures `output: "standalone"` in `next.config.ts`. After building, Next.js creates a `.next/standalone/` folder with a minimal server. We use PM2 to run the `server.js` file in this directory directly, rather than using `npm start`.

> [!TIP]
> If you encounter `FATAL ERROR: Reached heap limit` during the build (on a 1GB RAM VPS), create a temporary swap — see the instructions in the **Recommended VPS Configuration** section above.

**Quick check:** Verify the database has data by checking the file size:
```bash
ls -lh data/prod.db
# Expected result: file exists, size > 100KB
```

## Stage 4: Open Firewall & Start the Website

```bash
# 1. Open ports for SSH, HTTP, HTTPS, and fallback 3000
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable

# 2. Start the application with PM2 (using Next.js standalone)
pm2 start .next/standalone/server.js --name "nikke-raid"

# 3. Save PM2 configuration (auto-restarts on VPS reboot)
pm2 save
pm2 startup
```

> [!TIP]
> At this point the website is running at: `http://<YOUR_VPS_IP>:3000`
>
> Quick check:
> ```bash
> pm2 logs nikke-raid --lines 20
> ```
> If you see `✓ Ready in ...` it's working.

> [!NOTE]
> If you don't need a custom domain yet, use the IP address directly. When you're ready to attach a domain, proceed to **Stage 5** below.

---

## Stage 5: Point Domain & Install SSL (Optional)

This section covers pointing a domain (e.g., `raid.your-domain.com`) to the VPS, using **Nginx** as a reverse proxy, and obtaining a free SSL certificate from **Let's Encrypt**.

> [!IMPORTANT]
> Before starting, you need:
> - A purchased domain (e.g., from Namecheap, Cloudflare, etc.)
> - DNS management access for that domain

### Step 1: Configure DNS at Your Domain Provider

Log in to your domain's DNS management panel and create an **A record** pointing to your VPS IP.

For example, to create the subdomain `raid.your-domain.com`:

| Name (Host) | Type | Content (Value) | TTL | Prio |
|-------------|------|-----------------|-----|------|
| `raid` | **A** | `<YOUR_VPS_IP>` | 1 hour / Auto | *(Leave empty)* |

*(Note: If the **Name** field shows a hint with the root domain, only type the desired subdomain portion. The system will automatically append it to form the full subdomain.)*

> [!NOTE]
> DNS propagation can take minutes to 24 hours. Verify with:
> ```bash
> # Run on your personal machine (not the VPS)
> nslookup raid.your-domain.com
> # Or:
> ping raid.your-domain.com
> ```
> When it returns your VPS IP, DNS is ready.

### Step 2: Install Nginx on the VPS

```bash
# Install Nginx
sudo apt install -y nginx

# Check that Nginx is running
sudo systemctl status nginx
```

Visit `http://<YOUR_VPS_IP>` (without port 3000) — if you see the default "Welcome to nginx!" page, it's working.

### Step 3: Configure Nginx Reverse Proxy

Replace `raid.your-domain.com` with your actual domain name:

```bash
# Create the site configuration file
sudo nano /etc/nginx/sites-available/nikke-raid
```

Paste the following content (remember to replace the domain):

```nginx
server {
    listen 80;
    server_name raid.your-domain.com;  # ← REPLACE WITH YOUR DOMAIN

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/nikke-raid /etc/nginx/sites-enabled/

# Remove the default site (to avoid conflicts)
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

Now visit `http://raid.your-domain.com` (no port 3000 needed) to see the website.

### Step 4: Install Free SSL with Let's Encrypt

```bash
# Install Certbot + Nginx plugin
sudo apt install -y certbot python3-certbot-nginx

# Run Certbot (replace with your actual domain)
sudo certbot --nginx -d raid.your-domain.com
```

Certbot will ask:
1. **Email** — to receive notifications when the cert is about to expire
2. **Agree to terms** — press `Y`
3. **Redirect HTTP → HTTPS** — choose **"2" (Redirect)** to automatically forward HTTP to HTTPS

> [!TIP]
> Let's Encrypt certs expire after 90 days, but Certbot automatically installs a **cron job for renewal**. With the on-demand VPS model (3–5 days per Raid season), you never need to worry about cert renewal.
>
> Test that auto-renewal works:
> ```bash
> sudo certbot renew --dry-run
> ```

### Step 5: Verify

After completion, visit `https://raid.your-domain.com` — you should see the green lock 🔒 in the address bar and the website loading normally.

> [!WARNING]
> **After installing SSL**, update the `.env` file so `secure` cookies work correctly:
> ```bash
> cd /var/www/nikke-raid
> # Ensure NODE_ENV=production is set (verify with cat .env)
> # Restart the app
> pm2 restart nikke-raid
> ```

---

## Setting Up Admin and Getting Started

Once the website is running, the workflow for the Union Leader is:

### Step 1: Admin Login
1. Visit `http://<YOUR_VPS_IP>:3000` (or `https://raid.your-domain.com` if you've attached a domain)
2. **Select your identity** (the Leader's name from the member list)
3. Click your **avatar/name** in the top-right corner → select **🔐 Admin Login**
4. Enter the password configured in `.env` (`ADMIN_PASSWORD`)

### Step 2: Configure the Raid
1. Go to **Raid Season** → select a Raid (or create a new one)
2. **Boss Config** tab → enter 5 BossSlots (element, name, HP Level 1/2/3)
3. Change status from `draft` → `active` to open profile submissions

### Step 3: Collect Profiles
- Members visit the website → select identity → go to the Raid → **Submit Profile** tab
- Select Boss, choose 5 characters, enter damage → Submit
- Admin can view all profiles under the **Profiles** tab

### Step 4: Run the Optimizer
- Admin goes to Raid → **Results** tab → click **🚀 Run Optimizer**
- Engine runs the ILP solver (1–10 seconds) → creates a new Assignment
- View details at `/raids/[raidId]/assignments/[assignmentId]`

---

## Managing & Monitoring During the Raid Season

```bash
# View real-time logs
pm2 logs nikke-raid --lines 50

# Check process status
pm2 status

# Restart (after editing .env or deploying new code)
pm2 restart nikke-raid

# Stop the application
pm2 stop nikke-raid
```

---

## 🔄 Updating Code During the Raid Season

When code changes have been pushed to GitHub, run the following sequence on the VPS:

```bash
cd /var/www/nikke-raid

# 1. Pull new code from GitHub
git pull origin main

# 2. Reinstall libraries (only if package.json changed)
npm install

# 3. Regenerate Prisma Client (only if schema.prisma changed)
npm run db:generate

# 4. Update database schema (only if schema.prisma changed)
npm run db:push

# 5. Update seed data (if seed.ts changed)
npm run db:seed

# 6. Clear old build cache + rebuild
rm -rf .next
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

# 7. Restart to apply changes
pm2 restart nikke-raid
```

> [!NOTE]
> For routine code updates (without touching Prisma schema or seed data), you can skip steps 3, 4, 5. Minimum: `git pull` → `rm -rf .next` → `npm run build` → copy files → `pm2 restart`.

---

## 🛑 "Shutdown" Procedure After the Raid Season Ends

To save on hourly VPS costs, as soon as the Raid ends, the Leader should complete 2 steps to save data and destroy the VPS.

### Step 1: Backup the Database

All data (Profiles, Members, Assignments, etc.) is stored in a **single file**: `/var/www/nikke-raid/data/prod.db`

```bash
# Create a dated backup (in case the file gets corrupted during upload to a new VPS)
cp /var/www/nikke-raid/data/prod.db /var/www/nikke-raid/data/prod.backup.$(date +%Y%m%d).db

# Check file size
ls -lh /var/www/nikke-raid/data/
```

Then use **WinSCP**, **FileZilla**, or the `scp` command to download the `prod.db` file to your local machine and store it safely. Next season when creating a new VPS, upload this file in Stage 2 (step 3).

### Step 2: Destroy the Machine

After **confirming the `prod.db` file has been successfully downloaded to your local machine**, log in to your VPS provider's control panel and click **Destroy VPS**. Billing will stop immediately.

> [!TIP]
> If you're using a custom domain, remove the A record from DNS after destroying the VPS to avoid pointing to a dead IP. Next season when you create a new VPS (with a new IP), just update the A record.

> [!NOTE]
> Small tip: A "ephemeral" VPS (only alive for a few days each Raid season) has low security risk. Some providers allow setting a `root` password directly instead of using SSH Keys. Set a strong enough password for **WinSCP/FileZilla** to transfer the SQLite file quickly.

---

## Additional Technical Information

### Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | Next.js 16 (App Router) | `output: "standalone"` |
| **Runtime** | Node.js 20 | Server-side rendering |
| **Database** | SQLite via Prisma v7 + `better-sqlite3` | Single-file DB |
| **ORM** | Prisma with `@prisma/adapter-better-sqlite3` | Driver adapter pattern |
| **ILP Solver** | GLPK.js (WASM, server-side) | `serverExternalPackages` in next.config |
| **Styling** | Vanilla CSS (dark theme) | Google Fonts: Inter, Outfit |
| **Auth** | HMAC-SHA256 signed cookies | `httpOnly`, `secure` in prod |

### Important Directory Structure

```
/var/www/nikke-raid/
├── .env                    # Environment variables (DATABASE_URL, ADMIN_PASSWORD)
├── data/
│   └── prod.db             # ← THE ONLY FILE YOU NEED TO BACK UP!
├── prisma/
│   ├── schema.prisma       # Database schema definition
│   ├── seed.ts             # Initial data seeding script
│   └── seed-data/          # Seed data (separated from logic)
│       ├── members.ts      # Member list (customizable)
│       ├── bosses.ts       # Boss configuration
│       └── profiles.ts     # Sample data matrix
│       └── raids.ts        # Initial raid configuration
└── .next/                  # Build output (auto-generated)
    └── standalone/         # Standalone server
```

### Environment Variables

| Name | Required | Example | Description |
|------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | `file:/var/www/nikke-raid/data/prod.db` | SQLite path. **Use absolute path** for production. |
| `ADMIN_PASSWORD` | ✅ | `MyStr0ngP@ss!` | Admin password. Server will crash if not set. |
| `NODE_ENV` | ⬚ | `production` | Set to `production` to enable secure cookies. |
