from datetime import date
from app.schemas import DealIn
from app.service import build_deal, register_masters
from app.models import Client, Instructor, Agency
from sqlmodel import select


def test_build_deal_auto_calculates_tax_billing_month_year():
    deal = build_deal(DealIn(held_on=date(2026, 6, 19), client="花王株式会社", fee=430000))
    assert deal.tax == 43000
    assert deal.billing == 473000
    assert deal.revenue_month == date(2026, 6, 30)
    assert deal.fiscal_year == 2026


def test_build_deal_respects_manual_tax_and_billing():
    deal = build_deal(DealIn(
        held_on=date(2026, 7, 30), client="タダノ共栄会",
        fee=300000, transport=50000, tax=30000, billing=380000,
    ))
    assert deal.tax == 30000
    assert deal.billing == 380000


def test_register_masters_inserts_new_names(session):
    register_masters(session, client="新規企業", instructor="新規講師", agency="新規代理店")
    session.commit()
    assert session.exec(select(Client).where(Client.name == "新規企業")).first() is not None
    assert session.exec(select(Instructor).where(Instructor.name == "新規講師")).first() is not None
    assert session.exec(select(Agency).where(Agency.name == "新規代理店")).first() is not None


def test_register_masters_is_idempotent(session):
    register_masters(session, client="重複企業")
    register_masters(session, client="重複企業")
    session.commit()
    rows = session.exec(select(Client).where(Client.name == "重複企業")).all()
    assert len(rows) == 1


def _sample_payload(**over):
    base = dict(held_on="2026-06-19", client="花王株式会社",
                instructor="高橋", fee=430000)
    base.update(over)
    return base


def test_create_deal_returns_calculated_fields(client):
    res = client.post("/api/deals", json=_sample_payload())
    assert res.status_code == 201
    body = res.json()
    assert body["tax"] == 43000
    assert body["billing"] == 473000
    assert body["fiscal_year"] == 2026
    assert body["revenue_month"] == "2026-06-30"
    assert body["id"] > 0


def test_create_deal_requires_client(client):
    res = client.post("/api/deals", json=_sample_payload(client=""))
    assert res.status_code == 422


def test_list_deals_filters_by_fiscal_year_and_status(client):
    client.post("/api/deals", json=_sample_payload(held_on="2026-06-19"))
    client.post("/api/deals", json=_sample_payload(held_on="2027-05-10"))  # 2027年度
    res = client.get("/api/deals", params={"fiscal_year": 2026})
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["fiscal_year"] == 2026


def test_update_and_delete_deal(client):
    created = client.post("/api/deals", json=_sample_payload()).json()
    did = created["id"]
    upd = client.put(f"/api/deals/{did}", json=_sample_payload(fee=500000))
    assert upd.status_code == 200
    assert upd.json()["tax"] == 50000
    assert upd.json()["billing"] == 550000
    dele = client.delete(f"/api/deals/{did}")
    assert dele.status_code == 204
    assert client.get("/api/deals", params={"fiscal_year": 2026}).json() == []


def test_create_deal_autoregisters_masters(client):
    client.post("/api/deals", json=_sample_payload(client="自動登録企業", instructor="自動講師"))
    masters = client.get("/api/masters/clients").json()
    names = [m["name"] for m in masters]
    assert "自動登録企業" in names


def test_create_deal_rejects_invalid_payment_status(client):
    res = client.post("/api/deals", json=_sample_payload(payment_status="bogus"))
    assert res.status_code == 422


def test_get_deal_not_found(client):
    assert client.get("/api/deals/99999").status_code == 404


def test_create_deal_autoregisters_instructor(client):
    client.post("/api/deals", json=_sample_payload(client="X社", instructor="新講師Z"))
    names = [m["name"] for m in client.get("/api/masters/instructors").json()]
    assert "新講師Z" in names
