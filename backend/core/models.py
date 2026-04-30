from django.db import models
from django.utils import timezone


def default_business_hours_schedule() -> dict[str, dict[str, str | bool]]:
    return {
        "monday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "tuesday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "wednesday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "thursday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "friday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "saturday": {"enabled": False, "start": "08:00", "end": "16:30"},
        "sunday": {"enabled": False, "start": "08:00", "end": "16:30"},
    }


def default_business_hours_groups() -> list[str]:
    return ["all"]


class User(models.Model):
    ROLE_EMPLOYEE = "employee"
    ROLE_TECHNICIAN = "technician"
    ROLE_ADMIN_FAULT = "admin_fault"
    ROLE_ADMIN_CONSUMABLES = "admin_consumables"
    ROLE_MANAGER = "manager"

    ROLE_CHOICES = [
        (ROLE_EMPLOYEE, "Employee"),
        (ROLE_TECHNICIAN, "Technician"),
        (ROLE_ADMIN_FAULT, "Admin Fault"),
        (ROLE_ADMIN_CONSUMABLES, "Admin Consumables"),
        (ROLE_MANAGER, "Manager"),
    ]

    name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    branch = models.CharField(max_length=120, blank=True, default="")
    password_hash = models.CharField(max_length=255)
    must_change_password = models.BooleanField(default=False)
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=ROLE_EMPLOYEE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    def __str__(self) -> str:
        return f"{self.name} ({self.role})"

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False


class UserInvite(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="invites")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_invites"

    def __str__(self) -> str:
        return f"Invite #{self.pk} for User #{self.user_id}"


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    requested_ip = models.CharField(max_length=64, blank=True, default="")
    requested_user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "password_reset_tokens"

    def __str__(self) -> str:
        return f"PasswordResetToken #{self.pk} for User #{self.user_id}"


