"""
任务相关的 Pydantic 模式
"""
import re
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime, date
from typing import Union
from app.models.task import TaskStatus


class TaskBase(BaseModel):
    """任务基础模式"""
    task_name: str
    sales_unit: str = Field(..., min_length=1, description="销售单位，不能为空")
    start_date: date
    end_date: date
    fde_count: int = Field(..., gt=0, description="FDE人数，必须大于0")
    
    @validator('sales_unit')
    def validate_sales_unit(cls, v):
        """验证销售单位不能为空"""
        if not v or not v.strip():
            raise ValueError('销售单位不能为空')
        return v.strip()
    
    @validator('fde_count')
    def validate_fde_count(cls, v):
        """验证FDE人数必须大于0"""
        if v <= 0:
            raise ValueError('FDE人数必须大于0')
        return v
    
    @validator('end_date')
    def validate_date_range(cls, v, values):
        """验证结束日期不能早于开始日期"""
        if 'start_date' in values and values['start_date']:
            if v < values['start_date']:
                raise ValueError('结束日期不能早于开始日期')
        return v


class TaskCreate(TaskBase):
    """创建任务模式（简略要求）"""
    pass


class TaskUpdate(TaskBase):
    """
    更新任务模式
    - 草稿状态：允许修改所有字段
    - 已确认及之后状态：允许修改销售单位和FDE人数
    """
    # 已确认及之后状态修改时，必须填写修改原因（在接口层做校验）
    modify_reason: Optional[str] = None


class TaskDetailUpdate(BaseModel):
    """详细需求单更新模式"""
    customer_unit: str
    industry_type: str
    customer_source: str
    requirement_content: str
    expected_visit_time: Optional[datetime] = None
    # 专项任务发起人创建的任务需要额外字段（可选，但API层面会根据任务发起人角色验证必填）
    customer_visit_address: Optional[str] = None
    customer_manager_name: Optional[str] = None
    customer_manager_contact: Optional[str] = None
    
    @validator('customer_manager_contact')
    def validate_customer_manager_contact(cls, v):
        """验证客户经理联系方式格式（支持手机号、固定电话、邮箱）"""
        if v is None:
            return v
        
        v = v.strip()
        if not v:
            return v
        
        # 手机号格式：11位数字，1开头，第二位3-9
        phone_pattern = re.compile(r'^1[3-9]\d{9}$')
        # 固定电话格式：区号-号码（如：010-12345678, 021-12345678）
        landline_pattern = re.compile(r'^0\d{2,3}-\d{7,8}$')
        # 邮箱格式
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        
        if phone_pattern.match(v) or landline_pattern.match(v) or email_pattern.match(v):
            return v
        
        raise ValueError('客户经理联系方式格式不正确，请输入有效的手机号、固定电话或邮箱')


class TaskConfirm(BaseModel):
    """任务确认模式"""
    confirmed: bool
    sales_contact_id: Optional[int] = None  # 已废弃：确认时不再需要指定，会自动根据销售单位匹配
    rejection_reason: Optional[str] = None


class TaskClose(BaseModel):
    """任务关闭模式"""
    close_reason: Optional[str] = None


class DetailRequirementDispatch(BaseModel):
    """详细需求派单模式"""
    team_leader_id: int


class TaskInDB(TaskBase):
    """数据库中的任务模式"""
    id: int
    customer_unit: Optional[str] = None
    industry_type: Optional[str] = None
    requirement_content: Optional[str] = None
    expected_visit_time: Optional[datetime] = None
    status: TaskStatus
    rejection_reason: Optional[str] = None
    initiator_id: int
    initiator_role: Optional[str] = None  # 任务创建时发起人使用的角色
    manager_id: Optional[int] = None
    sales_contact_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime] = None
    detail_submitted_at: Optional[datetime] = None
    is_task_initiator_created: Optional[bool] = None  # 是否由专项任务发起人创建
    
    class Config:
        from_attributes = True


class TaskResponse(TaskInDB):
    """任务响应模式"""
    pass


class TaskDetailRequirementCreate(BaseModel):
    """详细需求单创建模式"""
    customer_unit: str
    industry_type: str
    customer_source: Optional[str] = None
    requirement_content: str
    expected_visit_time: Optional[datetime] = None
    # 专项任务发起人创建的任务需要额外字段（可选，但API层面会根据任务发起人角色验证必填）
    customer_visit_address: Optional[str] = None
    customer_manager_name: Optional[str] = None
    customer_manager_contact: Optional[str] = None
    
    @validator('customer_manager_contact')
    def validate_customer_manager_contact(cls, v):
        """验证客户经理联系方式格式（支持手机号、固定电话、邮箱）"""
        if v is None:
            return v
        
        v = v.strip()
        if not v:
            return v
        
        # 手机号格式：11位数字，1开头，第二位3-9
        phone_pattern = re.compile(r'^1[3-9]\d{9}$')
        # 固定电话格式：区号-号码（如：010-12345678, 021-12345678）
        landline_pattern = re.compile(r'^0\d{2,3}-\d{7,8}$')
        # 邮箱格式
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        
        if phone_pattern.match(v) or landline_pattern.match(v) or email_pattern.match(v):
            return v
        
        raise ValueError('客户经理联系方式格式不正确，请输入有效的手机号、固定电话或邮箱')


class TaskDetailRequirementResponse(BaseModel):
    """详细需求单响应模式"""
    id: int
    task_id: int
    customer_unit: str
    industry_type: str
    customer_source: Optional[str] = None
    requirement_content: str
    expected_visit_time: Optional[datetime] = None
    # 专项任务发起人创建的任务需要额外字段
    customer_visit_address: Optional[str] = None
    customer_manager_name: Optional[str] = None
    customer_manager_contact: Optional[str] = None
    sales_contact_id: int
    sales_contact_name: Optional[str] = None  # 销售单位接口人姓名
    sales_contact_unit: Optional[str] = None  # 销售单位接口人所属销售单位
    created_at: datetime
    updated_at: datetime
    work_order_id: Optional[int] = None  # 关联的工单ID
    work_order_no: Optional[str] = None  # 工单编号
    is_dispatched: bool = False  # 是否已派单
    acceptor_id: Optional[int] = None  # 接单人ID（成员ID或组长ID）
    acceptor_name: Optional[str] = None  # 接单人姓名
    
    class Config:
        from_attributes = True


class BatchImportResponse(BaseModel):
    """批量导入响应模式"""
    success_count: int
    failed_count: int
    errors: List[str] = []
    imported_requirements: List[TaskDetailRequirementResponse] = []
