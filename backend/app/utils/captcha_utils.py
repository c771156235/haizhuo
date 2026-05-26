"""
验证码生成工具
"""
from PIL import Image, ImageDraw, ImageFont
import random
import io
import base64
import os


def generate_math_captcha():
    """
    生成算术验证码
    
    规则:
    - 操作数: 1-9 的单位数
    - 运算符: +, -, ×
    - 结果: 可以是两位数
    - 减法确保结果为正数
    
    返回:
        dict: {
            'image': 'data:image/png;base64,...',  # base64图片
            'answer': int,  # 正确答案
            'question': str  # 题目文字 (如: "2+3=?")
        }
    """
    # 1. 生成算式
    num1 = random.randint(1, 9)
    num2 = random.randint(1, 9)
    operator = random.choice(['+', '-', '×'])
    
    # 2. 计算答案
    if operator == '+':
        answer = num1 + num2
        text = f"{num1}+{num2}=?"
    elif operator == '-':
        # 确保结果为正数
        num1, num2 = max(num1, num2), min(num1, num2)
        answer = num1 - num2
        text = f"{num1}-{num2}=?"
    else:  # ×
        answer = num1 * num2
        text = f"{num1}×{num2}=?"
    
    # 3. 生成图片
    image_base64 = _generate_captcha_image(text)
    
    return {
        'image': f"data:image/png;base64,{image_base64}",
        'answer': answer,
        'question': text
    }


def _generate_captcha_image(text: str, width: int = 120, height: int = 40) -> str:
    """
    生成验证码图片
    
    Args:
        text: 验证码文字 (如: "2+3=?")
        width: 图片宽度
        height: 图片高度
    
    Returns:
        str: base64编码的图片
    """
    # 1. 创建图片 (浅灰色背景)
    bg_colors = [
        (240, 240, 240),
        (245, 245, 245),
        (235, 235, 240),
        (240, 235, 240),
    ]
    bg_color = random.choice(bg_colors)
    image = Image.new('RGB', (width, height), color=bg_color)
    draw = ImageDraw.Draw(image)
    
    # 2. 获取字体
    font = _get_font(size=28)
    
    # 3. 计算文字位置 (居中)
    # 使用 textbbox 获取文字边界框
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2 - 2
    
    # 4. 绘制文字 (深色)
    text_colors = [
        (40, 40, 40),
        (60, 60, 60),
        (30, 30, 30),
        (50, 50, 50),
    ]
    text_color = random.choice(text_colors)
    draw.text((x, y), text, fill=text_color, font=font)
    
    # 5. 添加干扰元素
    # 噪点
    for _ in range(30):
        x_noise = random.randint(0, width - 1)
        y_noise = random.randint(0, height - 1)
        noise_color = (
            random.randint(150, 200),
            random.randint(150, 200),
            random.randint(150, 200)
        )
        draw.point((x_noise, y_noise), fill=noise_color)
    
    # 干扰线
    for _ in range(2):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        line_color = (
            random.randint(180, 220),
            random.randint(180, 220),
            random.randint(180, 220)
        )
        draw.line([(x1, y1), (x2, y2)], fill=line_color, width=1)
    
    # 6. 转换为 base64
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return img_base64


def _get_font(size: int = 24):
    """
    获取字体
    优先使用项目内 backend/fonts 字体（与 PDF 导出一致，保证生产环境与本地一致），
    其次系统字体，最后才用 PIL 默认字体（默认字体很小，会导致生产环境验证码文字偏小）。
    """
    # 1. 优先使用项目内字体目录（部署时带上 backend/fonts 即可，生产与本地一致）
    _captcha_utils_dir = os.path.dirname(os.path.abspath(__file__))  # app/utils
    _app_dir = os.path.dirname(_captcha_utils_dir)                   # app
    _backend_dir = os.path.dirname(_app_dir)                          # backend
    project_font_dir = os.path.join(_backend_dir, 'fonts')
    if os.path.isdir(project_font_dir):
        for name in sorted(os.listdir(project_font_dir)):
            if name.lower().endswith(('.ttf', '.ttc', '.otf')):
                if any(x in name.lower() for x in ['bold', 'black', 'heavy', 'b.ttf', 'b.ttc']):
                    continue
                font_path = os.path.join(project_font_dir, name)
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    continue
        for name in sorted(os.listdir(project_font_dir)):
            if name.lower().endswith(('.ttf', '.ttc', '.otf')):
                font_path = os.path.join(project_font_dir, name)
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    continue

    # 2. 系统字体
    font_paths = [
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\Arial.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\calibri.ttf",
        "C:\\Windows\\Fonts\\Calibri.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue

    # 3. 最后才用默认字体（很小，生产环境尽量通过项目字体或系统字体避免）
    return ImageFont.load_default()
