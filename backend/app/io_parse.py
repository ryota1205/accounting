from datetime import date, datetime
from typing import Optional
import openpyxl

from app.schemas import DealIn

SHEET_NAME = "①案件日付別管理"
# 取込元シートの優先順位。年度ファイルによりデータの入っているシートが異なるため、
# 先頭から順に試し、最初にデータが取れたシートを採用する。
SHEET_CANDIDATES = ["①案件日付別管理", "案件入力"]


def _to_date(v) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def _to_int(v) -> int:
    if v is None or v == "":
        return 0
    return int(round(float(v)))


def _opt_int(v) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(round(float(v)))


def _to_str(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def parse_deals_sheet(wb) -> list[DealIn]:
    """ワークブックから案件を取り込む。

    年度ファイルにより案件データの入っているシートが異なる
    （「①案件日付別管理」または「案件入力」）。候補シートを順に試し、
    最初にデータが取れたシートを採用する。どれも空なら先頭シートを使う。
    """
    for name in SHEET_CANDIDATES:
        if name in wb.sheetnames:
            deals = _parse_ws(wb[name])
            if deals:
                return deals
    return _parse_ws(wb.active)


def _parse_ws(ws) -> list[DealIn]:
    deals: list[DealIn] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        revenue_month = _to_date(row[0])
        held_on = _to_date(row[1])
        client_name = _to_str(row[3])
        if held_on is None and revenue_month is None:
            continue
        if not client_name:
            continue
        if held_on is None:
            held_on = revenue_month
        deals.append(DealIn(
            revenue_month=revenue_month,
            held_on=held_on,
            agency=_to_str(row[2]),
            client=client_name,
            training_name=_to_str(row[4]),
            instructor=_to_str(row[5]),
            fee=_to_int(row[6]),
            transport=_to_int(row[7]),
            other=_to_int(row[8]),
            tax=_opt_int(row[9]),
            billing=_opt_int(row[10]),
            instructor_fee=_to_int(row[11]),
            payment_due=_to_date(row[12]),
            support_staff=_to_str(row[13]) if len(row) > 13 else None,
        ))
    return deals
