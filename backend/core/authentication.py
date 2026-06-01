import os

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import User


AUTH_TOKEN_CACHE_PREFIX = "lec_intellisupport_auth_token:"
AUTH_TOKEN_SIGNING_SALT = "lec_intellisupport.auth_token"
AUTH_TOKEN_VERSION_PREFIX = "v1."


def _auth_token_ttl_seconds() -> int:
    try:
        value = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", str(60 * 60 * 24 * 7)))
    except (TypeError, ValueError):
        value = 60 * 60 * 24 * 7
    return max(value, 60)


def issue_auth_token(user: User) -> str:
    token = (
        f"{AUTH_TOKEN_VERSION_PREFIX}"
        f"{signing.dumps({'kind': 'auth', 'uid': user.id}, salt=AUTH_TOKEN_SIGNING_SALT, compress=True)}"
    )
    cache.set(f"{AUTH_TOKEN_CACHE_PREFIX}{token}", user.id, timeout=_auth_token_ttl_seconds())
    return token


def _get_active_user(user_id) -> User | None:
    try:
        normalized_user_id = int(user_id)
    except (TypeError, ValueError):
        return None
    return User.objects.filter(id=normalized_user_id, is_active=True).first()


def _get_user_for_signed_token(token: str) -> User | None:
    signed_value = token[len(AUTH_TOKEN_VERSION_PREFIX):] if token.startswith(AUTH_TOKEN_VERSION_PREFIX) else token
    try:
        payload = signing.loads(
            signed_value,
            salt=AUTH_TOKEN_SIGNING_SALT,
            max_age=_auth_token_ttl_seconds(),
        )
    except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
        return None

    if not isinstance(payload, dict) or payload.get("kind") != "auth":
        return None

    user_id = payload.get("uid")
    if isinstance(user_id, bool):
        return None

    user = _get_active_user(user_id)
    if user:
        cache.set(f"{AUTH_TOKEN_CACHE_PREFIX}{token}", user.id, timeout=_auth_token_ttl_seconds())
    return user


def get_user_for_token(token: str) -> User | None:
    if not token:
        return None
    user_id = cache.get(f"{AUTH_TOKEN_CACHE_PREFIX}{token}")
    if user_id:
        return _get_active_user(user_id)
    return _get_user_for_signed_token(token)


def restore_development_user_for_token(request, token: str) -> User | None:
    if not settings.DEBUG:
        return None

    raw_user_id = str(request.META.get("HTTP_X_LEC_SESSION_USER_ID", "")).strip()
    if not raw_user_id:
        return None

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        return None

    user = User.objects.filter(id=user_id, is_active=True).first()
    if user:
        cache.set(f"{AUTH_TOKEN_CACHE_PREFIX}{token}", user.id, timeout=_auth_token_ttl_seconds())
    return user


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
            user = restore_development_user_for_token(request, token)
        if not user:
            raise AuthenticationFailed("Invalid or expired token.")

        return (user, token)
