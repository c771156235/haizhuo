"""
日志配置模块
配置应用日志输出到文件和控制台
"""
import logging
import logging.handlers
import os
from pathlib import Path
from app.config import settings


def setup_logging():
    """
    配置应用日志
    
    日志配置：
    - 开发环境：DEBUG级别，输出到控制台和文件
    - 生产环境：INFO级别，输出到文件
    - 日志文件：logs/app.log（所有日志）、logs/error.log（仅错误）
    - 日志轮转：每天轮转，保留30天
    """
    # 创建日志目录
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # 日志文件路径
    app_log_file = log_dir / "app.log"
    error_log_file = log_dir / "error.log"
    
    # 日志格式
    log_format = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # 详细格式（包含文件名和行号）
    detailed_format = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # 获取根logger
    root_logger = logging.getLogger()
    
    # 清除现有的处理器（避免重复）
    root_logger.handlers.clear()
    
    # 设置日志级别
    if settings.DEBUG:
        root_logger.setLevel(logging.DEBUG)
    else:
        root_logger.setLevel(logging.INFO)
    
    # 1. 文件处理器 - 所有日志（带轮转）
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=app_log_file,
        when='midnight',  # 每天午夜轮转
        interval=1,  # 每1天
        backupCount=30,  # 保留30天
        encoding='utf-8',
        delay=False
    )
    file_handler.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    file_handler.setFormatter(detailed_format)
    root_logger.addHandler(file_handler)
    
    # 2. 错误文件处理器 - 仅错误和警告（带轮转）
    error_handler = logging.handlers.TimedRotatingFileHandler(
        filename=error_log_file,
        when='midnight',
        interval=1,
        backupCount=30,
        encoding='utf-8',
        delay=False
    )
    error_handler.setLevel(logging.WARNING)  # 只记录WARNING及以上级别
    error_handler.setFormatter(detailed_format)
    root_logger.addHandler(error_handler)
    
    # 3. 控制台处理器 - 开发环境输出到控制台
    if settings.DEBUG:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.DEBUG)
        console_handler.setFormatter(log_format)
        root_logger.addHandler(console_handler)
    
    # 配置第三方库的日志级别
    # SQLAlchemy日志（SQL查询日志）
    # 开发环境：SQL日志只写入文件，不输出到控制台
    # 生产环境：完全禁用SQL日志（WARNING级别）
    sqlalchemy_logger = logging.getLogger('sqlalchemy.engine')
    if settings.DEBUG:
        # 开发环境：SQL日志写入文件（DEBUG级别），控制台不输出
        sqlalchemy_logger.setLevel(logging.DEBUG)
        # 创建SQL日志文件处理器（单独的文件）
        sql_log_file = log_dir / "sql.log"
        sql_handler = logging.handlers.TimedRotatingFileHandler(
            filename=sql_log_file,
            when='midnight',
            interval=1,
            backupCount=7,  # SQL日志只保留7天
            encoding='utf-8',
            delay=False
        )
        sql_handler.setLevel(logging.DEBUG)
        sql_handler.setFormatter(detailed_format)
        sqlalchemy_logger.addHandler(sql_handler)
        # 确保SQL日志不输出到控制台
        sqlalchemy_logger.propagate = False
    else:
        # 生产环境：完全禁用SQL日志
        sqlalchemy_logger.setLevel(logging.WARNING)
    
    # SQLAlchemy其他模块的日志
    logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.dialects').setLevel(logging.WARNING)
    
    # uvicorn日志
    logging.getLogger('uvicorn').setLevel(logging.INFO)
    logging.getLogger('uvicorn.access').setLevel(
        logging.INFO if settings.DEBUG else logging.WARNING
    )
    
    # 记录日志配置完成
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("📝 日志配置已初始化")
    logger.info(f"   日志目录: {log_dir.absolute()}")
    logger.info(f"   应用日志: {app_log_file}")
    logger.info(f"   错误日志: {error_log_file}")
    if settings.DEBUG:
        logger.info(f"   SQL日志: {log_dir / 'sql.log'} (仅文件，不输出到控制台)")
    logger.info(f"   日志级别: {'DEBUG' if settings.DEBUG else 'INFO'}")
    logger.info(f"   日志轮转: 每天轮转，保留30天")
    logger.info(f"   SQL日志: {'启用（仅文件）' if settings.DEBUG else '禁用'}")
    logger.info("=" * 60)


def get_logger(name: str) -> logging.Logger:
    """
    获取指定名称的logger
    
    Args:
        name: logger名称（通常是模块名，如 __name__）
    
    Returns:
        Logger实例
    """
    return logging.getLogger(name)

