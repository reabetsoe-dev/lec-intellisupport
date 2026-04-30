from datetime import date

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db.models.deletion import ProtectedError

from core.models import Consumable, Technician, User


class Command(BaseCommand):
    help = "Seed demo users and consumables for LEC-Intelli-Support."

    def handle(self, *args, **options):
        technician_users = [
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
            branch = "Maseru HQ" if payload["role"] == User.ROLE_TECHNICIAN else ""
            user, created = User.objects.update_or_create(
                email=payload["email"],
                defaults={
                    "name": payload["name"],
                    "role": payload["role"],
                    "branch": branch,
                    "password_hash": make_password(payload["password"]),
                    "is_active": True,
                },
            )
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

