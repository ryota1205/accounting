import io
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, delete
import openpyxl

from app.db import get_session
from app.models import Deal
from app.service import build_deal, register_masters
from app.io_parse import parse_deals_sheet
from app.auth import require_admin

router = APIRouter(prefix="/api", tags=["io"], dependencies=[Depends(require_admin)])

EXPORT_HEADER = ["売上月", "実施日", "代理店", "企業名", "研修名", "講師",
                 "研修費用", "交通費", "その他", "消費税", "請求額", "講師料",
                 "入金予定日", "入金状況", "入金日", "サポートスタッフ", "備考"]


@router.post("/import/excel")
async def import_excel(file: UploadFile = File(...), wipe: bool = False,
                       session: Session = Depends(get_session)):
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    deals_in = parse_deals_sheet(wb)
    built = [build_deal(d) for d in deals_in]
    if wipe:
        # 取り込むデータに含まれる年度のみ置き換える（他年度のデータは保持）
        for fy in {d.fiscal_year for d in built}:
            session.exec(delete(Deal).where(Deal.fiscal_year == fy))
    imported = 0
    for data, deal in zip(deals_in, built):
        # 取り込み案件は実績（請求済）として扱う
        deal.payment_status = "invoiced"
        deal.project_status = "実施済"
        session.add(deal)
        register_masters(session, client=data.client,
                         instructor=data.instructor, agency=data.agency)
        imported += 1
    session.commit()
    return {"imported": imported}


@router.get("/export/excel")
def export_excel(fiscal_year: int, session: Session = Depends(get_session)):
    deals = session.exec(
        select(Deal).where(Deal.fiscal_year == fiscal_year)
        .order_by(Deal.revenue_month, Deal.held_on)
    ).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{fiscal_year}年度"
    ws.append(EXPORT_HEADER)
    for d in deals:
        ws.append([
            d.revenue_month, d.held_on, d.agency, d.client, d.training_name, d.instructor,
            d.fee, d.transport, d.other, d.tax, d.billing, d.instructor_fee,
            d.payment_due, ("入金済" if d.payment_status == "paid" else "未入金"),
            d.paid_on, d.support_staff, d.note,
        ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"sales_{fiscal_year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
