"""
诊断 option_configs 表的问题
检查数据库实际数据和SQLAlchemy模型定义
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine, text, inspect
from app.models.option_config import OptionConfig, OptionType
from app.database import SessionLocal
from sqlalchemy.orm import sessionmaker

def diagnose():
    """诊断问题"""
    print("=" * 60)
    print("诊断 option_configs 表的问题")
    print("=" * 60)
    print()
    
    # 1. 检查数据库表结构
    print("步骤 1: 检查数据库表结构...")
    engine = create_engine(os.getenv('DATABASE_URL', 'mysql+pymysql://root:123456@localhost:3306/fde_system'))
    
    with engine.connect() as conn:
        # 检查列类型
        result = conn.execute(text("""
            SELECT 
                COLUMN_NAME,
                COLUMN_TYPE,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_COMMENT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'option_configs'
              AND COLUMN_NAME = 'option_type'
        """))
        
        row = result.fetchone()
        if row:
            print(f"  列名: {row[0]}")
            print(f"  列类型: {row[1]}")
            print(f"  数据类型: {row[2]}")
            print(f"  是否允许NULL: {row[3]}")
            print(f"  注释: {row[4]}")
        else:
            print("  ❌ 未找到 option_type 列")
            return
    
    print()
    
    # 2. 检查数据库中的实际数据
    print("步骤 2: 检查数据库中的实际数据...")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT option_type, COUNT(*) as count
            FROM option_configs
            GROUP BY option_type
        """))
        
        rows = result.fetchall()
        if rows:
            print("  数据库中的 option_type 值:")
            for row in rows:
                print(f"    - {row[0]} (出现 {row[1]} 次)")
        else:
            print("  ⚠️  表中没有数据")
    
    print()
    
    # 3. 检查Python枚举定义
    print("步骤 3: 检查Python枚举定义...")
    print("  OptionType 枚举成员:")
    for member in OptionType:
        print(f"    - {member.name} = '{member.value}'")
    
    print()
    
    # 4. 检查SQLAlchemy列定义
    print("步骤 4: 检查SQLAlchemy列定义...")
    column = OptionConfig.__table__.columns['option_type']
    print(f"  列类型: {type(column.type)}")
    print(f"  列类型详情: {column.type}")
    if hasattr(column.type, 'native_enum'):
        print(f"  native_enum: {column.type.native_enum}")
    if hasattr(column.type, 'enums'):
        print(f"  枚举值: {column.type.enums}")
    
    print()
    
    # 5. 尝试直接查询
    print("步骤 5: 尝试直接查询（不使用ORM）...")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT id, option_type, label FROM option_configs LIMIT 5"))
            rows = result.fetchall()
            print(f"  ✅ 直接查询成功，找到 {len(rows)} 条记录")
            for row in rows:
                print(f"    ID: {row[0]}, option_type: '{row[1]}' (类型: {type(row[1])}), label: {row[2]}")
    except Exception as e:
        print(f"  ❌ 直接查询失败: {e}")
    
    print()
    
    # 6. 尝试使用ORM查询
    print("步骤 6: 尝试使用ORM查询...")
    db = SessionLocal()
    try:
        # 尝试直接查询，不转换枚举
        result = db.execute(text("SELECT id, option_type, label FROM option_configs LIMIT 5"))
        rows = result.fetchall()
        print(f"  ✅ ORM直接SQL查询成功，找到 {len(rows)} 条记录")
        for row in rows:
            print(f"    ID: {row[0]}, option_type: '{row[1]}' (类型: {type(row[1])}), label: {row[2]}")
    except Exception as e:
        print(f"  ❌ ORM直接SQL查询失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
    
    print()
    print("=" * 60)
    print("诊断完成")
    print("=" * 60)

if __name__ == "__main__":
    diagnose()

