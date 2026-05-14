# TECH ION Commission Platform

Full-stack commission management platform.
**Stack:** Node.js + Express · PostgreSQL · Vanilla JS frontend · Nginx

---

## Project Structure

```
TIO-Commission-App/
├── client/               ← Frontend (deploy to /var/www/tio/client)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── server/               ← Backend API (run with PM2)
    ├── server.js
    ├── package.json
    ├── .env.example      ← copy to .env and fill in values
    ├── db/schema.sql     ← run once to create tables
    ├── scripts/seed.js   ← run once to create default users
    ├── lib/
    │   ├── db.js         ← PostgreSQL connection pool
    │   └── commission.js ← commission rate engine
    ├── middleware/auth.js ← JWT verification
    └── routes/           ← API route handlers
        ├── auth.js
        ├── deals.js
        ├── employees.js
        ├── users.js
        └── settings.js
```

---

## Deployment Guide (Ubuntu + Nginx)

### 1. Upload files to server

```bash
scp -r TIO-Commission-App user@yourserver.com:/var/www/tio
```

### 2. Install Node.js (if not installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 3. Set up PostgreSQL

```bash
sudo apt install -y postgresql
sudo -u postgres psql
```
```sql
CREATE DATABASE tio_commission;
CREATE USER tio_user WITH PASSWORD 'StrongPassword123!';
GRANT ALL PRIVILEGES ON DATABASE tio_commission TO tio_user;
\q
```

Run the schema:
```bash
psql -U tio_user -d tio_commission -f /var/www/tio/server/db/schema.sql
```

### 4. Configure environment

```bash
cd /var/www/tio/server
cp .env.example .env
nano .env
```

Fill in:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tio_commission
DB_USER=tio_user
DB_PASS=StrongPassword123!
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
PORT=3001
CLIENT_ORIGIN=https://yourdomain.com
```

### 5. Install dependencies & seed database

```bash
cd /var/www/tio/server
npm install
node scripts/seed.js
```

### 6. Start API with PM2

```bash
pm2 start server.js --name tio-api
pm2 save
pm2 startup
```

### 7. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/tio
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend — static files
    root /var/www/tio/client;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend — proxy /api/* to Node.js
    location /api/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Free SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Default Login Credentials

| Username | Password      | Role    |
|----------|---------------|---------|
| admin    | TechIon@2026  | Admin   |
| viewer   | View#2026     | Manager |

**Change passwords immediately after first login via the Users tab.**

---

## Common Commands

```bash
pm2 status               # Check API status
pm2 logs tio-api         # View API logs
pm2 restart tio-api      # Restart after code changes
sudo systemctl reload nginx  # Reload Nginx config
```

---

## API Endpoints

| Method | Path                  | Auth     | Description              |
|--------|-----------------------|----------|--------------------------|
| POST   | /api/auth/login       | —        | Login, returns JWT       |
| GET    | /api/auth/me          | any      | Get current user         |
| GET    | /api/deals            | any      | List deals               |
| POST   | /api/deals            | edit+    | Add deal                 |
| PUT    | /api/deals/:id        | edit+    | Update deal              |
| DELETE | /api/deals/:id        | edit+    | Delete deal              |
| GET    | /api/employees        | any      | List employees           |
| POST   | /api/employees        | edit+    | Add employee             |
| PUT    | /api/employees/:id    | edit+    | Update employee          |
| DELETE | /api/employees/:id    | edit+    | Delete employee          |
| GET    | /api/users            | admin    | List users               |
| POST   | /api/users            | admin    | Add user                 |
| PUT    | /api/users/:id        | admin    | Update user              |
| DELETE | /api/users/:id        | admin    | Delete user              |
| GET    | /api/settings         | any      | Get settings             |
| PUT    | /api/settings         | admin    | Update settings          |
| GET    | /api/health           | —        | Health check             |
