from django.urls import path

from .views import (
    ai_service_chat_proxy_view,
    assigned_tickets_view,
    assign_technician_view,
    consumable_detail_view,
    consumable_request_approve_view,
    consumable_request_reject_view,
    consumable_requests_collection_view,
    consumables_collection_view,
    login_view,
    ticket_priority_view,
    ticket_status_view,
    tickets_collection_view,
)

urlpatterns = [
    path("auth/login", login_view),
    path("ai-service/chat", ai_service_chat_proxy_view),
    path("tickets", tickets_collection_view),
    path("tickets/assigned/<int:technician_id>", assigned_tickets_view),
    path("tickets/<int:ticket_id>/assign", assign_technician_view),
    path("tickets/<int:ticket_id>/priority", ticket_priority_view),
    path("tickets/<int:ticket_id>/status", ticket_status_view),
    path("consumables", consumables_collection_view),
    path("consumables/<int:consumable_id>", consumable_detail_view),
    path("consumable-requests", consumable_requests_collection_view),
    path("consumable-requests/<int:request_id>/approve", consumable_request_approve_view),
    path("consumable-requests/<int:request_id>/reject", consumable_request_reject_view),
]
