"""
为「组内待认领」派单增加列：dispatch_group_id、team_leader_id 可空。

用法（在项目根目录下）:
  cd backend && python -m scripts.migrate_work_order_group_pool

或:
  python f:/FDE_project/backend/scripts/migrate_work_order_group_pool.py
"""
import sys
from pathlib import Path

# 保证可导入 app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text, inspect
from app.database import engine  # noqa: E402


def run():
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("work_orders")}

    with engine.begin() as conn:
        if "dispatch_group_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE work_orders ADD COLUMN dispatch_group_id INTEGER "
                    "REFERENCES groups (id)"
                )
            )
            print("Added column work_orders.dispatch_group_id")
        else:
            print("Column work_orders.dispatch_group_id already exists")

    # team_leader_id 可空：按方言处理
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "sqlite":
            # SQLite 无法用一条 ALTER 去掉 NOT NULL（旧库）；若插入 NULL 失败需重建表
            print(
                "SQLite: team_leader_id NULL — if INSERT fails, recreate table or use newer SQLite migration."
            )
        elif dialect in ("mysql", "mariadb"):
            conn.execute(text("ALTER TABLE work_orders MODIFY team_leader_id INT NULL"))
            print("MySQL/MariaDB: team_leader_id set nullable")
        elif dialect == "postgresql":
            conn.execute(text("ALTER TABLE work_orders ALTER COLUMN team_leader_id DROP NOT NULL"))
            print("PostgreSQL: team_leader_id set nullable")
        else:
            print(f"Dialect {dialect}: please set team_leader_id nullable manually if needed")


if __name__ == "__main__":
    run()
