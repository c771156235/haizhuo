"""
工单状态迁移脚本：将旧的 PENDING 状态迁移为 PENDING_ASSIGN 或 PENDING_ACCEPT
"""
import sys
import os

# 获取backend目录的绝对路径
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# 添加backend目录到路径
sys.path.insert(0, backend_dir)

# 切换到backend目录，确保.env文件能被正确加载
os.chdir(backend_dir)

from sqlalchemy import text, inspect
from app.database import engine, SessionLocal
from app.models.work_order import WorkOrder

def migrate_work_order_status():
    """迁移工单状态：将 PENDING 状态根据 member_id 迁移为 PENDING_ASSIGN 或 PENDING_ACCEPT"""
    print("=" * 60)
    print("工单状态迁移脚本")
    print("=" * 60)
    print()
    
    db = SessionLocal()
    try:
        # 1. 先修改 ENUM 类型定义，确保包含所有必需的值
        print("步骤 1: 修复数据库 ENUM 类型定义，确保包含所有状态值...")
        try:
            # MySQL 修改 ENUM 类型：包含所有必需的值（包括旧值和新值）
            # 注意：必须包含所有可能存在的状态值，否则会报错
            db.execute(text("""
                ALTER TABLE work_orders 
                MODIFY COLUMN status ENUM(
                    'pending',
                    'pending_assign',
                    'pending_accept', 
                    'accepted',
                    'in_progress',
                    'completed',
                    'cancelled'
                ) NOT NULL DEFAULT 'pending_assign'
            """))
            db.commit()
            print("✅ ENUM 类型定义已更新（包含所有状态值）")
        except Exception as e:
            print(f"⚠️  修改 ENUM 类型时出错: {e}")
            db.rollback()
            # 检查是否已经包含新值
            inspector = inspect(engine)
            columns = inspector.get_columns('work_orders')
            status_column = next((col for col in columns if col['name'] == 'status'), None)
            if status_column:
                # 检查 ENUM 值
                enum_type = str(status_column['type'])
                if 'pending_assign' in enum_type and 'pending_accept' in enum_type:
                    print("✅ ENUM 类型已包含新状态值，继续执行...")
                else:
                    print("❌ ENUM 类型不包含新状态值，请手动修改数据库")
                    raise
            else:
                print("❌ 未找到 status 字段")
                raise
        
        print()
        
        # 2. 检查是否有旧的 PENDING 状态数据
        result = db.execute(text("""
            SELECT COUNT(*) as count 
            FROM work_orders 
            WHERE status = 'pending'
        """))
        count = result.fetchone()[0]
        
        if count == 0:
            print("✅ 没有需要迁移的数据（没有找到 status='pending' 的工单）")
            print("正在移除 ENUM 中的 'pending' 值...")
            # 移除 pending 值
            try:
                db.execute(text("""
                    ALTER TABLE work_orders 
                    MODIFY COLUMN status ENUM(
                        'pending_assign',
                        'pending_accept', 
                        'accepted',
                        'in_progress',
                        'completed',
                        'cancelled'
                    ) NOT NULL DEFAULT 'pending_assign'
                """))
                db.commit()
                print("✅ ENUM 类型定义已更新（已移除 'pending'）")
            except Exception as e:
                print(f"⚠️  移除 'pending' 时出错: {e}")
                db.rollback()
            return
        
        print(f"步骤 2: 发现 {count} 条需要迁移的工单数据")
        print()
        
        # 3. 迁移逻辑：
        # - member_id IS NULL → pending_assign（待转派）
        # - member_id IS NOT NULL → pending_accept（待接单）
        
        print("步骤 3: 开始迁移数据...")
        
        # 先更新 member_id 为 NULL 的记录
        result1 = db.execute(text("""
            UPDATE work_orders 
            SET status = 'pending_assign' 
            WHERE status = 'pending' AND member_id IS NULL
        """))
        count1 = result1.rowcount
        print(f"✅ 已迁移 {count1} 条工单：pending → pending_assign（待转派）")
        
        # 再更新 member_id 不为 NULL 的记录
        result2 = db.execute(text("""
            UPDATE work_orders 
            SET status = 'pending_accept' 
            WHERE status = 'pending' AND member_id IS NOT NULL
        """))
        count2 = result2.rowcount
        print(f"✅ 已迁移 {count2} 条工单：pending → pending_accept（待接单）")
        
        # 提交事务
        db.commit()
        
        print()
        print(f"总计迁移：{count1 + count2} 条工单")
        
        # 4. 最后移除 ENUM 中的 'pending' 值
        print()
        print("步骤 4: 移除 ENUM 类型中的 'pending' 值...")
        try:
            db.execute(text("""
                ALTER TABLE work_orders 
                MODIFY COLUMN status ENUM(
                    'pending_assign',
                    'pending_accept', 
                    'accepted',
                    'in_progress',
                    'completed',
                    'cancelled'
                ) NOT NULL DEFAULT 'pending_assign'
            """))
            db.commit()
            print("✅ ENUM 类型定义已更新（已移除 'pending'）")
        except Exception as e:
            print(f"⚠️  移除 'pending' 时出错（可能仍有 pending 数据）: {e}")
            db.rollback()
            # 检查是否还有 pending 数据
            result = db.execute(text("""
                SELECT COUNT(*) as count 
                FROM work_orders 
                WHERE status = 'pending'
            """))
            remaining = result.fetchone()[0]
            if remaining > 0:
                print(f"⚠️  仍有 {remaining} 条 pending 状态的工单，请检查数据")
            else:
                print("⚠️  数据已迁移完成，但移除 ENUM 值失败，可能需要手动执行 SQL")
        
        print()
        print("=" * 60)
        print("✅ 工单状态迁移完成！")
        print("=" * 60)
        
        # 4. 验证迁移结果
        print()
        print("验证迁移结果：")
        result = db.execute(text("""
            SELECT status, COUNT(*) as count 
            FROM work_orders 
            GROUP BY status
            ORDER BY status
        """))
        print("当前工单状态分布：")
        for row in result:
            print(f"  {row[0]}: {row[1]} 条")
        
    except Exception as e:
        db.rollback()
        print()
        print("=" * 60)
        print(f"❌ 迁移失败: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate_work_order_status()