class Technician(models.Model):
    SKILL_NETWORK = "Network"
    SKILL_SOFTWARE = "Software"
    SKILL_HARDWARE = "Hardware"
    SKILL_SECURITY = "Security"
    DEPARTMENT_IT = "IT"
    SKILLSET_CHOICES = [
        (SKILL_NETWORK, "Network"),
        (SKILL_SOFTWARE, "Software"),
        (SKILL_HARDWARE, "Hardware"),
        (SKILL_SECURITY, "Security"),
    ]
    DEPARTMENT_CHOICES = [
        (DEPARTMENT_IT, "IT"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="technician_profile")
    skillset = models.CharField(max_length=20, choices=SKILLSET_CHOICES)
    department = models.CharField(max_length=20, choices=DEPARTMENT_CHOICES, default=DEPARTMENT_IT)
    is_available = models.BooleanField(default=False)
    availability_updated_at = models.DateTimeField(null=True, blank=True)
    last_check_in_at = models.DateTimeField(null=True, blank=True)
    last_check_out_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "technicians"

    def __str__(self) -> str:
        return f"Technician: {self.user.name}"


class TechnicianActivityLog(models.Model):
    ACTION_CHECK_IN = "check_in"
    ACTION_CHECK_OUT = "check_out"
    ACTION_TICKET_ACCEPTED = "ticket_accepted"
    ACTION_TICKET_SOLVED = "ticket_solved"
    ACTION_TICKET_ESCALATED = "ticket_escalated"
    ACTION_ASSET_REQUEST_SUBMITTED = "asset_request_submitted"

    ACTION_CHOICES = [
        (ACTION_CHECK_IN, "Check In"),
        (ACTION_CHECK_OUT, "Check Out"),
        (ACTION_TICKET_ACCEPTED, "Ticket Accepted"),
        (ACTION_TICKET_SOLVED, "Ticket Solved"),
        (ACTION_TICKET_ESCALATED, "Ticket Escalated"),
        (ACTION_ASSET_REQUEST_SUBMITTED, "Asset Request Submitted"),
    ]

    technician = models.ForeignKey(Technician, on_delete=models.CASCADE, related_name="activity_logs")
    ticket = models.ForeignKey(
        "Ticket",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technician_activity_logs",
    )
    consumable_request = models.ForeignKey(
        "ConsumableRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technician_activity_logs",
    )
    action_type = models.CharField(max_length=40, choices=ACTION_CHOICES)
    description = models.CharField(max_length=255, blank=True, default="")
    occurred_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "technician_activity_logs"
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["technician", "occurred_at"], name="tech_act_techn_occ_idx"),
            models.Index(fields=["action_type", "occurred_at"], name="tech_act_type_occ_idx"),
            models.Index(fields=["ticket", "occurred_at"], name="tech_act_ticket_occ_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.technician.user.name} - {self.action_type} @ {self.occurred_at.isoformat()}"


class BusinessHours(models.Model):
    GROUP_ALL = "all"
    GROUP_NETWORK = Technician.SKILL_NETWORK
    GROUP_SOFTWARE = Technician.SKILL_SOFTWARE
    GROUP_HARDWARE = Technician.SKILL_HARDWARE
    GROUP_SECURITY = Technician.SKILL_SECURITY

    GROUP_CHOICES = [
        (GROUP_ALL, "All Technicians"),
        (GROUP_NETWORK, "Network"),
        (GROUP_SOFTWARE, "Software"),
        (GROUP_HARDWARE, "Hardware"),
        (GROUP_SECURITY, "Security"),
    ]

    name = models.CharField(max_length=120, default="Default Business Hours")
    description = models.CharField(max_length=255, blank=True, default="")
    timezone_name = models.CharField(max_length=64, default="Africa/Maseru")
    groups = models.JSONField(default=default_business_hours_groups)
    weekly_schedule = models.JSONField(default=default_business_hours_schedule)
    is_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "business_hours"

    def __str__(self) -> str:
        return self.name


class BusinessHoliday(models.Model):
    business_hours = models.ForeignKey(BusinessHours, on_delete=models.CASCADE, related_name="holidays")
    name = models.CharField(max_length=120)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "business_holidays"
        constraints = [
            models.UniqueConstraint(fields=["business_hours", "date"], name="unique_business_holiday_per_day"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.date.isoformat()})"


class BusinessLeave(models.Model):
    TYPE_ANNUAL = "annual"
    TYPE_SICK = "sick"
    TYPE_STUDY = "study"
    TYPE_UNPAID = "unpaid"
    TYPE_OTHER = "other"

    TYPE_CHOICES = [
        (TYPE_ANNUAL, "Annual Leave"),
        (TYPE_SICK, "Sick Leave"),
        (TYPE_STUDY, "Study Leave"),
        (TYPE_UNPAID, "Unpaid Leave"),
        (TYPE_OTHER, "Other"),
    ]

    business_hours = models.ForeignKey(BusinessHours, on_delete=models.CASCADE, related_name="leaves")
    technician = models.ForeignKey(Technician, on_delete=models.CASCADE, related_name="business_leaves")
    leave_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_ANNUAL)
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "business_leaves"

    def __str__(self) -> str:
        return f"{self.technician.user.name} - {self.leave_type} ({self.start_date} to {self.end_date})"


