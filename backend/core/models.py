from django.db import models


class User(models.Model):
    ROLE_EMPLOYEE = "employee"
    ROLE_TECHNICIAN = "technician"
    ROLE_ADMIN_FAULT = "admin_fault"
    ROLE_ADMIN_CONSUMABLES = "admin_consumables"

    ROLE_CHOICES = [
        (ROLE_EMPLOYEE, "Employee"),
        (ROLE_TECHNICIAN, "Technician"),
        (ROLE_ADMIN_FAULT, "Admin Fault"),
        (ROLE_ADMIN_CONSUMABLES, "Admin Consumables"),
    ]

    name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_EMPLOYEE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    def __str__(self) -> str:
        return f"{self.name} ({self.role})"


class Technician(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="technician_profile")
    skillset = models.CharField(max_length=255, blank=True)
    is_available = models.BooleanField(default=True)

    class Meta:
        db_table = "technicians"

    def __str__(self) -> str:
        return f"Technician: {self.user.name}"


class Ticket(models.Model):
    STATUS_OPEN = "Open"
    STATUS_IN_PROGRESS = "In Progress"
    STATUS_PENDING_VENDOR = "Pending Vendor"
    STATUS_RESOLVED = "Resolved"

    PRIORITY_LOW = "Low"
    PRIORITY_MEDIUM = "Medium"
    PRIORITY_HIGH = "High"
    PRIORITY_CRITICAL = "Critical"

    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_PENDING_VENDOR, "Pending Vendor"),
        (STATUS_RESOLVED, "Resolved"),
    ]

    PRIORITY_CHOICES = [
        (PRIORITY_LOW, "Low"),
        (PRIORITY_MEDIUM, "Medium"),
        (PRIORITY_HIGH, "High"),
        (PRIORITY_CRITICAL, "Critical"),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=100)
    location = models.CharField(max_length=255, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=PRIORITY_LOW)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_OPEN)
    employee = models.ForeignKey(User, on_delete=models.PROTECT, related_name="submitted_tickets")
    technician = models.ForeignKey(
        Technician, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_tickets"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tickets"

    def __str__(self) -> str:
        return f"Ticket #{self.pk} - {self.title}"


class TicketComment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ticket_comments")
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_comments"

    def __str__(self) -> str:
        return f"Comment #{self.pk} on Ticket #{self.ticket_id}"


class Consumable(models.Model):
    item_name = models.CharField(max_length=100)
    quantity = models.PositiveIntegerField(default=0)
    department = models.CharField(max_length=120, blank=True, default="")
    assigned_employee = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "consumables"

    def __str__(self) -> str:
        return f"{self.item_name} ({self.quantity})"


class InventoryAssignment(models.Model):
    consumable = models.ForeignKey(Consumable, on_delete=models.CASCADE, related_name="assignments")
    employee = models.ForeignKey(User, on_delete=models.PROTECT, related_name="inventory_assignments")
    quantity_assigned = models.PositiveIntegerField(default=1)
    assigned_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_inventory_assignments"
    )
    notes = models.TextField(blank=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_assignments"

    def __str__(self) -> str:
        return f"{self.quantity_assigned} x {self.consumable.item_name} to {self.employee.name}"


class ConsumableRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    consumable = models.ForeignKey(Consumable, on_delete=models.PROTECT, related_name="requests")
    employee = models.ForeignKey(User, on_delete=models.PROTECT, related_name="consumable_requests")
    quantity = models.PositiveIntegerField(default=1)
    department = models.CharField(max_length=120, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    approved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_consumable_requests"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="rejected_consumable_requests"
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "consumable_requests"

    def __str__(self) -> str:
        return f"Request #{self.pk} ({self.status})"
