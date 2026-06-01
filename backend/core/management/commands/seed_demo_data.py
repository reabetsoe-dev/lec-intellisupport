from datetime import date

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from core.models import Consumable, Technician, User


class Command(BaseCommand):
    help = "Seed demo users and consumables for LEC-Intelli-Support."

    def _user_table_columns(self) -> set[str]:
        with connection.cursor() as cursor:
            return {column.name for column in connection.introspection.get_table_description(cursor, User._meta.db_table)}

    def _create_user_for_current_schema(self, payload: dict, defaults: dict, user_columns: set[str]) -> tuple[User, bool]:
        create_values = {
            "email": payload["email"],
            **defaults,
        }
        if "phone_number" in user_columns and "phone_number" not in create_values:
            create_values["phone_number"] = payload.get("phone_number", "")
        if "created_at" in user_columns and "created_at" not in create_values:
            create_values["created_at"] = timezone.now()
        if "updated_at" in user_columns and "updated_at" not in create_values:
            create_values["updated_at"] = timezone.now()

        columns = [column for column in create_values if column in user_columns]
        placeholders = ", ".join(["%s"] * len(columns))
        column_sql = ", ".join(connection.ops.quote_name(column) for column in columns)
        values = [create_values[column] for column in columns]

        with connection.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO {connection.ops.quote_name(User._meta.db_table)} ({column_sql}) VALUES ({placeholders})",
                values,
            )

        return User.objects.get(email=payload["email"]), True

    def _upsert_user(self, payload: dict, defaults: dict, user_columns: set[str]) -> tuple[User, bool]:
        user = User.objects.filter(email=payload["email"]).first()
        if user:
            update_fields = []
            for field, value in defaults.items():
                if hasattr(user, field) and getattr(user, field) != value:
                    setattr(user, field, value)
                    update_fields.append(field)
            if update_fields:
                update_fields.append("updated_at")
                user.save(update_fields=sorted(set(update_fields)))
            return user, False

        return self._create_user_for_current_schema(payload, defaults, user_columns)

    def handle(self, *args, **options):
        user_columns = self._user_table_columns()
        technician_users = [
            {
                "name": "Technician",
                "email": "technician@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
                "skillset": Technician.SKILL_HARDWARE,
            },
            {
                "name": "Palesa Mokopotsa",
                "email": "palesa.mokopotsa@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
                "skillset": Technician.SKILL_NETWORK,
            },
            {
                "name": "Reabetsoe Sephekola",
                "email": "reabetsoe.sephekola@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
                "skillset": Technician.SKILL_SOFTWARE,
            },
            {
                "name": "Mokholoane Kanei",
                "email": "mokholoane.kanei@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
                "skillset": Technician.SKILL_HARDWARE,
            },
        ]

        demo_users = [
            {
                "name": "Employee1",
                "email": "employee@lec.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Mokhotlong",
                "department": "ICT",
            },
            {
                "name": "Lets'eka Sello",
                "email": "letseka.sello@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Maseru",
                "department": "Admin",
            },
            {
                "name": "Anna Motumi",
                "email": "anna.motumi@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Mafeteng",
                "department": "Finance",
            },
            {
                "name": "Nthabeleng Ramahali",
                "email": "nthabeleng.ramahali@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Mohale's Hoek",
                "department": "Human Resources",
            },
            {
                "name": "Tefo Matela",
                "email": "tefo.matela@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Quthing",
                "department": "Engineering",
            },
            {
                "name": "Nthatuoa Ramapepe",
                "email": "nthatuoa.ramapepe@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Qacha's Nek",
                "department": "Customer Service",
            },
            {
                "name": "Selloane Sello",
                "email": "selloane.sello@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Leribe (Hlotse)",
                "department": "Operations",
            },
            {
                "name": "Leseli Koto",
                "email": "leseli.koto@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Butha-Buthe",
                "department": "Procurement",
            },
            {
                "name": "Khalala Khalala",
                "email": "khalala.khalala@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Berea (Teyateyaneng)",
                "department": "Projects",
            },
            {
                "name": "Lineo ts'iu",
                "email": "lineo.tsiu@gmail.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
                "branch": "Thaba-Tseka",
                "department": "Contact Center",
            },
            {
                "name": "Palesa R.",
                "email": "adminfault@lec.com",
                "password": "AdminFault@123",
                "role": User.ROLE_ADMIN_FAULT,
            },
            {
                "name": "Anele K.",
                "email": "adminassets@lec.com",
                "password": "AdminConsumables@123",
                "role": User.ROLE_ADMIN_CONSUMABLES,
            },
            {
                "name": "Lerato M.",
                "email": "manager@lec.com",
                "password": "Manager@123",
                "role": User.ROLE_MANAGER,
            },
        ]
        demo_users.extend(technician_users)

        legacy_seed_technician_emails = {
            "technician2@lec.com",
            "technician3@lec.com",
            "technician4@lec.com",
            "technician5@lec.com",
            "technician6@lec.com",
            "technician7@lec.com",
            "technician8@lec.com",
            "technician9@lec.com",
            "technician10@lec.com",
        }
        current_seed_technician_emails = {payload["email"] for payload in technician_users}

        for payload in demo_users:
            branch = payload.get("branch", "Maseru HQ" if payload["role"] == User.ROLE_TECHNICIAN else "")
            defaults = {
                "name": payload["name"],
                "role": payload["role"],
                "branch": branch,
                "department": payload.get("department", ""),
                "password_hash": make_password(payload["password"]),
                "must_change_password": False,
                "is_active": True,
            }
            user, created = self._upsert_user(payload, defaults, user_columns)
            status_label = "Created" if created else "Updated"
            self.stdout.write(f"{status_label} user: {user.email} ({user.role})")

        for payload in technician_users:
            technician_user = User.objects.get(email=payload["email"], role=User.ROLE_TECHNICIAN)
            technician, created = Technician.objects.update_or_create(
                user=technician_user,
                defaults={
                    "skillset": payload["skillset"],
                    "department": Technician.DEPARTMENT_IT,
                    "is_available": False,
                },
            )
            status_label = "Created" if created else "Updated"
            self.stdout.write(
                f"{status_label} technician profile: {technician_user.email} ({payload['skillset']})"
            )

        stale_seed_technician_emails = legacy_seed_technician_emails - current_seed_technician_emails
        stale_seed_technicians = User.objects.filter(
            role=User.ROLE_TECHNICIAN,
            email__in=stale_seed_technician_emails,
        ).order_by("email")
        for stale_user in stale_seed_technicians:
            try:
                stale_email = stale_user.email
                stale_user.delete()
                self.stdout.write(f"Removed legacy seeded technician: {stale_email}")
            except ProtectedError:
                if stale_user.is_active:
                    stale_user.is_active = False
                    stale_user.save(update_fields=["is_active", "updated_at"])
                self.stdout.write(
                    f"Deactivated legacy seeded technician with dependent records: {stale_user.email}"
                )

        demo_consumables = [
            {
                "asset_tag": "LEC-LTP-POOL-001",
                "item_name": "Laptop Dell Latitude 5440",
                "manufacturer": "Dell",
                "brand": "Dell",
                "model_number": "Latitude 5440",
                "serial_number": "DL5440-POOL-001",
                "category": "Computer",
                "subcategory": "Laptop",
                "processor": "Intel Core i5",
                "ram": "16 GB",
                "storage_type": "SSD",
                "storage_capacity": "512 GB",
                "graphics_card": "Integrated",
                "charger_included": True,
                "quantity": 28,
                "purchase_cost": 18500,
                "supplier": "Mustek",
                "purchase_date": date(2025, 1, 15),
                "warranty_expiry": date(2028, 1, 15),
                "condition": "New",
                "status": "In Stock",
            },
            {
                "asset_tag": "LEC-PRC-POOL-002",
                "item_name": "Printer Cartridge HP 415A Black",
                "manufacturer": "HP",
                "brand": "HP",
                "model_number": "415A",
                "serial_number": "HP415A-POOL-002",
                "category": "Printer",
                "subcategory": "Laser",
                "printer_type": "Laser",
                "print_speed": "40 ppm",
                "connectivity": "USB / Ethernet",
                "paper_capacity": "500 sheets",
                "color_printing": False,
                "quantity": 62,
                "purchase_cost": 1450,
                "supplier": "Office Warehouse",
                "purchase_date": date(2025, 2, 10),
                "warranty_expiry": date(2027, 2, 10),
                "condition": "New",
                "status": "In Stock",
            },
            {
                "asset_tag": "LEC-PAP-POOL-003",
                "item_name": "A4 Copy Paper Typek 80gsm",
                "manufacturer": "Typek",
                "brand": "Typek",
                "model_number": "A4-80GSM-500",
                "serial_number": "TKA4-POOL-003",
                "category": "Stationery",
                "subcategory": "Paper",
                "quantity": 299,
                "purchase_cost": 95,
                "supplier": "Office Warehouse",
                "purchase_date": date(2025, 2, 1),
                "warranty_expiry": date(2027, 2, 1),
                "condition": "New",
                "status": "In Stock",
            },
            {
                "asset_tag": "LEC-MOU-POOL-004",
                "item_name": "Wireless Mouse Logitech M185",
                "manufacturer": "Logitech",
                "brand": "Logitech",
                "model_number": "M185",
                "serial_number": "LGM185-POOL-004",
                "category": "Gadget",
                "subcategory": "Mouse",
                "device_type": "Mouse",
                "connectivity": "USB",
                "battery_capacity": "AA",
                "quantity": 84,
                "purchase_cost": 220,
                "supplier": "First Distribution",
                "purchase_date": date(2025, 3, 5),
                "warranty_expiry": date(2027, 3, 5),
                "condition": "New",
                "status": "In Stock",
            },
            {
                "asset_tag": "LEC-KBD-POOL-005",
                "item_name": "Keyboard Logitech K120",
                "manufacturer": "Logitech",
                "brand": "Logitech",
                "model_number": "K120",
                "serial_number": "LGK120-POOL-005",
                "category": "Gadget",
                "subcategory": "Keyboard",
                "device_type": "Keyboard",
                "connectivity": "USB",
                "quantity": 70,
                "purchase_cost": 280,
                "supplier": "First Distribution",
                "purchase_date": date(2025, 3, 5),
                "warranty_expiry": date(2027, 3, 5),
                "condition": "New",
                "status": "In Stock",
            },
        ]

        for row in demo_consumables:
            Consumable.objects.update_or_create(
                asset_tag=row["asset_tag"],
                defaults=row,
            )

        self.stdout.write(self.style.SUCCESS("Seed complete."))

