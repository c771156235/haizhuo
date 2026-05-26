"""
初始化数据库：创建所有表
"""
import sys
import os

# 获取backend目录的绝对路径
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# 添加backend目录到路径
sys.path.insert(0, backend_dir)

# 切换到backend目录，确保.env文件能被正确加载
os.chdir(backend_dir)

from app.database import engine, Base
from app.models import (
    User, UserRoleAssociation, Task, TaskDetailRequirement, WorkOrder, Opportunity, VisitLog, Lead, Review, CollaborativeMember, AuditLog, Notification
)

def init_database():
    """创建所有数据库表"""
    print("正在创建数据库表...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ 数据库表创建完成！")
        print("已创建的表：")
        for table_name in Base.metadata.tables.keys():
            print(f"  - {table_name}")
    except Exception as e:
        print(f"❌ 创建数据库表失败: {e}")
        raise

if __name__ == "__main__":
    init_database()

