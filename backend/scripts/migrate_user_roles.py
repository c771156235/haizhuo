"""
数据迁移脚本：将现有用户的role字段迁移到user_roles表
"""
import sys
import os

# 获取backend目录的绝对路径
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# 添加backend目录到路径
sys.path.insert(0, backend_dir)

# 切换到backend目录，确保.env文件能被正确加载
os.chdir(backend_dir)

from app.database import SessionLocal, engine, Base
from app.models.user import User, UserRoleAssociation, ApprovalStatus
from sqlalchemy import text

def migrate_user_roles():
    """迁移用户角色数据"""
    print("开始迁移用户角色数据...")
    
    # 确保表已创建
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 获取所有有role字段的用户
        users = db.query(User).filter(User.role.isnot(None)).all()
        
        print(f"找到 {len(users)} 个需要迁移的用户")
        
        migrated_count = 0
        skipped_count = 0
        
        for user in users:
            # 检查是否已经存在角色关联
            existing_role = db.query(UserRoleAssociation).filter(
                UserRoleAssociation.user_id == user.id,
                UserRoleAssociation.role == user.role
            ).first()
            
            if existing_role:
                print(f"  跳过用户 {user.username}：角色 {user.role.value} 已存在")
                skipped_count += 1
                continue
            
            # 创建角色关联
            role_assoc = UserRoleAssociation(
                user_id=user.id,
                role=user.role,
                sales_unit=user.sales_unit,
                is_current=True,  # 设置为当前角色
                is_active=True,
                approval_status=user.approval_status if user.approval_status else ApprovalStatus.PENDING.value,
                rejection_reason=user.rejection_reason,
                approved_at=user.approved_at,
                approved_by=user.approved_by
            )
            
            db.add(role_assoc)
            migrated_count += 1
            print(f"  ✓ 迁移用户 {user.username} 的角色 {user.role.value}")
        
        # 确保每个用户只有一个当前角色
        print("\n检查并修复当前角色设置...")
        all_users = db.query(User).all()
        for user in all_users:
            current_roles = db.query(UserRoleAssociation).filter(
                UserRoleAssociation.user_id == user.id,
                UserRoleAssociation.is_current == True
            ).all()
            
            if len(current_roles) > 1:
                # 如果有多个当前角色，只保留第一个
                print(f"  用户 {user.username} 有多个当前角色，修复中...")
                for role in current_roles[1:]:
                    role.is_current = False
        
        db.commit()
        print(f"\n✅ 迁移完成！")
        print(f"  迁移用户数: {migrated_count}")
        print(f"  跳过用户数: {skipped_count}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_user_roles()

