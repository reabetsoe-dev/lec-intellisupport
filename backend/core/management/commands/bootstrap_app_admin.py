import os

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError

from core.models import User


def _env_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


class Command(BaseCommand):
    help = "Create or update the initial LEC IntelliSupport app admin from environment variables."

    def handle(self, *args, **options):
        email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("INITIAL_ADMIN_PASSWORD", "")

        if not email or not password:
            self.stdout.write(
                "Initial app admin bootstrap skipped. Set INITIAL_ADMIN_EMAIL and "
                "INITIAL_ADMIN_PASSWORD to enable it."
            )
            return

        role = os.getenv("INITIAL_ADMIN_ROLE", User.ROLE_ADMIN_FAULT).strip() or User.ROLE_ADMIN_FAULT
        valid_roles = {choice[0] for choice in User.ROLE_CHOICES}
        if role not in valid_roles:
            raise CommandError(f"INITIAL_ADMIN_ROLE must be one of: {', '.join(sorted(valid_roles))}.")

        if len(password) < 8:
            raise CommandError("INITIAL_ADMIN_PASSWORD must be at least 8 characters long.")

        name = os.getenv("INITIAL_ADMIN_NAME", "").strip() or "Initial Admin"
        branch = os.getenv("INITIAL_ADMIN_BRANCH", "").strip()
        department = os.getenv("INITIAL_ADMIN_DEPARTMENT", "").strip()
        reset_password = _env_bool("INITIAL_ADMIN_RESET_PASSWORD", default=False)
        must_change_password = _env_bool("INITIAL_ADMIN_MUST_CHANGE_PASSWORD", default=False)

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "name": name,
                "role": role,
                "branch": branch,
                "department": department,
                "password_hash": make_password(password),
                "must_change_password": must_change_password,
                "is_active": True,
            },
        )

        update_fields = []
        for field, value in {
            "name": name,
            "role": role,
            "branch": branch,
            "department": department,
            "must_change_password": must_change_password,
            "is_active": True,
        }.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                update_fields.append(field)

        if not created and reset_password:
            user.password_hash = make_password(password)
            update_fields.extend(["password_hash", "must_change_password"])

        if update_fields:
            update_fields.append("updated_at")
            user.save(update_fields=sorted(set(update_fields)))

        action = "Created" if created else "Updated"
        password_note = (
            "password initialized"
            if created
            else "password reset enabled"
            if reset_password
            else "existing password kept"
        )
        self.stdout.write(
            self.style.SUCCESS(f"{action} initial app admin {email} ({role}); {password_note}.")
        )
