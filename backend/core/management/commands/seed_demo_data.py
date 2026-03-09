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
            {"item_name": "laptops", "quantity": 28, "department": "Finance", "assigned_employee": "Shared"},
            {"item_name": "cartridges", "quantity": 64, "department": "Operations", "assigned_employee": "Shared"},
            {"item_name": "paper", "quantity": 420, "department": "Admin", "assigned_employee": "Shared"},
            {"item_name": "mouse", "quantity": 84, "department": "Contact Center", "assigned_employee": "Shared"},
            {"item_name": "keyboard", "quantity": 71, "department": "Engineering", "assigned_employee": "Shared"},
        ]

        for row in demo_consumables:
            Consumable.objects.update_or_create(
                item_name=row["item_name"],
                defaults={
                    "quantity": row["quantity"],
                    "department": row["department"],
                    "assigned_employee": row["assigned_employee"],
                },
            )

        self.stdout.write(self.style.SUCCESS("Seed complete."))
