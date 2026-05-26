# AI Store FDE支撑系统 - 系统架构图（Mermaid）

> 格式参考分层架构图，内容为本系统（工单管理与商机跟踪）实际模块，含横切关注点。

## 系统分层架构图

```mermaid
flowchart TB
    subgraph terminal["接入终端 Access Terminal"]
        pc["PC端 Web<br/>(React + TypeScript)"]
        mobile["移动端<br/>(响应式)"]
        other["其他接入方式<br/>(API Client)"]
    end

    subgraph api_layer["API 接口层 API Interface Layer"]
        rest["RESTful API<br/>(FastAPI)"]
        middleware["CORS / JWT 认证<br/>负载均衡(可选)"]
    end

    subgraph business["业务服务层 Business Service Layer"]
        user_center["用户中心"]
        task_center["任务中心"]
        work_order_center["工单中心"]
        opportunity_center["商机中心"]
        lead_center["线索中心"]
        visit_log["拜访日志"]
        review_mgr["评审管理"]
        notification_center["通知中心"]
        todo_center["待办中心"]
        statistics["统计分析"]
        export_mgr["数据导出"]
        audit_center["审计日志"]
        group_mgr["分组管理"]
        config_mgr["配置管理"]
        extend["基于 FastAPI 快速扩展<br/>的业务模块"]
    end

    subgraph basic["基础服务层 Basic Service Layer"]
        jwt["JWT 认证 / 安全"]
        workflow["工作流引擎"]
        notify_svc["通知服务"]
        excel_svc["Excel 服务"]
        upload_svc["文件上传"]
        sys_config["系统配置"]
        audit_log["审计日志"]
        utils["工具类 / 辅助功能"]
    end

    subgraph data_layer["数据层 Data Layer"]
        trans["事务管理"]
        orm["读写数据库<br/>(SQLAlchemy ORM)"]
        file_io["文件读写"]
        validation["数据验证<br/>(Pydantic)"]
    end

    subgraph database["数据库 Database"]
        mysql[("MySQL<br/>业务数据")]
        file_store[("文件存储<br/>头像 / 导出")]
    end

    subgraph runtime["运行环境 Runtime Environment"]
        cloud["云主机"]
        server["独立服务器"]
    end

    subgraph cross["横切关注点 Cross-Cutting"]
        logging["日志记录<br/>Log Recording"]
        permission["权限控制<br/>Permission RBAC"]
    end

    terminal --> api_layer
    api_layer --> business
    business --> basic
    basic --> data_layer
    data_layer --> database
    database --> runtime

    logging -.->|贯穿| api_layer
    logging -.->|贯穿| business
    logging -.->|贯穿| basic
    permission -.->|贯穿| api_layer
    permission -.->|贯穿| business
    permission -.->|贯穿| basic
```

## 简化版（无连线，仅分层）

若渲染环境对连线支持不佳，可使用下方仅分层、无横切连线的版本：

```mermaid
flowchart TB
    subgraph L1["接入终端"]
        direction LR
        A1[PC端 Web]
        A2[移动端]
        A3[其他接入]
    end

    subgraph L2["API 接口层"]
        direction LR
        B1[RESTful API]
        B2[负载均衡]
    end

    subgraph L3["业务服务层"]
        direction LR
        C1[用户中心]
        C2[任务中心]
        C3[工单中心]
        C4[商机中心]
        C5[线索中心]
        C6[拜访日志]
        C7[评审管理]
        C8[通知中心]
        C9[待办中心]
        C10[统计分析]
        C11[数据导出]
        C12[审计日志]
        C13[分组/配置管理]
    end

    subgraph L4["基础服务层"]
        direction LR
        D1[JWT认证]
        D2[工作流引擎]
        D3[通知服务]
        D4[Excel服务]
        D5[文件上传]
        D6[系统配置]
        D7[审计日志]
        D8[工具类]
    end

    subgraph L5["数据层"]
        direction LR
        E1[事务]
        E2[ORM读写]
        E3[文件读写]
        E4[数据验证]
    end

    subgraph L6["数据库"]
        direction LR
        F1[(MySQL)]
        F2[(文件存储)]
    end

    subgraph L7["运行环境"]
        direction LR
        G1[云主机]
        G2[独立服务器]
    end

    subgraph L8["横切关注点"]
        direction LR
        H1[日志记录]
        H2[权限控制]
    end

    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7
    L8
```

## 图例说明

| 层级 | 说明 |
|------|------|
| **接入终端** | PC 端为 React 单页应用，移动端为响应式 Web，支持其他 API 调用方。 |
| **API 接口层** | FastAPI 提供 RESTful API，CORS、JWT 认证及可选负载均衡。 |
| **业务服务层** | 用户、任务、工单、商机、线索、拜访日志、评审、通知、待办、统计、导出、审计、分组、配置及可扩展业务模块。 |
| **基础服务层** | 认证、工作流、通知、Excel、上传、配置、审计、工具等支撑能力。 |
| **数据层** | 事务、ORM 读写、文件读写、Pydantic 校验。 |
| **数据库** | MySQL 持久化业务数据，文件存储用于头像与导出文件。 |
| **运行环境** | 支持云主机或独立服务器部署。 |
| **横切关注点** | 日志记录、权限控制（RBAC）贯穿 API、业务、基础服务等层。 |

---

**系统名称**: AI Store FDE支撑系统  
**系统定位**: 工单管理与商机跟踪  
**文档版本**: v1.0.0
