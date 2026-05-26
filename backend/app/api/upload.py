"""
文件上传 API
"""
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Security
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.api.deps import get_current_user
from app.config import settings

router = APIRouter(prefix="/upload", tags=["文件上传"])

# 可选的安全认证（用于头像访问）
security = HTTPBearer(auto_error=False)

# 确保上传目录存在
UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_DIR = UPLOAD_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/avatar", status_code=status.HTTP_201_CREATED)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """上传用户头像"""
    # 验证文件类型
    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型，仅支持: {', '.join(settings.ALLOWED_IMAGE_TYPES)}"
        )
    
    # 读取文件内容
    contents = await file.read()
    
    # 验证文件大小
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件大小超过限制（最大 {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB）"
        )
    
    # 生成唯一文件名
    file_ext = Path(file.filename).suffix or ".jpg"
    filename = f"{uuid.uuid4()}{file_ext}"
    file_path = AVATAR_DIR / filename
    
    # 保存文件
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # 删除旧头像（如果存在）
    if current_user.avatar:
        old_avatar_path = UPLOAD_DIR / current_user.avatar.lstrip("/")
        if old_avatar_path.exists() and old_avatar_path.is_file():
            try:
                old_avatar_path.unlink()
            except Exception:
                pass  # 忽略删除错误
    
    # 更新用户头像URL
    avatar_url = f"/api/upload/avatars/{filename}"
    current_user.avatar = avatar_url
    db.commit()
    db.refresh(current_user)
    
    return {
        "url": avatar_url,
        "message": "头像上传成功"
    }


@router.get("/avatars/{filename}")
async def get_avatar(
    filename: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db)
):
    """
    获取头像文件（公开访问，但添加了安全保护）
    
    安全措施：
    1. 防止路径遍历攻击
    2. 验证文件扩展名
    3. 确保文件路径在允许的目录内
    4. 文件名使用UUID，防止枚举攻击
    
    注意：头像文件使用UUID命名，即使公开访问也难以枚举。
    如果需要更严格的访问控制，可以添加鉴权检查。
    """
    # 防止路径遍历攻击：确保文件名不包含路径分隔符
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的文件名"
        )
    
    # 验证文件扩展名
    file_ext = Path(filename).suffix.lower()
    allowed_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"]
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的文件类型"
        )
    
    file_path = AVATAR_DIR / filename
    
    # 确保文件路径在允许的目录内（防止路径遍历）
    try:
        file_path.resolve().relative_to(AVATAR_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的文件路径"
        )
    
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="头像文件不存在")
    
    # 根据文件扩展名确定媒体类型
    media_type_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(file_ext, "image/jpeg")
    
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=31536000"}  # 缓存1年
    )

