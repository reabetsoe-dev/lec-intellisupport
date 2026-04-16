import os
import secrets

from django.core.cache import cache
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import User


AUTH_TOKEN_CACHE_PREFIX = "lec_intellisupport_auth_token:"


def _auth_token_ttl_seconds() -> int:
    try:
        value = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", str(60 * 60 * 24 * 7)))
    except (TypeError, ValueError):
        value = 60 * 60 * 24 * 7
    return max(value, 60)


def issue_auth_token(user: User) -> str:
    token = secrets.token_urlsafe(32)
    cache.set(f"{AUTH_TOKEN_CACHE_PREFIX}{token}", user.id, timeout=_auth_token_ttl_seconds())
    return token


def get_user_for_token(token: str) -> User | None:
    if not token:
        return None
    user_id = cache.get(f"{AUTH_TOKEN_CACHE_PREFIX}{token}")
    if not user_id:
        return None
    return User.objects.filter(id=user_id, is_active=True).first()


class CachedBearerAuthentication(BaseAuthentication):
    keyword = "bearer"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth:
            return None

        if auth[0].lower() != self.keyword.encode("utf-8"):
            return None

        if len(auth) != 2:
            raise AuthenticationFailed("Invalid authorization header.")

        try:
            token = auth[1].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AuthenticationFailed("Invalid authorization token.") from exc

        user = get_user_for_token(token)
        if not user:
            raise AuthenticationFailed("Invalid or expired token.")

        return (user, token)
