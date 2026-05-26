"""
数据库迁移脚本：用于在已有数据库上添加新表或字段
"""
import sys
import os

# 获取backend目录的绝对路径
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# 添加backend目录到路径
sys.path.insert(0, backend_dir)

# 切换到backend目录，确保.env文件能被正确加载
os.chdir(backend_dir)

from sqlalchemy import inspect, text
from app.database import engine, Base
from app.models import (
    User, Task, WorkOrder, Opportunity, VisitLog, VisitLogMaintenanceLog, Review,
    CollaborativeMember, AuditLog, Notification
)

def table_exists(table_name: str) -> bool:
    """检查表是否存在"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def column_exists(table_name: str, column_name: str) -> bool:
    """检查表的字段是否存在"""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def create_missing_tables():
    """创建缺失的表"""
    print("检查并创建缺失的表...")
    
    # 获取所有模型对应的表名
    tables_to_create = {}
    for model_class in [User, Task, WorkOrder, Opportunity, VisitLog, VisitLogMaintenanceLog, Review,
                        CollaborativeMember, AuditLog, Notification]:
        table_name = model_class.__tablename__
        if not table_exists(table_name):
            tables_to_create[table_name] = model_class
    
    if not tables_to_create:
        print("✅ 所有表都已存在")
        return
    
    print(f"发现 {len(tables_to_create)} 个缺失的表，开始创建...")
    for table_name, model_class in tables_to_create.items():
        print(f"  创建表: {table_name}")
        model_class.__table__.create(engine, checkfirst=True)
    
    print("✅ 缺失的表创建完成！")


def add_notifications_table():
    """添加通知表（如果不存在）"""
    if table_exists('notifications'):
        print("✅ notifications 表已存在")
        return
    
    print("创建 notifications 表...")
    Notification.__table__.create(engine, checkfirst=True)
    print("✅ notifications 表创建完成")


def add_missing_columns():
    """添加缺失的字段"""
    print("\n检查并添加缺失的字段...")
    
    if table_exists('users'):
        # 添加登录失败次数字段
        if not column_exists('users', 'failed_login_attempts'):
            print("  添加字段: users.failed_login_attempts")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0"))
                conn.commit()
            print("    ✅ users.failed_login_attempts 添加完成")
        
        # 添加账户锁定时间字段
        if not column_exists('users', 'locked_until'):
            print("  添加字段: users.locked_until")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN locked_until DATETIME NULL"))
                conn.commit()
            print("    ✅ users.locked_until 添加完成")
    
    if table_exists('work_orders'):
        # 添加取消时间字段
        if not column_exists('work_orders', 'cancelled_at'):
            print("  添加字段: work_orders.cancelled_at")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE work_orders 
                    ADD COLUMN cancelled_at DATETIME NULL 
                    COMMENT '取消时间'
                """))
                conn.commit()
            print("    ✅ work_orders.cancelled_at 添加完成")
        
        # 添加取消原因字段
        if not column_exists('work_orders', 'cancellation_reason'):
            print("  添加字段: work_orders.cancellation_reason")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE work_orders 
                    ADD COLUMN cancellation_reason TEXT NULL 
                    COMMENT '取消原因'
                """))
                conn.commit()
            print("    ✅ work_orders.cancellation_reason 添加完成")
    
    if table_exists('visit_logs'):
        if not column_exists('visit_logs', 'has_clue'):
            print("  添加字段: visit_logs.has_clue")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN has_clue TINYINT(1) NOT NULL DEFAULT 0
                    COMMENT '是否有线索'
                """))
                conn.commit()
            print("    ✅ visit_logs.has_clue 添加完成")
        if not column_exists('visit_logs', 'clue_related_products'):
            print("  添加字段: visit_logs.clue_related_products")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN clue_related_products TEXT NULL
                    COMMENT '线索对应产品（JSON数组格式，支持多选）'
                """))
                conn.commit()
            print("    ✅ visit_logs.clue_related_products 添加完成")
        if not column_exists('visit_logs', 'current_stage'):
            print("  添加字段: visit_logs.current_stage")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN current_stage VARCHAR(50) NULL
                    COMMENT '当前阶段'
                """))
                conn.commit()
            print("    ✅ visit_logs.current_stage 添加完成")
        if not column_exists('visit_logs', 'promotion_progress'):
            print("  添加字段: visit_logs.promotion_progress")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN promotion_progress TEXT NULL
                    COMMENT '推进进展'
                """))
                conn.commit()
            print("    ✅ visit_logs.promotion_progress 添加完成")
        if not column_exists('visit_logs', 'promotion_requirements'):
            print("  添加字段: visit_logs.promotion_requirements")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN promotion_requirements TEXT NULL
                    COMMENT '推进要求'
                """))
                conn.commit()
            print("    ✅ visit_logs.promotion_requirements 添加完成")
        if not column_exists('visit_logs', 'is_customized_development'):
            print("  添加字段: visit_logs.is_customized_development")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN is_customized_development TINYINT(1) NOT NULL DEFAULT 0
                    COMMENT '是否定开'
                """))
                conn.commit()
            print("    ✅ visit_logs.is_customized_development 添加完成")
        if not column_exists('visit_logs', 'customized_development_requirements'):
            print("  添加字段: visit_logs.customized_development_requirements")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN customized_development_requirements TEXT NULL
                    COMMENT '定开要求（是否定开为是时填写）'
                """))
                conn.commit()
            print("    ✅ visit_logs.customized_development_requirements 添加完成")
        if not column_exists('visit_logs', 'promotion_progress_history'):
            print("  添加字段: visit_logs.promotion_progress_history")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN promotion_progress_history TEXT NULL
                    COMMENT '推进进展追加历史 JSON'
                """))
                conn.commit()
            print("    ✅ visit_logs.promotion_progress_history 添加完成")
        if not column_exists('visit_logs', 'project_amount'):
            print("  添加字段: visit_logs.project_amount")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN project_amount VARCHAR(50) NULL
                    COMMENT '预估金额（万元）'
                """))
                conn.commit()
            print("    ✅ visit_logs.project_amount 添加完成")
        if not column_exists('visit_logs', 'group_name'):
            print("  添加字段: visit_logs.group_name")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN group_name VARCHAR(100) NULL
                    COMMENT '组别（工单组长所属 FDE 组名快照）'
                """))
                conn.commit()
            print("    ✅ visit_logs.group_name 添加完成")
        if not column_exists('visit_logs', 'customer_unit'):
            print("  添加字段: visit_logs.customer_unit")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN customer_unit VARCHAR(500) NULL
                    COMMENT '客户单位快照'
                """))
                conn.commit()
            print("    ✅ visit_logs.customer_unit 添加完成")
        if not column_exists('visit_logs', 'industry'):
            print("  添加字段: visit_logs.industry")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN industry VARCHAR(200) NULL
                    COMMENT '行业（手动填写）'
                """))
                conn.commit()
            print("    ✅ visit_logs.industry 添加完成")
        if not column_exists('visit_logs', 'enterprise_type'):
            print("  添加字段: visit_logs.enterprise_type")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN enterprise_type VARCHAR(50) NULL
                    COMMENT '企业类型（大型企业/小微企业/中型企业/事业单位/政府单位）'
                """))
                conn.commit()
            print("    ✅ visit_logs.enterprise_type 添加完成")
        if not column_exists('visit_logs', 'customer_visit_address'):
            print("  添加字段: visit_logs.customer_visit_address")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN customer_visit_address VARCHAR(500) NULL
                    COMMENT '客户拜访地址快照'
                """))
                conn.commit()
            print("    ✅ visit_logs.customer_visit_address 添加完成")
        if not column_exists('visit_logs', 'customer_manager_name'):
            print("  添加字段: visit_logs.customer_manager_name")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN customer_manager_name VARCHAR(100) NULL
                    COMMENT '客户经理姓名快照'
                """))
                conn.commit()
            print("    ✅ visit_logs.customer_manager_name 添加完成")
        if not column_exists('visit_logs', 'customer_manager_contact'):
            print("  添加字段: visit_logs.customer_manager_contact")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN customer_manager_contact VARCHAR(100) NULL
                    COMMENT '客户经理联系方式快照'
                """))
                conn.commit()
            print("    ✅ visit_logs.customer_manager_contact 添加完成")
        if not column_exists('visit_logs', 'escort_staff'):
            print("  添加字段: visit_logs.escort_staff")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN escort_staff VARCHAR(200) NULL
                    COMMENT '陪跑人员（手动填写）'
                """))
                conn.commit()
            print("    ✅ visit_logs.escort_staff 添加完成")
        if not column_exists('visit_logs', 'sales_unit'):
            print("  添加字段: visit_logs.sales_unit")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN sales_unit TEXT NULL
                    COMMENT '所属销售单位快照（任务 sales_unit）'
                """))
                conn.commit()
            print("    ✅ visit_logs.sales_unit 添加完成")
        if not column_exists('visit_logs', 'remark'):
            print("  添加字段: visit_logs.remark")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN remark TEXT NULL
                    COMMENT '备注'
                """))
                conn.commit()
            print("    ✅ visit_logs.remark 添加完成")
        if not column_exists('visit_logs', 'has_requirement_scenario_sorted'):
            print("  添加字段: visit_logs.has_requirement_scenario_sorted")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN has_requirement_scenario_sorted TINYINT(1) NOT NULL DEFAULT 0
                    COMMENT '客户是否梳理过需求场景'
                """))
                conn.commit()
            print("    ✅ visit_logs.has_requirement_scenario_sorted 添加完成")
        if not column_exists('visit_logs', 'requirement_scenario_category'):
            print("  添加字段: visit_logs.requirement_scenario_category")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN requirement_scenario_category TEXT NULL
                    COMMENT '需求场景分类（JSON数组格式，支持多选）'
                """))
                conn.commit()
            print("    ✅ visit_logs.requirement_scenario_category 添加完成")
        if not column_exists('visit_logs', 'stage_effort_breakdown'):
            print("  添加字段: visit_logs.stage_effort_breakdown")
            with engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE visit_logs
                    ADD COLUMN stage_effort_breakdown TEXT NULL
                    COMMENT '阶段人员与时长(JSON数组：[{sub_phase,people,days}])'
                """))
                conn.commit()
            print("    ✅ visit_logs.stage_effort_breakdown 添加完成")
    
    print("✅ 字段检查完成")


def migrate_visit_log_has_decision_authority_to_string():
    """
    将 visit_logs.has_decision_authority 从布尔转为 VARCHAR，
    旧数据：true/1 -> 决策权，false/0 -> 无，NULL 保持 NULL。
    """
    if not table_exists("visit_logs"):
        return
    inspector = inspect(engine)
    cols = {c["name"]: c for c in inspector.get_columns("visit_logs")}
    if "has_decision_authority" not in cols:
        return
    col = cols["has_decision_authority"]
    py_type = type(col["type"]).__name__
    if py_type in ("VARCHAR", "NVARCHAR", "String"):
        print("  ✅ visit_logs.has_decision_authority 已是字符串类型，跳过迁移")
        return

    dialect = engine.dialect.name
    print("  迁移 visit_logs.has_decision_authority：布尔 -> 建议权/决策权/无（字符串）")
    if dialect == "mysql":
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE visit_logs
                    ADD COLUMN _hda_mig VARCHAR(20) NULL
                    COMMENT 'tmp migration'
                    """
                )
            )
            conn.commit()
            conn.execute(
                text(
                    """
                    UPDATE visit_logs SET _hda_mig = CASE
                      WHEN has_decision_authority IS NULL THEN NULL
                      WHEN CAST(has_decision_authority AS SIGNED) = 1 THEN '决策权'
                      ELSE '无'
                    END
                    """
                )
            )
            conn.commit()
            conn.execute(text("ALTER TABLE visit_logs DROP COLUMN has_decision_authority"))
            conn.commit()
            conn.execute(
                text(
                    """
                    ALTER TABLE visit_logs
                    CHANGE _hda_mig has_decision_authority VARCHAR(20) NULL
                    COMMENT '拜访对象权限：建议权、决策权、无'
                    """
                )
            )
            conn.commit()
        print("    ✅ MySQL 迁移完成")
    elif dialect == "sqlite":
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE visit_logs ADD COLUMN _hda_mig VARCHAR(20)"))
            conn.commit()
            conn.execute(
                text(
                    """
                    UPDATE visit_logs SET _hda_mig = CASE
                      WHEN has_decision_authority IS NULL THEN NULL
                      WHEN has_decision_authority IN (1, '1', 'true', 'True') THEN '决策权'
                      ELSE '无'
                    END
                    """
                )
            )
            conn.commit()
            try:
                conn.execute(text("ALTER TABLE visit_logs DROP COLUMN has_decision_authority"))
                conn.commit()
            except Exception as e:
                print(f"    ⚠️ SQLite 删除旧列失败（可能版本较旧）: {e}")
                raise
            conn.execute(
                text(
                    "ALTER TABLE visit_logs RENAME COLUMN _hda_mig TO has_decision_authority"
                )
            )
            conn.commit()
        print("    ✅ SQLite 迁移完成")
    else:
        print(
            f"    ⚠️ 未实现方言 {dialect} 的 has_decision_authority 迁移，请手动执行 sql/migrate_visit_log_decision_authority_mysql.sql"
        )


def migrate():
    """执行迁移"""
    print("=" * 50)
    print("数据库迁移脚本")
    print("=" * 50)
    print()
    
    try:
        # 1. 创建缺失的表
        create_missing_tables()
        
        # 2. 特别处理 notifications 表（新增功能）
        add_notifications_table()
        
        # 3. 添加缺失的字段
        add_missing_columns()

        # 4. 拜访日志：决策/建议权字段类型（布尔 -> 三选一字符串）
        migrate_visit_log_has_decision_authority_to_string()
        
        print()
        print("=" * 50)
        print("✅ 数据库迁移完成！")
        print("=" * 50)
        
        # 显示当前所有表
        print("\n当前数据库中的表：")
        inspector = inspect(engine)
        for table_name in sorted(inspector.get_table_names()):
            print(f"  - {table_name}")
            
    except Exception as e:
        print()
        print("=" * 50)
        print(f"❌ 数据库迁移失败: {e}")
        print("=" * 50)
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    migrate()

