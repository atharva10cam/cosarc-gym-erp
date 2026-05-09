# Cosarc Gym ERP Deployment Guide

This guide takes the project from local preview to production hosting.

## A. Project Setup

Required software:

- Git
- Node.js 20 LTS or newer
- A Supabase account
- A GitHub account

Current folder structure:

```text
cosarc-gym-erp/
  index.html
  styles.css
  app.js
  config.js
  schema.sql
  cosarc-logo.webp
  README.md
  DEPLOYMENT.md
```

Run locally:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4173/index.html
```

Local demo credentials:

```text
Email: owner@cosarc.app
Password: demo1234
Role: Owner
Admin passcode: 2468
```

## B. Supabase Setup

Create a Supabase project:

1. Go to `https://supabase.com`.
2. Create a new project.
3. Save the Project URL and anon key.
4. Open SQL Editor.
5. Paste the full contents of `schema.sql`.
6. Click Run.

Enable authentication:

1. Open Authentication.
2. Enable Email login.
3. Create owner/admin users.
4. Use those accounts to sign in from the ERP.

Enable realtime:

1. Open Database.
2. Go to Replication.
3. Enable realtime for:
   - `members`
   - `attendance`
   - `payments`
   - `enquiries`
   - `trainers`
   - `sales_team`
   - `inventory`

Storage buckets:

- `transformation-photos`
- `member-documents`
- `invoice-exports`

Recommended bucket policies:

- Authenticated users can read.
- Owner/Admin can upload.
- Member-facing app should only read/write its own member files.

## C. Environment Variables

Frontend-safe variables:

```js
window.COSARC_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.COSARC_SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
window.COSARC_ENABLE_SUPABASE = true;
window.COSARC_SESSION_MINUTES = 20;
```

Never expose these in frontend code:

```text
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
PAYMENT_GATEWAY_SECRET
WHATSAPP_API_SECRET
EMAIL_API_SECRET
```

For production, keep secrets only in a backend service such as Railway, Render, VPS, or Supabase Edge Functions.

## D. Backend Hosting

This current project is static-first. For enterprise production, add a backend for privileged operations:

- Service-role database actions
- Payment gateway webhooks
- WhatsApp/SMS sending
- PDF invoice generation
- Rate limiting
- Audit logs

Railway:

```bash
railway login
railway init
railway up
```

Render:

- Create Web Service
- Connect GitHub repo
- Add environment variables
- Start command example:

```bash
node server.js
```

Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --omit=dev
CMD ["node", "server.js"]
```

VPS:

```bash
sudo apt update
sudo apt install nginx nodejs npm
pm2 start server.js --name cosarc-api
pm2 save
```

## E. Frontend Hosting

Vercel:

1. Push project to GitHub.
2. Import repo in Vercel.
3. Framework preset: Other.
4. Build command: leave empty for static.
5. Output directory: project root.
6. Add custom domain.

Netlify:

1. Push project to GitHub.
2. Import repo in Netlify.
3. Build command: leave empty.
4. Publish directory: project root.
5. Add custom domain.

For production, update `config.js`:

```js
window.COSARC_ENABLE_SUPABASE = true;
```

## F. Database Maintenance

Backups:

- Enable Supabase daily backups.
- Export critical data monthly.
- Keep invoice exports in storage.

Monitoring:

- Check Supabase logs weekly.
- Monitor slow queries.
- Add indexes on:
  - `members.email`
  - `payments.member_id`
  - `attendance.member_id`
  - `attendance.date`
  - `enquiries.salesperson`
  - `enquiries.status`

Scaling:

- Use pagination for large member lists.
- Archive old attendance records yearly.
- Use server-side reports for large gyms.

## G. Production Security

Must-have security:

- HTTPS only
- RLS enabled on every table
- Owner/Admin-only financial actions
- Service role never exposed to browser
- Rate limiting on backend APIs
- Secure headers through hosting provider
- Session timeout enabled
- Admin passcode hash configured
- Audit logs for delete/payment/admin actions

Recommended headers:

```text
Strict-Transport-Security
X-Content-Type-Options
X-Frame-Options
Referrer-Policy
Content-Security-Policy
```

## H. Domain & Branding

Domain setup:

1. Buy domain.
2. Add domain in Vercel/Netlify.
3. Update DNS records.
4. Wait for SSL certificate.

Branding:

- Replace `cosarc-logo.webp` if needed.
- Update favicon in `index.html`.
- Keep the lowercase rounded `cosarc` wordmark for consistency.

## I. Mobile App Sync

The ERP and mobile app sync through the same Supabase database.

Shared tables:

- `members`
- `attendance`
- `payments`
- `enquiries`
- `trainers`
- `sales_team`
- `inventory`

Sync behavior:

- ERP changes write to Supabase.
- Mobile app reads the same tables.
- Realtime updates refresh dashboards.
- Payment/member status changes are visible in both products.

Data consistency rules:

- Member `id` is the shared key.
- Attendance rows reference `member_id`.
- Payments reference `member_id`.
- Sales attribution uses `salesperson`.
- Trainers are assigned by trainer name or trainer ID in a future normalized schema.

Production checklist:

- Run `schema.sql`.
- Enable realtime.
- Create Supabase auth users.
- Set `COSARC_ENABLE_SUPABASE = true`.
- Deploy frontend.
- Deploy backend for privileged actions.
- Test login, member CRUD, payments, invoices, reports, search, sales, and mobile app sync.
