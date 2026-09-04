# 功能规范：dsh 插件安装命令修复

## 场景 1：Docker 构建时预装插件

**Given** Dockerfile 执行到插件预装步骤  
**And** `$TEMPLATE_DSH_HOME` = `/opt/dsh-home-template`  
**When** 执行 `DSH_HOME=$TEMPLATE_DSH_HOME dsh plugin --profile web add <plugin>`  
**Then** 插件应安装到 `/opt/dsh-home-template/profiles/web/node_modules/<plugin>`  
**And** 构建过程不因命令错误而失败

## 场景 2：运行时创建实例安装插件

**Given** 用户创建新实例  
**And** 实例的 `home_path` 已创建  
**When** 执行 `${bin} plugin --profile web add ${plugin}`（env 注入 `DSH_HOME=homePath`）  
**Then** 插件应安装到 `${homePath}/profiles/web/node_modules/${plugin}`  
**And** 安装超时时间为 120 秒

## 场景 3：运维脚本安装插件

**Given** 执行 `scripts/install-default-plugins.sh <home_path> <instance_id>`  
**When** 脚本遍历默认插件列表并执行安装  
**Then** 每条命令应为 `${DSH_BIN} plugin --profile web add "${plugin}"`  
**And** 安装失败时打印错误但继续安装下一个插件

## 场景 4：模板目录 profile 目录预创建

**Given** Dockerfile 执行到插件预装步骤  
**When** `/opt/dsh-home-template/profiles/web` 目录不存在  
**Then** 应预先创建该目录（`mkdir -p`）  
**And** 后续 `dsh plugin --profile web add` 不因目录缺失而失败
