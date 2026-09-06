# 王者演武堂文档

项目说明从根目录 [README](../README.md) 开始。本目录按用途分类，避免把任务书、产品说明和生产运维文档混在同一层。

## 产品

- [产品规格](product/spec.md)
- [使用手册](product/manual.md)
- [房间、比赛与分队规则](product/product-rules.md)

## 架构与设计

- [代码分层架构](architecture/code-architecture.md)：唯一权威代码边界
- [数据库概览](architecture/database.md)
- [界面设计说明](design/design-spec.md)
- [UI 系统](design/ui-system.md)
- [主题说明](design/themes/README.md)

## 运维

- [日常部署](operations/deploy.md)
- [维护者入口](operations/maintenance.md)
- [高级部署选项](operations/deploy-advanced.md)
- [Nginx 与 TLS](operations/nginx-configuration.md)
- [健康检查与告警](operations/observability.md)
- [发布与恢复边界](operations/recovery-and-release.md)
- [媒体备份与恢复](operations/media-operations.md)
- [依赖与 overrides](operations/dependencies.md)

配置模板位于同一目录：

- [主机清单示例](operations/deploy-host.example.json)
- [Nginx 站点模板](operations/nginx-site.conf.template)
- [Nginx 完整示例](operations/nginx.conf.example)

## 任务书与历史评审

- [开发任务书与路线图](roadmaps/)
- [代码评审与修复依据](reviews/)

这些文件用于保存需求来源与历史证据，不替代当前代码、数据库 migration 或上面的权威运维文档。
