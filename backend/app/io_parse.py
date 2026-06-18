from datetime import date, datetime
from typing import Optional
import openpyxl

from app.schemas import DealIn

SHEET_NAME = "①案件日付別管理"


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
    ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.active
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
