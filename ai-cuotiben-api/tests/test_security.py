from datetime import timedelta
from app.core import security

def test_hash_and_verify_roundtrip():
    h = security.hash_passphrase("secret123")
    assert h != "secret123"
    assert security.verify_passphrase("secret123", h) is True
    assert security.verify_passphrase("wrong", h) is False

def test_jwt_roundtrip():
    token = security.create_access_token(user_id=42)
    assert security.decode_user_id(token) == 42

def test_jwt_tampered_returns_none():
    token = security.create_access_token(user_id=42)
    assert security.decode_user_id(token + "x") is None

def test_jwt_expired_returns_none():
    token = security.create_access_token(user_id=42, expires=timedelta(seconds=-1))
    assert security.decode_user_id(token) is None
