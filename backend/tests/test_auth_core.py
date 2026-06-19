from app import auth


def test_hash_and_verify():
    h, salt = auth.hash_password("secret123")
    assert auth.verify_password("secret123", salt, h)
    assert not auth.verify_password("wrong", salt, h)
    # 同じパスワード＋同じソルトなら再現性あり
    h2, _ = auth.hash_password("secret123", salt)
    assert h == h2


def test_token_roundtrip():
    token = auth.make_token("admin", "admin")
    payload = auth.parse_token(token)
    assert payload is not None
    assert payload["u"] == "admin"
    assert payload["r"] == "admin"


def test_token_tampered_signature():
    token = auth.make_token("admin", "admin")
    body, sig = token.split(".", 1)
    # body を改ざんすると署名が合わず None
    assert auth.parse_token(body + "x." + sig) is None
    # 署名を改ざんしても None
    assert auth.parse_token(body + "." + sig + "x") is None


def test_token_expired():
    token = auth.make_token("admin", "admin", days=-1)  # 既に期限切れ
    assert auth.parse_token(token) is None


def test_token_garbage():
    assert auth.parse_token("not-a-token") is None
    assert auth.parse_token("") is None
