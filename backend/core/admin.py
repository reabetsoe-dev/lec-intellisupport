from django.contrib import admin
from .models import Consumable, ConsumableRequest, InventoryAssignment, Technician, Ticket, TicketComment, User

admin.site.register(User)
admin.site.register(Technician)
admin.site.register(Ticket)
admin.site.register(TicketComment)
admin.site.register(Consumable)
admin.site.register(ConsumableRequest)
admin.site.register(InventoryAssignment)
