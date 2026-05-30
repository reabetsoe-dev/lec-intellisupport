#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
python manage.py bootstrap_app_admin

if [ "${SEED_DEMO_DATA:-0}" = "1" ]; then
  python manage.py seed_demo_data
fi
