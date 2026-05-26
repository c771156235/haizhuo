"""
创建管理员用户
"""
import sys
import os

# 获取backend目录的绝对路径
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# 添加backend目录到路径
sys.path.insert(0, backend_dir)

# 切换到backend目录，确保.env文件能被正确加载
os.chdir(backend_dir)

from app.database import SessionLocal
from app.models.user import User, UserRole, ApprovalStatus
from app.core.security import get_password_hash
from datetime import datetime

def create_admin(username: str = "admin", password: str = "admin123", real_name: str = "管理员"):
    """创建管理员用户"""
    db = SessionLocal()
    try:
        # 检查用户是否已存在
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            print(f"用户 {username} 已存在！")
            return
        
        # 创建管理员（超管默认审核通过，不需要审核）
        admin = User(
            username=username,
            password_hash=get_password_hash(password),
            real_name=real_name,
            role=UserRole.MANAGER,
            is_active=True,
            approval_status=ApprovalStatus.APPROVED.value,
            approved_at=datetime.utcnow(),
            approved_by=None  # 系统自动审核，无审核人
        )
        db.add(admin)
        db.commit()
        print(f"管理员用户创建成功！")
        print(f"用户名: {username}")
        print(f"密码: {password}")
        print(f"角色: {UserRole.MANAGER.value}")
    except Exception as e:
        db.rollback()
        print(f"创建管理员失败: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="创建管理员用户")
    parser.add_argument("--username", default="admin", help="用户名")
    parser.add_argument("--password", default="admin123", help="密码")
    parser.add_argument("--name", default="管理员", help="真实姓名")
    args = parser.parse_args()
    
    create_admin(args.username, args.password, args.name)

