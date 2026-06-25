def test_items_seeded_empty_then_create_and_list(client):
    # テストDBは未シード（conftestは create_all のみ）→ 初期は空
    assert client.get("/api/cashflow/items").json() == []
    # 追加
    res = client.post("/api/cashflow/items", json={"name": "消費税"})
    assert res.status_code == 200
    assert res.json()["name"] == "消費税"
    assert res.json()["sort_order"] == 0
    client.post("/api/cashflow/items", json={"name": "社会保険料"})
    items = client.get("/api/cashflow/items").json()
    assert [i["name"] for i in items] == ["消費税", "社会保険料"]


def test_item_rename(client):
    item = client.post("/api/cashflow/items", json={"name": "仮"}).json()
    res = client.patch(f"/api/cashflow/items/{item['id']}", json={"name": "法人税等"})
    assert res.status_code == 200
    assert res.json()["name"] == "法人税等"


def test_item_logical_delete_hides_from_list(client):
    item = client.post("/api/cashflow/items", json={"name": "消す予定"}).json()
    res = client.delete(f"/api/cashflow/items/{item['id']}")
    assert res.status_code == 200
    names = [i["name"] for i in client.get("/api/cashflow/items").json()]
    assert "消す予定" not in names


def test_schedule_put_then_get_returns_matrix(client):
    tax = client.post("/api/cashflow/items", json={"name": "消費税"}).json()
    res = client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [
            {"item_id": tax["id"], "ym": "2026-05", "amount": 800000},
            {"item_id": tax["id"], "ym": "2026-11", "amount": 800000},
        ],
    })
    assert res.status_code == 200
    got = client.get("/api/cashflow/schedule", params={"fiscal_year": 2026}).json()
    # item_id -> { ym: amount } の形で返す
    assert got["amounts"][str(tax["id"])]["2026-05"] == 800000
    assert got["amounts"][str(tax["id"])]["2026-11"] == 800000


def test_schedule_put_zero_overwrites_existing(client):
    tax = client.post("/api/cashflow/items", json={"name": "消費税"}).json()
    client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [{"item_id": tax["id"], "ym": "2026-05", "amount": 800000}],
    })
    client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [{"item_id": tax["id"], "ym": "2026-05", "amount": 0}],
    })
    got = client.get("/api/cashflow/schedule", params={"fiscal_year": 2026}).json()
    assert got["amounts"].get(str(tax["id"]), {}).get("2026-05", 0) == 0


def _deal(tc, **over):
    base = dict(held_on="2026-04-10", client="A社", fee=1000000, instructor_fee=300000)
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_cashflow_billing_basis_balance(client):
    # 期首500万・固定費月100万
    client.put("/api/settings/2026", json={"opening_balance": 5000000, "monthly_fixed_cost": 1000000})
    # 4月: 請求 fee100万+税10万=110万、原価30万
    _deal(client, held_on="2026-04-10", fee=1000000, instructor_fee=300000)
    # 大型支払い: 5月に消費税80万
    tax = client.post("/api/cashflow/items", json={"name": "消費税"}).json()
    client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [{"item_id": tax["id"], "ym": "2026-05", "amount": 800000}],
    })

    res = client.get("/api/cashflow", params={"fiscal_year": 2026, "basis": "billing"})
    assert res.status_code == 200
    b = res.json()
    assert b["labels"][0] == "4月"
    assert b["opening_balance"] == 5000000
    # 4月: 入金110万 / 固定費100万 / 原価30万 / 大型0 → 収支 -20万
    assert b["inflow"][0] == 1100000
    assert b["fixed_cost"][0] == 1000000
    assert b["cost"][0] == 300000
    assert b["big_payment"][0] == 0
    assert b["net"][0] == 1100000 - (1000000 + 300000 + 0)
    # 5月: 入金0 / 固定費100万 / 原価0 / 大型80万 → 収支 -180万
    assert b["big_payment"][1] == 800000
    assert b["net"][1] == 0 - (1000000 + 0 + 800000)
    # 累計残高[1] = 500万 + (-20万) + (-180万) = 300万
    assert b["balance"][0] == 5000000 + b["net"][0]
    assert b["balance"][1] == b["balance"][0] + b["net"][1]


def test_cashflow_paid_basis_uses_paid_on_month(client):
    client.put("/api/settings/2026", json={"opening_balance": 0, "monthly_fixed_cost": 0})
    # 売上は4月、入金は7月
    d = _deal(client, held_on="2026-04-10", fee=1000000, instructor_fee=0,
              payment_status="invoiced")
    client.post(f"/api/deals/{d['id']}/pay", json={"paid_on": "2026-07-20"})

    res = client.get("/api/cashflow", params={"fiscal_year": 2026, "basis": "paid"})
    b = res.json()
    # 4月(index0)には入金が乗らず、7月(index3)に乗る
    assert b["inflow"][0] == 0
    assert b["inflow"][3] == 1100000
