# Render Deployment

This repo deploys to Render as three services plus one Postgres database:

- `lec-intellisupport-frontend`: Next.js web service
- `lec-intellisupport-backend`: Django API web service
- `lec-intellisupport-ai`: FastAPI AI web service
- `lec-intellisupport-db`: Render Postgres database

## Deploy With The Blueprint

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, open **Blueprints** and create a new Blueprint instance from this repo.
3. Render will read `render.yaml` and create all services.
4. After the first deploy, open each service and confirm the public URLs match these values:
   - Frontend: `https://lec-intellisupport-frontend.onrender.com`
   - Backend: `https://lec-intellisupport-backend.onrender.com`
   - AI: `https://lec-intellisupport-ai.onrender.com`
5. If Render assigned a different URL, update these environment variables and redeploy:
   - Frontend service: `BACKEND_URL`
   - Backend service: `AI_SERVICE_URL`
   - Backend service: `FRONTEND_BASE_URL`

## Optional Production Variables

Add these to the backend service only if you use those features:

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_ROLE` (defaults to `admin_fault`)
- `INITIAL_ADMIN_BRANCH`
- `INITIAL_ADMIN_DEPARTMENT`
- `INITIAL_ADMIN_MUST_CHANGE_PASSWORD` (`1` only when you want to require password setup before login)
- `INITIAL_ADMIN_RESET_PASSWORD` (`1` only when you want to rotate the bootstrap user's password)
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `DEFAULT_FROM_EMAIL`
- `WHATSAPP_WEBHOOK_SECRET`

## WhatsApp Intake

The backend exposes the employee WhatsApp report webhook at:

```text
https://lec-intellisupport-backend.onrender.com/api/whatsapp/incoming
```

For Meta WhatsApp Cloud API webhook verification, the Blueprint sets:

```text
WHATSAPP_WEBHOOK_VERIFY_TOKEN=lec-whatsapp-verify-token
```

Use that same value in Meta's webhook setup, or change the Render backend environment variable and redeploy. `WHATSAPP_WEBHOOK_SECRET` is optional because some providers, including basic Twilio webhook setup, do not send custom authorization headers.

## Create Admin Data

For the first deploy, the backend build runs `python manage.py bootstrap_app_admin`.
The Blueprint prompts for these backend environment variables during initial setup:

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`
- `INITIAL_ADMIN_NAME`

The initial user defaults to the `admin_fault` role. After the user exists, remove `INITIAL_ADMIN_PASSWORD` from Render unless you need to bootstrap again.

If you are on a paid Render instance with Shell access and need Django admin access too, open the backend service shell and run `python manage.py createsuperuser`.

You can also seed demo app users and inventory if needed:

```bash
python manage.py seed_demo_data
```

## Custom Domain

The Blueprint creates the frontend on its Render URL first:

```text
https://lec-intellisupport-frontend.onrender.com
```

After the frontend service exists, add the custom domain in the Render dashboard.

In your DNS provider for `lec.co.ls`, create this record:

```text
Type: CNAME
Name: intellisupport
Value: lec-intellisupport-frontend.onrender.com
```

After DNS propagates, open the frontend service in Render, go to **Settings -> Custom Domains**, and verify `intellisupport.lec.co.ls`.

Then update these Render environment variables and redeploy:

- Backend service: `FRONTEND_BASE_URL=https://intellisupport.lec.co.ls`
- Frontend service: `FRONTEND_BASE_URL=https://intellisupport.lec.co.ls`
- Frontend service: `NEXT_PUBLIC_APP_URL=https://intellisupport.lec.co.ls`

## Private AI Service Option

The included Blueprint uses free public web services. For a more production-like setup, change `lec-intellisupport-ai` to a private service on a paid plan and set the backend variable `AI_SERVICE_HOSTPORT` from that private service's `hostport` property instead of using `AI_SERVICE_URL`.
