async def test_register_creates_user_and_returns_token(client):
    r = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    assert r.status_code == 200
    assert r.json()["data"]["token"]

async def test_register_same_combo_logs_in(client):
    await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    r = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    assert r.status_code == 200

async def test_same_nickname_different_passphrase_are_distinct(client):
    a = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    b = await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p2"})
    assert a.json()["data"]["user_id"] != b.json()["data"]["user_id"]

async def test_login_wrong_passphrase_401(client):
    await client.post("/api/auth/register", json={"nickname": "李雷", "passphrase": "p1"})
    r = await client.post("/api/auth/login", json={"nickname": "李雷", "passphrase": "bad"})
    assert r.status_code == 401

async def test_login_success(client):
    await client.post("/api/auth/register", json={"nickname": "韩梅", "passphrase": "p1"})
    r = await client.post("/api/auth/login", json={"nickname": "韩梅", "passphrase": "p1"})
    assert r.status_code == 200
    assert r.json()["data"]["token"]
