/**
 * 导出服务
 */
import { API_ENDPOINTS, API_BASE_URL } from '../config/api'

/**
 * 下载文件
 */
const downloadFile = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export const exportService = {
  /**
   * 导出任务数据为Excel
   */
  exportTasksExcel: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_TASKS_EXCEL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `任务列表_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出工单数据为Excel
   */
  exportWorkOrdersExcel: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_WORK_ORDERS_EXCEL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `工单列表_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出商机数据为Excel
   */
  exportOpportunitiesExcel: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_OPPORTUNITIES_EXCEL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `商机列表_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出线索数据为Excel
   */
  exportLeadsExcel: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_LEADS_EXCEL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `线索列表_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出拜访日志数据为Excel
   */
  exportVisitLogsExcel: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_VISIT_LOGS_EXCEL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `拜访日志列表_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出任务数据为PDF
   */
  exportTasksPdf: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_TASKS_PDF}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `任务列表_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出工单数据为PDF
   */
  exportWorkOrdersPdf: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_WORK_ORDERS_PDF}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `工单列表_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出商机数据为PDF
   */
  exportOpportunitiesPdf: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_OPPORTUNITIES_PDF}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `商机列表_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出线索数据为PDF
   */
  exportLeadsPdf: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_LEADS_PDF}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `线索列表_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出拜访日志数据为PDF
   */
  exportVisitLogsPdf: async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.EXPORT_VISIT_LOGS_PDF}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `拜访日志列表_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出转订商机总金额统计为Excel
   */
  exportOpportunityConvertedAmountExcel: async (params?: {
    group_id?: number
    include_member_details?: boolean
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.include_member_details) queryParams.append('include_member_details', 'true')
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_OPPORTUNITY_CONVERTED_AMOUNT_EXCEL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `转订商机总金额统计_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出转订商机总金额统计为PDF
   */
  exportOpportunityConvertedAmountPdf: async (params?: {
    group_id?: number
    include_member_details?: boolean
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.include_member_details) queryParams.append('include_member_details', 'true')
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_OPPORTUNITY_CONVERTED_AMOUNT_PDF}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `转订商机总金额统计_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出时间段趋势统计为Excel
   */
  exportTimeRangeStatisticsExcel: async (params?: {
    start_date?: string
    end_date?: string
    group_by?: 'day' | 'week' | 'month'
    group_id?: number
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    if (params?.group_by) queryParams.append('group_by', params.group_by)
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_TIME_RANGE_EXCEL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `时间段趋势统计_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出时间段趋势统计为PDF
   */
  exportTimeRangeStatisticsPdf: async (params?: {
    start_date?: string
    end_date?: string
    group_by?: 'day' | 'week' | 'month'
    group_id?: number
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    if (params?.group_by) queryParams.append('group_by', params.group_by)
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_TIME_RANGE_PDF}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `时间段趋势统计_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出部门数据统计为Excel
   */
  exportSalesUnitStatisticsExcel: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_SALES_UNIT_EXCEL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `部门数据统计_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出部门数据统计为PDF
   */
  exportSalesUnitStatisticsPdf: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_SALES_UNIT_PDF}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `部门数据统计_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出销售单位绩效统计为Excel
   */
  exportSalesUnitPerformanceStatisticsExcel: async (params?: {
    group_id?: number
    include_member_details?: boolean
    dimension?: string
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.include_member_details) queryParams.append('include_member_details', 'true')
    if (params?.dimension) queryParams.append('dimension', params.dimension)
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_SALES_UNIT_PERFORMANCE_EXCEL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `销售单位绩效统计_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出销售单位绩效统计为PDF
   */
  exportSalesUnitPerformanceStatisticsPdf: async (params?: {
    group_id?: number
    include_member_details?: boolean
    dimension?: string
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.include_member_details) queryParams.append('include_member_details', 'true')
    if (params?.dimension) queryParams.append('dimension', params.dimension)
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_SALES_UNIT_PERFORMANCE_PDF}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `销售单位绩效统计_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出线索需求方向统计为Excel
   */
  exportRequirementDirectionStatisticsExcel: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_REQUIREMENT_DIRECTION_EXCEL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `线索需求方向统计_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出线索需求方向统计为PDF
   */
  exportRequirementDirectionStatisticsPdf: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_REQUIREMENT_DIRECTION_PDF}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `线索需求方向统计_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出成员工作量统计为Excel
   */
  exportMemberWorkloadExcel: async (params?: {
    limit?: number
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_MEMBER_WORKLOAD_EXCEL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `成员工作量统计_${new Date().getTime()}.xlsx`
    downloadFile(blob, decodeURIComponent(filename))
  },

  /**
   * 导出成员工作量统计为PDF
   */
  exportMemberWorkloadPdf: async (params?: {
    limit?: number
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.group_id) queryParams.append('group_id', params.group_id.toString())
    if (params?.start_date) queryParams.append('start_date', params.start_date)
    if (params?.end_date) queryParams.append('end_date', params.end_date)
    
    const url = `${API_BASE_URL}${API_ENDPOINTS.EXPORT_STATISTICS_MEMBER_WORKLOAD_PDF}${queryParams.toString() ? '?' + queryParams.toString() : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('导出失败')
    }
    
    const blob = await response.blob()
    const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `成员工作量统计_${new Date().getTime()}.pdf`
    downloadFile(blob, decodeURIComponent(filename))
  },
}

