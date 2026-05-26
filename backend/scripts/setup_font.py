#!/usr/bin/env python3
"""
字体设置辅助脚本 - 帮助快速设置项目内字体
"""
import os
import sys
import shutil
import platform

def get_font_source_paths():
    """获取可能的字体源路径"""
    system = platform.system()
    paths = []
    
    if system == 'Windows':
        windows_font_dir = "C:/Windows/Fonts"
        if os.path.exists(windows_font_dir):
            paths.extend([
                os.path.join(windows_font_dir, "simsun.ttc"),      # 宋体
                os.path.join(windows_font_dir, "msyh.ttc"),        # 微软雅黑
                os.path.join(windows_font_dir, "simhei.ttf"),      # 黑体
            ])
    elif system == 'Linux':
        linux_font_dirs = [
            '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
            '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
            '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        ]
        paths.extend([p for p in linux_font_dirs if os.path.exists(p)])
    
    return paths

def setup_font():
    """设置项目内字体"""
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(script_dir)
    fonts_dir = os.path.join(backend_dir, 'fonts')
    
    # 确保fonts目录存在
    os.makedirs(fonts_dir, exist_ok=True)
    
    print("=" * 60)
    print("项目内字体设置工具")
    print("=" * 60)
    print(f"字体目录: {fonts_dir}")
    print()
    
    # 检查是否已有字体文件
    existing_fonts = []
    for file in os.listdir(fonts_dir):
        if file.lower().endswith(('.ttf', '.ttc', '.otf')):
            existing_fonts.append(file)
    
    if existing_fonts:
        print(f"✅ 已找到 {len(existing_fonts)} 个字体文件:")
        for font in existing_fonts:
            font_path = os.path.join(fonts_dir, font)
            size = os.path.getsize(font_path) / (1024 * 1024)  # MB
            print(f"   - {font} ({size:.2f} MB)")
        print()
        response = input("是否要添加更多字体文件？(y/n): ").strip().lower()
        if response != 'y':
            print("✅ 字体设置完成！")
            return
    
    # 查找可用的字体源
    print("正在查找可用的字体文件...")
    source_paths = get_font_source_paths()
    
    if not source_paths:
        print("❌ 未找到系统字体文件")
        print()
        print("请手动将字体文件复制到以下目录:")
        print(f"   {fonts_dir}")
        print()
        print("支持的字体格式: .ttf, .ttc, .otf")
        print("推荐字体:")
        print("   - 宋体 (simsun.ttc)")
        print("   - 微软雅黑 (msyh.ttc)")
        print("   - 文泉驿微米黑 (wqy-microhei.ttc)")
        return
    
    print(f"✅ 找到 {len(source_paths)} 个可用的字体文件:")
    for i, path in enumerate(source_paths, 1):
        size = os.path.getsize(path) / (1024 * 1024)  # MB
        print(f"   {i}. {os.path.basename(path)} ({size:.2f} MB)")
    print()
    
    # 让用户选择
    if len(source_paths) == 1:
        selected_path = source_paths[0]
        print(f"自动选择: {os.path.basename(selected_path)}")
    else:
        try:
            choice = int(input(f"请选择要复制的字体文件 (1-{len(source_paths)}): "))
            if 1 <= choice <= len(source_paths):
                selected_path = source_paths[choice - 1]
            else:
                print("❌ 无效的选择")
                return
        except ValueError:
            print("❌ 请输入数字")
            return
    
    # 复制字体文件
    font_filename = os.path.basename(selected_path)
    dest_path = os.path.join(fonts_dir, font_filename)
    
    if os.path.exists(dest_path):
        print(f"⚠️  字体文件已存在: {font_filename}")
        response = input("是否覆盖？(y/n): ").strip().lower()
        if response != 'y':
            print("取消操作")
            return
    
    try:
        print(f"正在复制 {font_filename}...")
        shutil.copy2(selected_path, dest_path)
        size = os.path.getsize(dest_path) / (1024 * 1024)  # MB
        print(f"✅ 成功复制字体文件: {font_filename} ({size:.2f} MB)")
        print()
        print("=" * 60)
        print("✅ 字体设置完成！")
        print("=" * 60)
        print()
        print("下一步:")
        print("1. 重启应用服务")
        print("2. 查看应用日志，确认看到: ✅ 成功注册中文字体")
        print("3. 测试PDF导出功能")
        print()
        print("运行诊断脚本验证:")
        print(f"   python {os.path.join(script_dir, 'diagnose_font.py')}")
    except Exception as e:
        print(f"❌ 复制字体文件失败: {e}")
        print()
        print("请手动复制字体文件:")
        print(f"   源文件: {selected_path}")
        print(f"   目标目录: {fonts_dir}")

if __name__ == '__main__':
    try:
        setup_font()
    except KeyboardInterrupt:
        print("\n\n操作已取消")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        sys.exit(1)

