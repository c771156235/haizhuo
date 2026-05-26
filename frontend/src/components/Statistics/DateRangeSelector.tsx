/**
 * 时间周期选择器组件
 */
import { Radio, DatePicker, Space } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'

const { RangePicker } = DatePicker

export type DateRangePreset = 'week' | 'month' | 'custom' | '' | null

interface DateRangeSelectorProps {
  preset?: DateRangePreset
  dateRange?: [Dayjs | null, Dayjs | null]
  onPresetChange?: (preset: DateRangePreset) => void
  onDateRangeChange?: (dates: [Dayjs | null, Dayjs | null] | null) => void
}

export const DateRangeSelector = ({
  preset = null,
  dateRange = [null, null],
  onPresetChange,
  onDateRangeChange,
}: DateRangeSelectorProps) => {
  // 将 null 转换为空字符串以兼容 Radio.Group
  const radioValue = preset === null ? '' : preset
  const handlePresetChange = (e: any) => {
    const value = e.target.value as DateRangePreset
    // 将空字符串转换为 null 以保持向后兼容
    const normalizedValue = value === '' ? null : value
    onPresetChange?.(normalizedValue)
    
    // 根据预设值自动设置日期范围
    if (value === 'week') {
      const endDate = dayjs()
      const startDate = endDate.subtract(7, 'day')
      onDateRangeChange?.([startDate, endDate])
    } else if (value === 'month') {
      const endDate = dayjs()
      const startDate = endDate.subtract(30, 'day')
      onDateRangeChange?.([startDate, endDate])
    } else if (value === 'custom') {
      // 自定义模式，不自动设置日期
    } else {
      // 空字符串或 null 表示全部，清空日期范围
      onDateRangeChange?.(null)
    }
  }

  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    onDateRangeChange?.(dates)
    // 如果选择了自定义日期，自动切换到custom模式
    if (dates && dates[0] && dates[1]) {
      onPresetChange?.('custom')
    }
  }

  return (
    <Space>
      <CalendarOutlined style={{ color: '#595959' }} />
      <Radio.Group
        value={radioValue}
        onChange={handlePresetChange}
        buttonStyle="solid"
      >
        <Radio.Button value="">全部</Radio.Button>
        <Radio.Button value="week">近一周</Radio.Button>
        <Radio.Button value="month">近一个月</Radio.Button>
        <Radio.Button value="custom">自定义</Radio.Button>
      </Radio.Group>
      {preset === 'custom' && (
        <RangePicker
          value={dateRange as [Dayjs, Dayjs]}
          onChange={handleRangeChange}
          format="YYYY-MM-DD"
          allowClear
        />
      )}
    </Space>
  )
}

