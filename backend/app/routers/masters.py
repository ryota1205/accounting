from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import Client, Instructor, Agency
from app.schemas import MasterIn

router = APIRouter(prefix="/api/masters", tags=["masters"])

MODELS = {"clients": Client, "instructors": Instructor, "agencies": Agency}


def _model(kind: str):
    model = MODELS.get(kind)
    if model is None:
        raise HTTPException(status_code=404, detail="不明なマスタ種別です")
    return model


@router.get("/{kind}")
def list_master(kind: str, session: Session = Depends(get_session)):
    model = _model(kind)
    return session.exec(select(model).order_by(model.name)).all()


@router.post("/{kind}", status_code=201)
def create_master(kind: str, data: MasterIn, session: Session = Depends(get_session)):
    model = _model(kind)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="名称は必須です")
    if session.exec(select(model).where(model.name == name)).first():
        raise HTTPException(status_code=409, detail="同じ名称が既に存在します")
    row = model(name=name, active=data.active)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.put("/{kind}/{row_id}")
def update_master(kind: str, row_id: int, data: MasterIn, session: Session = Depends(get_session)):
    model = _model(kind)
    row = session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="マスタが見つかりません")
    row.name = data.name.strip()
    row.active = data.active
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{kind}/{row_id}", status_code=204)
def delete_master(kind: str, row_id: int, session: Session = Depends(get_session)):
    model = _model(kind)
    row = session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="マスタが見つかりません")
    session.delete(row)
    session.commit()
    return Response(status_code=204)
