from datetime import date

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand

from core.models import Consumable, Technician, User


class Command(BaseCommand):
    help = "Seed demo users and consumables for LEC-Intelli-Support."

    def handle(self, *args, **options):
        demo_users = [
            {
                "name": "Employee1",
                "email": "employee@lec.com",
                "password": "Employee@123",
                "role": User.ROLE_EMPLOYEE,
            },
            {
                "name": "Thabo Mokoena",
                "email": "technician@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Lerato Molefe",
                "email": "technician2@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Mpho Nthunya",
                "email": "technician3@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Kamohelo Radebe",
                "email": "technician4@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Palesa Tsolo",
                "email": "technician5@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Teboho Seema",
                "email": "technician6@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Nthabiseng Mofokeng",
                "email": "technician7@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Motlalepula Khomo",
                "email": "technician8@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Khotso Maseko",
                "email": "technician9@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
            },
            {
                "name": "Masechaba Lesaoana",
                "email": "technician10@lec.com",
                "password": "Technician@123",
                "role": User.ROLE_TECHNICIAN,
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
        ]

        for payload in demo_users:
            user, created = User.objects.update_or_create(
                email=payload["email"],
                defaults={
                    "name": payload["name"],
                    "role": payload["role"],
                    "password_hash": make_password(payload["password"]),
                    "is_active": True,
                },
            )
            status_label = "Created" if created else "Updated"
            self.stdout.write(f"{status_label} user: {user.email} ({user.role})")

        for technician_user in User.objects.filter(role=User.ROLE_TECHNICIAN):
            Technician.objects.get_or_create(
                user=technician_user,
                defaults={
                    "skillset": "Network, Endpoint, Applications",
                    "is_available": True,
                },
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