class Ticket(models.Model):
    STATUS_PENDING = "Pending"
    STATUS_IN_PROCESS = "In Progress"
    STATUS_PENDING_REVIEW = "Pending Review"
    STATUS_SOLVED = "Solved"

    # Legacy values kept for backward compatibility with existing records.
    LEGACY_STATUS_OPEN = "Open"
    LEGACY_STATUS_IN_PROGRESS = "In Progress"
    LEGACY_STATUS_PENDING_VENDOR = "Pending Vendor"
    LEGACY_STATUS_RESOLVED = "Resolved"

    PRIORITY_LOW = "Low"
    PRIORITY_MEDIUM = "Medium"
    PRIORITY_HIGH = "High"
    PRIORITY_CRITICAL = "Critical"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_IN_PROCESS, "In Progress"),
        (STATUS_PENDING_REVIEW, "Pending Review"),
        (STATUS_SOLVED, "Solved"),
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
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_PENDING)
    employee = models.ForeignKey(User, on_delete=models.PROTECT, related_name="submitted_tickets")
    caller_name = models.CharField(max_length=150, blank=True, default="")
    logged_by_admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logged_call_tickets",
    )
    technician = models.ForeignKey(
        Technician, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_tickets"
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    accepted_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    escalation_level = models.PositiveIntegerField(default=0)
    reassign_count = models.PositiveIntegerField(default=0)
    reporter_reviewed_problem = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tickets"

    def __str__(self) -> str:
        return f"Ticket #{self.pk} - {self.title}"


class TicketAssignmentHistory(models.Model):
    REASON_AUTO_ASSIGN = "auto_assign"
    REASON_AUTO_REASSIGN = "auto_reassign"
    REASON_ADMIN_ESCALATION = "admin_escalation"
    REASON_TECHNICIAN_ESCALATION = "technician_escalation"
    REASON_MANUAL = "manual"

    REASON_CHOICES = [
        (REASON_AUTO_ASSIGN, "Auto Assign"),
        (REASON_AUTO_REASSIGN, "Auto Reassign"),
        (REASON_ADMIN_ESCALATION, "Admin Escalation"),
        (REASON_TECHNICIAN_ESCALATION, "Technician Escalation"),
        (REASON_MANUAL, "Manual"),
    ]

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="assignment_history")
    technician = models.ForeignKey(Technician, on_delete=models.CASCADE, related_name="assignment_history")
    reason = models.CharField(max_length=32, choices=REASON_CHOICES, default=REASON_AUTO_ASSIGN)
    note = models.CharField(max_length=255, blank=True, default="")
    assigned_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_assignment_history"
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["ticket", "assigned_at"], name="tasg_ticket_at_idx"),
            models.Index(fields=["technician", "assigned_at"], name="tasg_tech_at_idx"),
        ]

    def __str__(self) -> str:
        return f"Assignment #{self.pk} Ticket #{self.ticket_id} -> Technician #{self.technician_id}"


class TicketComment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ticket_comments")
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_comments"

    def __str__(self) -> str:
        return f"Comment #{self.pk} on Ticket #{self.ticket_id}"


class TicketMessage(models.Model):
    TYPE_REPLY = "REPLY"
    TYPE_INTERNAL_NOTE = "INTERNAL_NOTE"
    TYPE_DISCUSSION = "DISCUSSION"

    TYPE_CHOICES = [
        (TYPE_REPLY, "Reply"),
        (TYPE_INTERNAL_NOTE, "Internal Note"),
        (TYPE_DISCUSSION, "Discussion"),
    ]

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ticket_messages")
    message_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_REPLY)
    content = models.TextField()
    parent_message = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_messages",
    )
    is_internal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_messages"
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["ticket", "created_at"], name="ticket_mess_ticket__80bcb6_idx"),
            models.Index(fields=["ticket", "message_type", "created_at"], name="ticket_mess_ticket__b735e3_idx"),
            models.Index(fields=["parent_message", "created_at"], name="ticket_mess_parent__efbca8_idx"),
        ]

    def save(self, *args, **kwargs):
        self.is_internal = self.message_type != self.TYPE_REPLY
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"TicketMessage #{self.pk} ({self.message_type})"


class DiscussionParticipant(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="discussion_participants")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="discussion_participations")
    added_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="discussion_participants_added")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "discussion_participants"
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["ticket", "user"], name="unique_ticket_discussion_participant"),
        ]
        indexes = [
            models.Index(fields=["ticket", "created_at"], name="discussion__ticket__fa37be_idx"),
            models.Index(fields=["user", "created_at"], name="discussion__user_id_abf2cc_idx"),
        ]

    def __str__(self) -> str:
        return f"DiscussionParticipant #{self.pk} Ticket #{self.ticket_id}"


class Notification(models.Model):
    TYPE_MENTION = "MENTION"
    TYPE_REPLY = "REPLY"
    TYPE_DISCUSSION = "DISCUSSION"
    TYPE_SYSTEM = "SYSTEM"

    TYPE_CHOICES = [
        (TYPE_MENTION, "Mention"),
        (TYPE_REPLY, "Reply"),
        (TYPE_DISCUSSION, "Discussion"),
        (TYPE_SYSTEM, "System"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    ticket_message = models.ForeignKey(
        TicketMessage,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    message = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_SYSTEM)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "is_read", "created_at"], name="notificatio_user_id_5cf777_idx"),
            models.Index(fields=["type", "created_at"], name="notificatio_type_cb6908_idx"),
        ]

    def __str__(self) -> str:
        return f"Notification #{self.pk} for User #{self.user_id}"


class TicketMaterialRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="material_requests")
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ticket_material_requests")
    item_name = models.CharField(max_length=120)
    quantity = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ticket_material_requests"

    def __str__(self) -> str:
        return f"MaterialRequest #{self.pk} Ticket #{self.ticket_id}"


class Consumable(models.Model):
    asset_tag = models.CharField(max_length=100, blank=True, default="")
    item_name = models.CharField(max_length=100)
    manufacturer = models.CharField(max_length=120, blank=True, default="")
    brand = models.CharField(max_length=120, blank=True, default="")
    model_number = models.CharField(max_length=120, blank=True, default="")
    serial_number = models.CharField(max_length=120, blank=True, default="")
    category = models.CharField(max_length=60, blank=True, default="")
    subcategory = models.CharField(max_length=60, blank=True, default="")
    processor = models.CharField(max_length=120, blank=True, default="")
    ram = models.CharField(max_length=60, blank=True, default="")
    storage_type = models.CharField(max_length=60, blank=True, default="")
    storage_capacity = models.CharField(max_length=60, blank=True, default="")
    graphics_card = models.CharField(max_length=120, blank=True, default="")
    charger_included = models.BooleanField(null=True, blank=True)
    monitor_included = models.BooleanField(null=True, blank=True)
    keyboard_included = models.BooleanField(null=True, blank=True)
    mouse_included = models.BooleanField(null=True, blank=True)
    printer_type = models.CharField(max_length=60, blank=True, default="")
    print_speed = models.CharField(max_length=80, blank=True, default="")
    connectivity = models.CharField(max_length=120, blank=True, default="")
    duplex_printing = models.BooleanField(null=True, blank=True)
    paper_capacity = models.CharField(max_length=80, blank=True, default="")
    color_printing = models.BooleanField(null=True, blank=True)
    device_type = models.CharField(max_length=60, blank=True, default="")
    operating_system = models.CharField(max_length=120, blank=True, default="")
    battery_capacity = models.CharField(max_length=80, blank=True, default="")
    imei_number = models.CharField(max_length=120, blank=True, default="")
    quantity = models.PositiveIntegerField(default=0)
    purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    supplier = models.CharField(max_length=120, blank=True, default="")
    warranty_expiry = models.DateField(null=True, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    condition = models.CharField(max_length=60, blank=True, default="")
    status = models.CharField(max_length=60, blank=True, default="")
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
    ASSIGNMENT_TYPE_NEW = "new"
    ASSIGNMENT_TYPE_LOAN = "loan"
    ASSIGNMENT_TYPE_EXCHANGE = "exchange"
    ASSIGNMENT_TYPE_CHOICES = [
        (ASSIGNMENT_TYPE_NEW, "New"),
        (ASSIGNMENT_TYPE_LOAN, "Loan"),
        (ASSIGNMENT_TYPE_EXCHANGE, "Exchange"),
    ]

    consumable = models.ForeignKey(Consumable, on_delete=models.PROTECT, related_name="requests")
    employee = models.ForeignKey(User, on_delete=models.PROTECT, related_name="consumable_requests")
    quantity = models.PositiveIntegerField(default=1)
    assignment_type = models.CharField(
        max_length=20,
        choices=ASSIGNMENT_TYPE_CHOICES,
        default=ASSIGNMENT_TYPE_NEW,
    )
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


class ConsumableReturn(models.Model):
    STATUS_PENDING = "pending"
    STATUS_RECEIVED = "received"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RECEIVED, "Received"),
        (STATUS_REJECTED, "Rejected"),
    ]

    consumable_request = models.ForeignKey(
        ConsumableRequest,
        on_delete=models.PROTECT,
        related_name="return_requests",
    )
    consumable = models.ForeignKey(Consumable, on_delete=models.PROTECT, related_name="return_requests")
    employee = models.ForeignKey(User, on_delete=models.PROTECT, related_name="consumable_returns")
    quantity = models.PositiveIntegerField(default=1)
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    received_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="received_consumable_returns"
    )
    received_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="rejected_consumable_returns"
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "consumable_returns"

    def __str__(self) -> str:
        return f"ConsumableReturn #{self.pk} ({self.status})"
