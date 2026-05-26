"""拜访日志推进进展：追加历史（JSON）与纯文本拼接展示。"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, List, Optional


def _at_to_iso_z(dt: datetime) -> str:
    """与接口 DateTime 一致：存 UTC ISO8601（Z），前端 dayjs 按本地展示。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    u = dt.astimezone(timezone.utc).replace(microsecond=0)
    return u.isoformat().replace("+00:00", "Z")


def _format_at_for_plain(at_val: Any) -> str:
    """拼接 promotion_progress 纯文本：ISO8601（含 Z）转为上海时区；旧版无时区字符串原样返回。"""
    if at_val is None or at_val == "":
        return ""
    if not isinstance(at_val, str):
        return str(at_val)
    s = at_val.strip()
    if "T" not in s and not s.endswith("Z"):
        return s
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return s
    if dt.tzinfo is None:
        return s
    from zoneinfo import ZoneInfo

    return dt.astimezone(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")


def parse_progress_entries(raw: Optional[str]) -> List[dict[str, Any]]:
    if raw is None or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: List[dict[str, Any]] = []
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("text"), str):
            out.append(item)
    return out


def format_progress_plain(entries: List[dict[str, Any]]) -> str:
    parts: list[str] = []
    for e in entries:
        text = (e.get("text") or "").strip()
        if not text:
            continue
        at = e.get("at")
        at_show = _format_at_for_plain(at)
        name = e.get("user_name") or ""
        if at_show and name:
            parts.append(f"【{at_show} {name}】\n{text}")
        elif at_show:
            parts.append(f"【{at_show}】\n{text}")
        elif name:
            parts.append(f"【{name}】\n{text}")
        else:
            parts.append(text)
    return "\n\n".join(parts).strip()


def append_progress_entry(
    history_raw: Optional[str],
    *,
    legacy_plain: Optional[str],
    user_id: int,
    user_name: str,
    text: str,
    at: datetime,
) -> tuple[str, str]:
    """返回 (promotion_progress_history JSON, promotion_progress 纯文本)."""
    entries = parse_progress_entries(history_raw)
    plain = (legacy_plain or "").strip()
    if not entries and plain:
        entries.append(
            {
                "at": None,
                "user_id": None,
                "user_name": "历史记录",
                "text": plain,
            }
        )
    entries.append(
        {
            "at": _at_to_iso_z(at),
            "user_id": user_id,
            "user_name": user_name or "",
            "text": text.strip(),
        }
    )
    hist = json.dumps(entries, ensure_ascii=False)
    plain_out = format_progress_plain(entries)
    return hist, plain_out


def format_progress_for_export(history_raw: Optional[str], plain: Optional[str]) -> str:
    entries = parse_progress_entries(history_raw)
    if entries:
        return format_progress_plain(entries)
    return (plain or "").strip()
