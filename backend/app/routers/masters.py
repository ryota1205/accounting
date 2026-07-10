from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import Client, Instructor, Agency
from app.schemas import MasterIn
from app.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/masters", tags=["masters"])

MODELS = {"clients": Client, "instructors": Instructor, "agencies": Agency}


def _model(kind: str):
    model = MODELS.get(kind)
    if model is None:
        raise HTTPException(status_code=404, detail="不明なマスタ種別です")
    return model


@router.get("/{kind}", dependencies=[Depends(get_current_user)])
def list_master(kind: str, session: Session = Depends(get_session)):
    model = _model(kind)
    return session.exec(select(model).order_by(model.name)).all()


@router.post("/{kind}", status_code=201, dependencies=[Depends(require_admin)])
def create_master(kind: str, data: MasterIn, session: Session = Depends(get_session)):
    model = _model(kind)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="名称は必須です")
    if session.exec(select(model).where(model.name == name)).first():
        raise HTTPException(status_code=409, detail="同じ名称が既に存在します")
    row = model(name=name, active=data.active)
    if model is Client:
        row.agency = (data.agency or "").strip() or None
        row.address = (data.address or "").strip() or None
        row.url = (data.url or "").strip() or None
        row.industry = (data.industry or "").strip() or None
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.put("/{kind}/{row_id}", dependencies=[Depends(require_admin)])
def update_master(kind: str, row_id: int, data: MasterIn, session: Session = Depends(get_session)):
    model = _model(kind)
    row = session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="マスタが見つかりません")
    name = data.name.strip()
    existing = session.exec(select(model).where(model.name == name)).first()
    if existing and existing.id != row_id:
        raise HTTPException(status_code=409, detail="同じ名称が既に存在します")
    row.name = name
    row.active = data.active
    if model is Client:
        row.agency = (data.agency or "").strip() or None
        row.address = (data.address or "").strip() or None
        row.url = (data.url or "").strip() or None
        row.industry = (data.industry or "").strip() or None
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{kind}/{row_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_master(kind: str, row_id: int, session: Session = Depends(get_session)):
    model = _model(kind)
    row = session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="マスタが見つかりません")
    session.delete(row)
    session.commit()
    return Response(status_code=204)
