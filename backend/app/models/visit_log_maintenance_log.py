"""线索维护操作记录（窄域更新：操作人 + 时间 + 变更字段摘要）"""
from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class VisitLogMaintenanceLog(Base):
    __tablename__ = "visit_log_maintenance_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    visit_log_id = Column(
        Integer, ForeignKey("visit_logs.id"), nullable=False, index=True, comment="线索维护记录ID"
    )
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="操作人ID")
    operated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="操作时间",
    )
    fields_changed = Column(
        Text, nullable=True, comment="本次涉及的字段名 JSON 数组，如 [\"project_amount\",\"promotion_progress\"]"
    )

    visit_log = relationship("VisitLog", back_populates="maintenance_logs")
    operator = relationship("User", foreign_keys=[operator_id])
