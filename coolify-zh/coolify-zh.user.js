// ==UserScript==
// @name         Coolify 汉化 + 中英切换（自托管 v4）
// @namespace    https://github.com/sue1231511/zeabur-to-coolify
// @version      1.0.2
// @description  Coolify v4 控制台界面汉化，右下角悬浮按钮一键中/英切换。纯本地字典替换，不发起任何网络请求，不读取 cookie/token/环境变量的值，不修改任何用户数据。
// @author       小鱼干、晏安 (for 猫猫)
// @license      MIT
// ↓↓↓ 安装前把下面这行改成你自己的 Coolify 面板地址，只改域名部分，末尾的 /* 保留 ↓↓↓
// @match        https://coolify.example.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * 设计约束（为什么这样写）：
 * - Coolify v4 前端 = Laravel Blade + Livewire 3（内置 Alpine.js）+ Tailwind CSS 4。
 *   Livewire 用 morph 算法做增量 DOM 更新，页面跳转用 wire:navigate（SPA 式替换 body 内容）。
 * - 因此本脚本【只改文字节点 textContent】；属性只碰 placeholder / title / aria-label
 *   三个纯展示属性。绝不改 class、不增删元素、不碰 input/textarea 的值。
 *   就算 Livewire morph 把英文写回来，Observer 会再次翻译，最多一次抖动，不会死循环。
 * - 日志 / 终端 / 部署输出 / Monaco 编辑器（环境变量高级编辑）位于 pre、code、
 *   .coolify-monaco-editor、.font-mono、xterm canvas 中，全部在扫描时跳过。
 * - 每处改动都包 try-catch 并通过 log() 输出「位置 + 堆栈 + 关键变量」，空 catch 一律不写。
 *
 * v1.0.1 变更：
 * - MutationObserver 回调不再丢弃 records：增量处理新增/变化节点，
 *   全页扫描只留给启动、换页、切换语言三种情况。
 * - 日志上限 LOG_LIMIT 改为顶部常量，默认 100。
 *
 * v1.0.2 变更（适配 Coolify v4.5.0）：
 * - 修复：切回英文时中文不还原。原因是翻译函数开头的「不含英文字母就跳过」
 *   检查拦住了已经翻成中文的节点；现在这道检查只在中文模式下生效。
 * - 修复：输入框 / 文本框的 placeholder 从来没被翻译（属性函数把 INPUT、
 *   TEXTAREA、SELECT 一律跳过；全页扫描也只碰文字节点的父元素）。
 *   现在属性单独扫描，只排除编辑器 / 终端区域；依旧只读写 placeholder /
 *   title / aria-label，绝不碰 value。
 * - 修复：「Email」在三个分组里有两种译法，后者覆盖前者。改为按位置区分：
 *   链接 / 导航 / 标签页里是「邮件」，其余（表单、表头）是「邮箱」。
 * - 修复：页面把同一节点的英文换成另一段英文后，原文记录不更新，
 *   切英文时会还原成旧文字。现在每次翻译都刷新原文记录，且只在节点仍是
 *   本脚本写入的译文时才还原，页面自己改过的不动。
 * - 新增：属性找不到专属译文时借用正文词典（按钮悬停字和正文常常一样）。
 * - 新增：少量只用于属性的句式规则（PATTERNS），例如
 *   「More information about X」→「关于「X」的说明」，X 再查词典。
 *   只匹配整句、只用于 placeholder / title / aria-label，不碰正文。
 * - 新增：v4.5.0 新界面约 1100 条正文、约 120 条属性译文（v45* 分组）。
 *   「新建资源」页的服务模板目录（三百多个第三方服务介绍）有意不翻。
 * - 跳过区新增部署 / 运行日志查看器（.logs-viewer-viewport、.font-logs）。
 * - 悬浮按钮的图标改用 createElementNS 逐个建节点，全文件不再有任何把字符串当 HTML 解析的写法。
 * - 公开发布：@match 改成占位地址，安装前改成你自己的面板域名。
 *   不写 @updateURL / @downloadURL：不会自动从网上拉新版本，更新由你手动替换。
 */

(function () {
    'use strict';

    // =========================================================================
    // 〇、配置常量（集中放顶部，想调就改这里）
    // -------------------------------------------------------------------------
    // LOG_LIMIT   : log() 最多打印的报错条数，超过后不再打印（不影响功能，
    //               只是防止刷屏）。v1.0.1 起默认 100。
    // BTN_ID      : 右下角悬浮切换按钮的 DOM id
    // BTN_STYLE_ID: 按钮样式 <style> 的 DOM id
    // =========================================================================

    var LOG_LIMIT = 100;
    var BTN_ID = 'coolify-zh-toggle';
    var BTN_STYLE_ID = 'coolify-zh-style';

    // =========================================================================
    // 一、中英对照字典（按页面分组，方便以后补词）
    // -------------------------------------------------------------------------
    // 规则：
    // 1. key 是界面上「完全匹配」的英文（trim 后比较，大小写敏感）；
    // 2. 专有名词不翻：Coolify、Traefik、Docker、Dockerfile、Docker Compose、
    //    Nixpacks、Railpack、GitHub、GitLab、Gitea、Webhook、SSH、HTTPS、API、
    //    S3、Sentry、Let's Encrypt、Cloudflare、Cloud-Init、Doppler、Infisical、
    //    Vault、Swarm、Sentinel、Monaco、Authentik、Zitadel、Clerk 等；
    // 3. 示例值（如 /Dockerfile、3600、https://...）不是提示语，一律不翻。
    // =========================================================================

    var DICT = {

        // ---------- 全局通用（按钮 / 表头 / 高频词） ----------
        common: {
            'Save': '保存',
            'Save changes': '保存更改',
            'Cancel': '取消',
            'Delete': '删除',
            'Delete All': '全部删除',
            'Permanently delete': '彻底删除',
            'Remove': '移除',
            'Continue': '继续',
            'Back': '上一步',
            'Confirm': '确认',
            'Confirm Action': '确认操作',
            'Add': '添加',
            'Add manually': '手动添加',
            'Edit': '编辑',
            'Update': '更新',
            'Update now': '立即更新',
            'Refresh': '刷新',
            'Reload': '重新加载',
            'Reload page': '重新加载页面',
            'Clear': '清除',
            'Clear filters': '清除筛选',
            'Filter': '筛选',
            'Search': '搜索',
            'Reset': '重置',
            'Close': '关闭',
            'Done': '完成',
            'Open': '打开',
            'Use': '使用',
            'Set': '设置',
            'Apply': '应用',
            'Apply and restart': '应用并重启',
            'Send': '发送',
            'Send test': '发送测试',
            'Send test email': '发送测试邮件',
            'Test': '测试',
            'Test connection': '测试连接',
            'Deploy': '部署',
            'Restart': '重启',
            'Build Pack': '构建方式',
            'Health Check': '健康检查',
            'Check now': '立即检查',
            'Check again': '再次检查',
            'Validate': '验证',
            'Retry': '重试',
            'Recheck': '重新检查',
            'Generate': '生成',
            'Copy': '复制',
            'Download': '下载',
            'Upload': '上传',
            'View': '查看',
            'View logs': '查看日志',
            'View changes': '查看变更',
            'View docs': '查看文档',
            'Docs': '文档',
            'Documentation': '文档',
            'Configure': '配置',
            'Manage': '管理',
            'Rename': '重命名',
            'Change': '更改',
            'Change password': '更改密码',
            'Remove import': '移除导入',
            'Import': '导入',
            'Export': '导出',
            'Simulate': '模拟',
            'Detect': '检测',
            'Disable': '停用',
            'Enable': '启用',
            'Turn on': '开启',
            'Turn off': '关闭',
            'Keep': '保留',
            'Unlink': '取消关联',
            'Revoke': '吊销',
            'Transfer': '转移',
            'Skip setup': '跳过设置',
            'Upgrade now': '立即升级',
            'Try it': '试一试',
            'Go back': '返回',
            'Next': '下一步',
            'Prev': '上一步',
            'Load more': '加载更多',
            'Load all': '加载全部',
            'Dismiss': '忽略',
            'Accept and close': '接受并关闭',
            'Proceed anyway': '仍然继续',
            'Restart Proxy': '重启代理',
            'Stop Proxy': '停止代理',
            'Start Proxy': '启动代理',
            'Reload images': '重新加载镜像',
            'Refetch': '重新获取',
            'Fetch Latest': '拉取最新',
            // 表头 / 字段名
            'Name': '名称',
            'Description': '描述',
            'Status': '状态',
            'Type': '类型',
            'Actions': '操作',
            'Action': '操作',
            'Email': '邮箱',
            'Password': '密码',
            'Role': '角色',
            'Value': '值',
            'Key': '键',
            'Created': '创建时间',
            'Updated': '更新时间',
            'Modified': '修改时间',
            'Owner': '所有者',
            'Size': '大小',
            'Time': '时间',
            'Date': '日期',
            'Message': '消息',
            'Method': '方式',
            'Path': '路径',
            'Port': '端口',
            'Network': '网络',
            'Image': '镜像',
            'Container': '容器',
            'Containers': '容器',
            'Volume': '卷',
            'Source': '来源',
            'Target': '目标',
            'Field': '字段',
            'Contents': '内容',
            'Output': '输出',
            'Duration': '耗时',
            'Commit': '提交',
            'Commits': '提交',
            'Lines': '行数',
            'Display': '显示',
            'Group': '分组',
            'Perms': '权限',
            'Default': '默认',
            'All': '全部',
            'None': '无',
            'Selected': '已选择',
            'Current': '当前',
            'Current:': '当前：',
            'Example:': '示例：',
            'Warning': '警告',
            'Error': '错误',
            'Info': '信息',
            'Debug': '调试',
            'Important:': '重要：',
            'Note:': '注意：',
            'WARNING:': '警告：',
            'Optional': '可选',
            'Required': '必填',
            'Enabled': '已启用',
            'Disabled': '已停用',
            'Permanent': '永久',
            'Deprecated': '已弃用',
            'Loading...': '加载中…',
            'Downloading...': '下载中…',
            'Checking DNS...': '正在检查 DNS…',
            'Updated at': '更新于',
            'or': '或',
            'and': '和',
            'here': '这里',
            'documentation': '文档',
            'New': '新建',
            'Edit key': '编辑密钥',
            'New key': '新建密钥',
            'Create key': '创建密钥',
            'Copy public key': '复制公钥',
            'Your Password': '你的密码',
            'Enter your password': '输入密码',
            // 状态词（Docker / Coolify 通用）
            'Running': '运行中',
            'Stopped': '已停止',
            'Stopped (exit code': '已停止（退出码',
            'Exited': '已退出',
            'Restarting': '重启中',
            'Starting': '启动中',
            'Starting...': '正在启动…',
            'Degraded': '降级',
            'Inactive': '未激活',
            'Cancelled': '已取消',
            'Canceled': '已取消',
            'Unhealthy': '不健康',
            'Healthy': '健康',
            'Healthy (passing)': '健康（通过）',
            'Unreachable': '不可达',
            'Removing': '移除中',
            'Paused': '已暂停',
            'Queued': '排队中',
            'In progress': '进行中',
            'In Progress': '进行中',
            'Failed': '失败',
            'Success': '成功',
            'Finished': '已完成',
            'Offline': '离线',
            'Online': '在线',
            'Active': '活跃',
            'Pending': '等待中',
            'Connection': '连接',
            'Credentials': '凭证',
            'Backup': '备份',
            'Storage': '存储',
            'Certificate hidden': '证书已隐藏',
            'Changes pending': '有变更待应用',
            'Last used': '最后使用',
            'Last updated': '最后更新',
            'Expires': '过期时间',
            'Page width': '页面宽度',
            'Appearance': '外观',
            'Navigation': '导航',
            'Navigation items': '导航项',
            'List view': '列表视图',
            'Text view': '文本视图',
            'Press': '按',
            'Enter': 'Enter',
            'ESC': 'ESC',
            'Tab': 'Tab',
            'ctrl': 'ctrl',
            'to search everything.': '搜索全部内容。',
            'Try different keywords, or type': '换个关键词，或输入',
            'Try a different search.': '换个关键词试试。',
            'Try a different search or filter.': '换个关键词或筛选条件试试。',
            'No results found': '没有找到结果',
            'No matches found.': '没有匹配项。',
            'Nothing on this page': '本页暂无内容',
            'Feedback': '反馈',
            'Send feedback': '发送反馈',
            'What\'s New': '新特性',
            'What\'s new': '新特性',
            'Read the': '阅读',
            'Please': '请',
            'contact support': '联系支持',
            'contact us': '联系我们',
            'Need help?': '需要帮助？',
            'Coolify Docs': 'Coolify 文档',
            'Update available': '有可用更新',
            'Coolify is up to date.': 'Coolify 已是最新版本。',
            'No updates found': '没有发现更新',
            'Updating': '正在更新',
            'Reloading in': '将在',
            'Reload now': '立即刷新',
            'If the page does not reload automatically, reload it manually.': '如果页面没有自动刷新，请手动刷新。',
            'Cannot connect to real-time service': '无法连接实时服务',
            'Replies are sent to your account email.': '回复将发送到你账号的邮箱。'
        },

        // ---------- 侧边导航 ----------
        nav: {
            // 分组标题
            'Workspace': '工作区',
            'Infrastructure': '基础设施',
            'Manage': '管理',
            'Account': '账号',
            // 一级菜单
            'Dashboard': '仪表盘',
            'Projects': '项目',
            'Monitoring': '监控',
            'Analytics': '流量分析',
            'Metrics': '指标',
            'Terminal': '终端',
            'Servers': '服务器',
            'Integrations': '集成',
            'Shared Variables': '共享变量',
            'Team': '团队',
            'Teams': '团队',
            'Notifications': '通知',
            'Keys & Tokens': '密钥与令牌',
            'Subscription': '订阅',
            'Tags': '标签',
            'Settings': '设置',
            'Admin': '管理员',
            'Profile': '个人资料',
            'Canvas': '画布',
            // 二级菜单
            'General': '通用',
            'Members': '成员',
            'Audit log': '审计日志',
            'Admin View': '管理员视图',
            'Danger Zone': '危险操作区',
            'Sources': '代码来源',
            'Destinations': '部署目标',
            'Registries': '镜像仓库',
            'S3 Storage': 'S3 存储',
            'Overview': '概览',
            'Environments': '环境',
            'Private Keys': '私钥',
            'Cloud Tokens': '云令牌',
            'Integration Tokens': '集成令牌',
            'API Tokens': 'API 令牌',
            'Cloud-Init Scripts': 'Cloud-Init 脚本',
            'Advanced': '高级',
            'Updates': '更新',
            'Authentication': '登录认证',
            // 'Email' 不在这里：同一个词在导航里是「邮件」、在表单里是「邮箱」，
            // 见下方 CONTEXT_DICT（v1.0.2）。
            'Backup': '备份',
            'Log out': '退出登录',
            'Search resources': '搜索资源',
            // 资源侧栏分组（新版 UI）
            'Observe & troubleshoot': '观察与排障',
            'Automation': '自动化',
            'Operations': '运维操作',
            'Resource menu': '资源菜单',
            'Back to the main menu': '返回主菜单'
        },

        // ---------- 登录 / 注册 / 找回密码 ----------
        login: {
            'Log in': '登录',
            'Login': '登录',
            'Register': '注册',
            'Create account': '创建账号',
            'Create an account': '创建账号',
            'Back to login': '返回登录',
            'Forgot your password?': '忘记密码？',
            'Forgot password': '忘记密码',
            'Reset password': '重置密码',
            'Email Password': '邮箱密码',
            'Remember me': '记住我',
            'Already have an account?': '已经有账号了？',
            'New to Coolify?': '第一次用 Coolify？',
            'Not your account?': '这不是你的账号？',
            'Remember your password?': '想起来了？',
            'Or continue with': '或者用以下方式继续',
            'This first account becomes the root user.': '第一个注册的账号将成为 root 用户。',
            'Full instance access': '实例完全访问权限',
            'This is a secure area. Please confirm your password before continuing.': '这是安全区域。请先确认密码再继续。',
            'Didn\u2019t receive the email?': '没收到邮件？',
            "Didn't receive the email?": '没收到邮件？',
            'Check your spam folder or resend it.': '检查垃圾邮件文件夹，或重新发送。',
            'We sent a verification link to your email address. Open it to continue to Coolify.': '验证链接已发送到你的邮箱，打开它即可继续使用 Coolify。',
            'Resend verification email': '重发验证邮件',
            'Verify email': '验证邮箱',
            'Verify and continue': '验证并继续',
            'Enter the 6-digit code from your authenticator app.': '输入验证器 App 里的 6 位数字。',
            'Use an authenticator code': '使用验证器动态码',
            'Use a recovery code': '使用恢复代码',
            'Enter one of the recovery codes you saved when setting up two-factor authentication.': '输入设置两步验证时保存的恢复代码之一。',
            'Transactional email is not configured': '尚未配置邮件发送服务',
            'Configure email delivery or follow the': '请配置邮件发送服务，或参阅',
            'manual reset guide': '手动重置指南'
        },

        // ---------- 仪表盘 / 项目 ----------
        dashboard: {
            'Recent deployments': '最近的部署',
            'Running or queued right now': '正在运行或排队',
            'Started': '已启动',
            'Traffic analytics': '流量分析',
            'Team-wide request volume across servers with traffic analytics enabled': '已启用流量分析的服务器的团队请求总量',
            'Request traffic across every application and server, reported by Sentinel.': '由 Sentinel 上报的所有应用和服务器的请求流量。',
            'Open analytics': '打开流量分析',
            'New project': '新建项目',
            'New team': '新建团队',
            'New server': '新建服务器',
            'New private key': '新建私钥',
            'New source': '新建代码来源',
            'New destination': '新建部署目标',
            'New storage': '新建存储',
            'New S3 storage': '新建 S3 存储',
            'New GitHub app': '新建 GitHub App',
            'New resource': '新建资源',
            'New environment': '新建环境',
            'New tag': '新建标签',
            'New token': '新建令牌',
            'New file': '新建文件',
            'New folder': '新建文件夹',
            'Create project': '创建项目',
            'Create team': '创建团队',
            'Create environment': '创建环境',
            'Create tag': '创建标签',
            'Create token': '创建令牌',
            'Project details': '项目详情',
            'Project settings': '项目设置',
            'Environment details': '环境详情',
            'Team tag': '团队标签',
            'Icon': '图标',
            'Icon, name, and description shown across the dashboard.': '显示在仪表盘各处的图标、名称和描述。',
            'JPG, PNG, or WebP. Shown in the projects list.': '支持 JPG、PNG 或 WebP，显示在项目列表里。',
            'A production environment will be created automatically.': '会自动创建一个名为 production 的环境。',
            'Delete project': '删除项目',
            'Delete environment': '删除环境',
            'Delete team': '删除团队',
            'Clone to project': '克隆到项目',
            'Clone to environment': '克隆到环境',
            'Clone environment': '克隆环境',
            'Choose the server and Docker network that will receive the cloned resources.': '选择接收克隆资源的服务器和 Docker 网络。',
            'Empty the project before permanently deleting it.': '先清空项目内所有资源，再彻底删除项目。',
            'Remove every resource before permanently deleting this environment.': '先移除此环境内所有资源，再彻底删除环境。',
            'will be cloned.': '将被克隆。',
            'in this project': '在此项目中',
            'Using this tag': '使用此标签',
            'Applications & services': '应用与服务',
            'Active deployments': '进行中的部署',
            'Queued or running': '排队中或运行中',
            'No matching projects': '没有匹配的项目',
            'No matching environments': '没有匹配的环境',
            'No matching resources': '没有匹配的资源',
            'No matching tags': '没有匹配的标签',
            'No matching servers': '没有匹配的服务器',
            'No projects available': '没有可用的项目',
            'No environments available': '没有可用的环境',
            'No servers available': '没有可用的服务器',
            'No destinations available': '没有可用的部署目标',
            'No matching targets': '没有匹配的目标',
            'Clear filters': '清除筛选',
            'Clear filters ': '清除筛选'
        },

        // ---------- 资源详情：标签页（新旧版 UI 都收） ----------
        resourceTabs: {
            // 新版侧栏标签（main 分支）
            'Domains': '域名',
            'Swarm': 'Swarm',
            'Persistent Storage': '持久存储',
            'Backups': '备份',
            'Files': '文件',
            'Deployment Logs': '部署日志',
            'Runtime Logs': '运行日志',
            'Git Source': 'Git 代码来源',
            'Scheduled Tasks': '计划任务',
            'Preview Deployments': '预览部署',
            'Healthcheck': '健康检查',
            'Rollback': '回滚',
            'Resource Limits': '资源限制',
            'Resource Operations': '资源操作',
            // 旧版标签页（历史版本 v4.x）
            'Storages': '存储',
            'Logs': '日志',
            'Deployments': '部署',
            'Scheduled Tasks ': '计划任务',
            'Configuration': '配置',
            'Server': '服务器',
            'Proxy': '代理',
            'Service': '服务',
            'Services': '服务',
            'Application': '应用',
            'Applications': '应用',
            'Database': '数据库',
            'Databases': '数据库',
            'Database backup': '数据库备份',
            // 页面内小节
            'Application details': '应用详情',
            'Access': '访问',
            'Build & deploy': '构建与部署',
            'Build configuration': '构建配置',
            'Repository settings': '仓库设置',
            'Repository configuration': '仓库配置',
            'Build': '构建',
            'Deployment': '部署',
            'Git': 'Git',
            'Docker compose': 'Docker Compose',
            'HTTP request': 'HTTP 请求',
            'Command': '命令',
            'Timing and retries': '时机与重试',
            'Clone resource': '克隆资源',
            'Move resource': '移动资源',
            'Deploy webhook': '部署 Webhook',
            'Manual Git webhooks': '手动 Git Webhook',
            'URL template': 'URL 模板',
            'Manual preview': '手动预览',
            'GPU': 'GPU',
            'GPUs': 'GPU',
            'Configuration changes': '配置变更',
            'Deployment commands': '部署命令',
            'Git app': 'Git 应用',
            'Connected source': '已连接的代码来源',
            'Connect source': '连接代码来源',
            'Attached private key': '已绑定的私钥',
            'Internal access': '内网访问',
            'Internal hostname': '内网主机名',
            'Internal port': '内部端口',
            'Internal hostnames are only reachable by resources connected to this Docker network.': '内网主机名只有连接到同一 Docker 网络的资源才能访问。',
            'Links': '链接',
            'Labels': '标签（Labels）',
            'Previews': '预览',
            'Server analytics': '服务器流量分析',
            'Server metrics': '服务器指标',
            'Password hashing': '密码哈希',
            'Authentication': '登录认证',
            'Noindex': '禁止搜索引擎收录',
            'Add domain': '添加域名',
            'Add domains': '添加域名',
            'Domain settings': '域名设置',
            'Manage domains': '管理域名',
            'Generate domain': '生成域名',
            'Domain redirect': '域名跳转',
            'Protocol redirect': '协议跳转',
            'Redirect type': '跳转类型',
            'Redirect HTTP to HTTPS': 'HTTP 跳转到 HTTPS',
            'No redirects': '不跳转',
            'Add variable': '添加变量',
            'Add environment variable': '添加环境变量',
            'Update variable': '更新变量',
            'Loading environment variables': '正在加载环境变量',
            'Buildtime': '构建时',
            'Runtime': '运行时',
            'Literal': '字面量',
            'Multiline': '多行',
            'Lock': '锁定',
            'Use Compose default': '使用 Compose 默认值',
            'Used by Compose': '被 Compose 使用',
            'Connect to resources': '关联到资源',
            'Tip: Type': '提示：输入',
            'Storage Name': '存储名称',
            'Source Path': '来源路径',
            'Destination Path': '目标路径',
            'PR suffix': 'PR 后缀',
            'Add mount': '添加挂载',
            'Add volume mount': '添加卷挂载',
            'Add file mount': '添加文件挂载',
            'Add directory mount': '添加目录挂载',
            'Add host file mount': '添加主机文件挂载',
            'Docker volume': 'Docker 卷',
            'Volume mount': '卷挂载',
            'File mount': '文件挂载',
            'Directory mount': '目录挂载',
            'Host file mount': '主机文件挂载',
            'External volume': '外部卷',
            'Mount path': '挂载路径',
            'Back up now': '立即备份',
            'Add backup': '添加备份',
            'Enable backup': '启用备份',
            'Disable backup': '停用备份',
            'Add schedule': '添加计划',
            'Create schedule': '创建计划',
            'Delete schedule': '删除计划',
            'Schedules': '计划',
            'Schedule': '计划',
            'Executions': '执行记录',
            'Total executions': '总执行次数',
            'Last run': '上次执行',
            'Latest run': '最近执行',
            'Add task': '添加任务',
            'Execute now': '立即执行',
            'Runs on': '运行于',
            'Add tags': '添加标签',
            'Domain already in use': '域名已被占用',
            'Use a different port?': '使用其他端口？',
            'Use this port anyway': '仍然使用这个端口',
            'Check all DNS': '检查全部 DNS',
            'DNS status': 'DNS 状态',
            'DNS entries': 'DNS 记录',
            'Configure DNS': '配置 DNS',
            'Manual records': '手动记录',
            'Create DNS record': '创建 DNS 记录',
            'Check the logs on the server at': '查看服务器上的日志：',
            'Edit networking': '编辑网络',
            'Go to Container labels': '前往容器标签页',
            'Force Deploy': '强制部署',
            'Force Restart': '强制重启',
            'Force start': '强制启动',
            'Force Cleanup Containers': '强制清理容器',
            'Remove container': '移除容器',
            'Update Service': '更新服务',
            'Redeploy': '重新部署',
            'Redeploy (without cache)': '重新部署（不用缓存）',
            'Deploy preview': '部署预览',
            'Cancel deployment': '取消部署',
            'Rebuild': '重建',
            'Restart (pull latest)': '重启（拉取最新镜像）',
            'Restart current version': '重启当前版本',
            'Pull latest and restart': '拉取最新并重启',
            'Deploy (': '部署（',
            'Validate ': '验证 ',
            'Nothing to build. This application deploys a prebuilt Docker image.': '无需构建：此应用直接部署现成的 Docker 镜像。',
            'Log in': '登录',
            'Public access': '公开访问',
            'Make publicly available': '设为公开可访问',
            'Make private': '设为私有',
            'Make primary': '设为主用',
            'Make owner': '设为所有者',
            'Make admin': '设为管理员',
            'Make member': '设为成员',
            'You will lose the rolling update feature!': '你将失去滚动更新功能！',
            'PORT mismatch detected': '检测到 PORT 不一致',
            'PORT environment variable configured': '已配置 PORT 环境变量',
            'requests remaining': '剩余请求数',
            'prefix-timestamp': '前缀-时间戳',
            'Format:': '格式：',
            'Example usage:': '用法示例：',
            'Open preview': '打开预览',
            'Open pull request': '打开拉取请求',
            'Pull request': '拉取请求',
            'Load pull requests': '加载拉取请求',
            'Roll back to this image': '回滚到此镜像',
            'Refresh GPUs': '刷新 GPU 列表',
            'No NVIDIA GPU found (': '未找到 NVIDIA GPU（',
            'NVIDIA Container Toolkit not found. Containers cannot use these GPUs until you': '未找到 NVIDIA Container Toolkit，在安装它之前容器无法使用这些 GPU。',
            'Not checked yet. Refresh to find GPUs.': '还没有检测过，点刷新来查找 GPU。',
            'Loading logs': '正在加载日志',
            'No logs yet': '暂无日志',
            'No logs yet.': '暂无日志。',
            'Logs will appear here when the container produces output.': '容器产生输出后，日志会显示在这里。',
            'Copy logs': '复制日志',
            'Download logs': '下载日志',
            'Download all logs': '下载全部日志',
            'Download displayed logs': '下载当前显示的日志',
            'Find in logs': '在日志中查找',
            'Color by level': '按级别着色',
            'Timestamps': '时间戳',
            'Log levels': '日志级别',
            'Proxy Logs': '代理日志',
            'Proxy Startup Logs': '代理启动日志',
            'Database Restore Output': '数据库恢复输出',
            'Database Startup': '数据库启动日志',
            'Service Startup': '服务启动日志',
            'Stack Sub-Resources': 'Stack 子资源',
            'Terminal Not Available': '终端不可用',
            'Start a terminal session': '开始终端会话',
            'Choose a container to start a session': '选择一个容器来开始会话',
            'Choose a server or container': '选择服务器或容器',
            'No terminal targets': '没有可用的终端目标',
            'Container logs can contain secrets.': '容器日志可能包含敏感信息。',
            'The file content can contain secrets.': '文件内容可能包含敏感信息。',
            'The Docker Compose file can contain secrets.': 'Docker Compose 文件可能包含敏感信息。',
            'Copied and downloaded logs hide secrets. The live view shows the raw output.': '复制和下载的日志会隐去敏感信息；实时视图显示原始输出。',
            'missing required env vars': '缺少必需的环境变量',
            'must be set before this service can be deployed.': '必须先设置，服务才能部署。',
            'This service requires port': '此服务需要端口'
        },

        // ---------- 新建资源向导 / 初始化（boarding） ----------
        newResource: {
            'Choose repository': '选择仓库',
            'Choose the branch and build strategy for this application.': '为此应用选择分支和构建策略。',
            'Choose how Coolify builds and runs this repository.': '选择 Coolify 如何构建和运行这个仓库。',
            'Enter the repository location and choose how Coolify should build it.': '输入仓库地址，并选择 Coolify 的构建方式。',
            'Public Git repository': '公开 Git 仓库',
            'Private repository': '私有仓库',
            'Git Repository': 'Git 仓库',
            'Docker image': 'Docker 镜像',
            'Dockerfile': 'Dockerfile',
            'Docker Compose': 'Docker Compose',
            'Create application': '创建应用',
            'Create service': '创建服务',
            'Add database': '添加数据库',
            'Resource type': '资源类型',
            'Check repository': '检查仓库',
            'Load repository': '加载仓库',
            'Connect a public repository over HTTPS and inspect its default branch.': '通过 HTTPS 连接公开仓库并查看其默认分支。',
            'Create an application directly from a Dockerfile without connecting a Git repository.': '直接从 Dockerfile 创建应用，无需连接 Git 仓库。',
            'Create a multi-container service directly from a Compose file.': '直接从 Compose 文件创建多容器服务。',
            'Deploy an existing image from Docker Hub or another OCI registry.': '部署 Docker Hub 或其他 OCI 镜像仓库里的现有镜像。',
            'Select a private key': '选择私钥',
            'Choose the SSH key Coolify will use to clone this repository.': '选择 Coolify 克隆此仓库要用的 SSH 密钥。',
            'Choose GitHub App': '选择 GitHub App',
            'Choose GitLab App': '选择 GitLab App',
            'Choose Gitea App': '选择 Gitea App',
            'Select the installation that can access the repository you want to deploy.': '选择能访问你要部署的仓库的安装（Installation）。',
            'Search repositories available through the selected GitLab App.': '搜索所选 GitLab App 可访问的仓库。',
            'Search repositories available through the selected Gitea App.': '搜索所选 Gitea App 可访问的仓库。',
            'Connect a GitHub App before selecting a private repository.': '先连接 GitHub App，才能选择私有仓库。',
            'Connect a GitLab App before selecting a private repository.': '先连接 GitLab App，才能选择私有仓库。',
            'Connect a Gitea App before selecting a private repository.': '先连接 Gitea App，才能选择私有仓库。',
            'Coolify Examples': 'Coolify 示例',
            'Need a sample? Browse': '想要示例？去逛逛',
            'Smart Scan': '智能扫描',
            'Select project': '选择项目',
            'Select environment': '选择环境',
            'Select server': '选择服务器',
            'Select destination': '选择部署目标',
            'Choose a project…': '选择项目…',
            'Choose a server…': '选择服务器…',
            'Choose a destination…': '选择部署目标…',
            'Choose an environment…': '选择环境…',
            'Filter targets…': '筛选目标…',
            'Only build servers are available. Add or reconfigure a server before continuing.': '当前只有构建服务器可用。请先添加或重新配置服务器。',
            // 初始化引导
            'Welcome to Coolify': '欢迎使用 Coolify',
            'Connect your first server and start deploying in minutes.': '连接你的第一台服务器，几分钟内开始部署。',
            'Get started': '开始使用',
            'Create "My First Project"': '创建「我的第一个项目」',
            'Use this machine or connect a server you already manage.': '用这台机器，或连接你已有的服务器。',
            'This machine': '这台机器',
            'Deploy on the server running Coolify. Best for testing and single-server setups.': '部署在运行 Coolify 的服务器上，适合测试和单机环境。',
            'Or use existing': '或者使用现有的',
            'Connect an existing server over SSH.': '通过 SSH 连接已有服务器。',
            'Connect a server you already manage.': '连接你已有的服务器。',
            'Provide connection details for your remote server.': '填写远程服务器的连接信息。',
            'Validate Connection': '验证连接',
            'Validate Connection & Continue': '验证连接并继续',
            'Server validation': '服务器验证',
            'Start validation': '开始验证',
            'Validation complete': '验证完成',
            'Validation failed': '验证失败',
            'Server is not reachable': '服务器不可达',
            'Retry validation': '重试验证',
            'Install repositories': '安装仓库（Installations）',
            'Save SSH Key': '保存 SSH 密钥',
            'Generate new key': '生成新密钥',
            'Use existing key': '使用现有密钥',
            'Use selected key': '使用所选密钥',
            'Paste a private key you already manage.': '粘贴你已有的私钥。',
            'Create an ED25519 key pair in Coolify.': '在 Coolify 中创建 ED25519 密钥对。',
            'Add the public key to your server\u2019s': '把公钥添加到你服务器的',
            'Copy the public key above and add it to your server\u2019s': '复制上面的公钥，添加到你服务器的',
            'Deploy the public key to': '把公钥部署到',
            'Deploy your first resource': '部署你的第一个资源',
            'Select where to deploy your applications and databases. You can add more servers later.': '选择应用和数据库部署到哪里。之后可以随时加服务器。',
            'Use selected project': '使用所选项目',
            'Setup complete': '设置完成',
            'Your server is connected and ready. Start deploying your first resource.': '服务器已连接就绪，开始部署你的第一个资源吧。',
            'Go to dashboard': '前往仪表盘',
            'What\u2019s configured': '已完成的配置',
            "What's configured": '已完成的配置',
            'Installing prerequisites': '正在安装前置依赖',
            'Coolify will automatically install Docker + if not present.': '如果没装 Docker，Coolify 会自动安装。',
            'Action Required': '需要处理',
            'Non-root user is experimental:': '非 root 用户是实验性特性：',
            'If the connection details are correct, please ensure:': '如果连接信息无误，请检查：',
            'Configure SSH key-based authentication for secure server access.': '配置 SSH 密钥认证，安全访问服务器。',
            'Configure your SSH key for server authentication.': '配置用于服务器认证的 SSH 密钥。',
            'For more help, check this': '更多帮助，请看',
            'file for the specified user': '文件的指定用户',
            'on your target server for the specified user.': '（目标服务器上指定用户的该文件）。',
            'From the remote server, test': '在远程服务器上测试',
            'The correct public key is in your': '正确的公钥应在你服务器的',
            'Manual installation guide': '手动安装指南',
            'A private key is required.': '需要一个私钥。',
            'Coolify matched each hostname to a zone available through your connected DNS credentials.': 'Coolify 已把每个主机名匹配到你已连接 DNS 凭证下可用的 zone。'
        },

        // ---------- 服务器 ----------
        servers: {
            'Localhost': '本机（Localhost）',
            'Power On': '开机',
            'Validate & configure': '验证并配置',
            'General settings': '通用设置',
            'Docker Cleanup': 'Docker 清理',
            'Cloudflare Tunnels': 'Cloudflare Tunnel',
            'Security': '安全',
            'Server / proxy check': '服务器/代理检查',
            'CA Certificate': 'CA 证书',
            'Docker Registries': 'Docker 镜像仓库登录',
            'Swarm': 'Swarm',
            'Runners': 'Runner',
            'Log Drains': '日志收集',
            'Transfer': '转移',
            'Transfer server': '转移服务器',
            'Transfer to another instance': '转移到另一个实例',
            'Finish the transfer': '完成转移',
            'Finish the transfer on the target': '在目标实例上完成转移',
            'Finish the transfer on the current': '在当前实例上完成转移',
            'Open the server on the target': '在目标实例打开此服务器',
            'This removes the option to undo the transfer.': '此操作后无法再撤销转移。',
            'The Coolify host (localhost) cannot be transferred between instances.': 'Coolify 本机（localhost）无法在实例间转移。',
            'This server was transferred to': '此服务器已转移到',
            'Transfer back': '转移回来',
            'Transfer log': '转移日志',
            'Mark as done': '标记为已完成',
            'Validate token': '验证令牌',
            'Use this token': '使用此令牌',
            'Add destination': '添加部署目标',
            'Create destination': '创建部署目标',
            'Delete destination': '删除部署目标',
            'Docker network': 'Docker 网络',
            'Sentinel': 'Sentinel',
            'Enable Sentinel': '启用 Sentinel',
            'Disable Sentinel': '停用 Sentinel',
            'Sentinel is connected and reporting server health to this Coolify instance.': 'Sentinel 已连接，正在向此 Coolify 实例上报服务器健康状况。',
            'Sentinel is restarting.': 'Sentinel 正在重启。',
            'Sentinel started and is waiting for its first authenticated report.': 'Sentinel 已启动，正在等待第一次认证上报。',
            'Set a reachable Coolify URL before syncing Sentinel.': '先设置一个可访问的 Coolify URL，再同步 Sentinel。',
            'Sync Sentinel to recreate it on the Coolify Docker network.': '同步 Sentinel，让它在 Coolify Docker 网络里重建。',
            'View Sentinel': '查看 Sentinel',
            'Open Sentinel logs': '打开 Sentinel 日志',
            'Enable metrics': '启用指标',
            'Disable metrics': '停用指标',
            'Enable traffic analytics': '启用流量分析',
            'Enable management': '启用管理',
            'Enable runners': '启用 Runner',
            'Disable runners': '停用 Runner',
            'Install Sysbox': '安装 Sysbox',
            'Jobs get a private Docker daemon in an unprivileged container.': 'Job 会在无特权的容器里获得一个独立的 Docker 守护进程。',
            'Coolify checks if Sysbox is installed on this server.': 'Coolify 会检查这台服务器是否安装了 Sysbox。',
            'Multi-server login': '多服务器登录',
            'Change method': '更改方式',
            'Check connection': '检查连接',
            'Scan networks': '扫描网络',
            'Regenerate token': '重新生成令牌',
            'Update on GitHub': '去 GitHub 更新',
            'Open App permissions': '打开 App 权限页',
            'Google Cloud Logging': 'Google Cloud Logging',
            'aws': 'AWS',
            'aws (': 'AWS（',
            'Sending logs to': '日志发送到',
            'Resend code': '重发验证码',
            'Send code': '发送验证码',
            'Provider': '云服务商',
            'Link provider': '关联云服务商',
            'Purchase and provision a new VPS.': '购买并开通新的 VPS。',
            'Provision a new Droplet.': '开通新的 Droplet。',
            'Provision from Hetzner Cloud.': '从 Hetzner Cloud 开通。',
            'Provision from Vultr Cloud.': '从 Vultr Cloud 开通。',
            'Hetzner Cloud': 'Hetzner Cloud',
            'Vultr Cloud': 'Vultr Cloud',
            'Manage the VPS and billing in hPanel.': '在 hPanel 管理 VPS 和账单。',
            'cancel the VPS in hPanel': '在 hPanel 取消 VPS',
            'Hostinger deletes a VPS only at the end of its paid period.': 'Hostinger 的 VPS 只在付费期结束后才会删除。',
            'Last error:': '上次错误：',
            'Executable': '可执行文件',
            'Execution output': '执行输出',
            'Used by': '被使用于',
            'Tag': '标签',
            'Search by server IP': '按服务器 IP 搜索',
            'Search ID': '搜索 ID',
            'System status': '系统状态',
            'Reload': '重新加载',
            'Traefik': 'Traefik',
            'Traefik Dashboard': 'Traefik 仪表盘',
            'Switch proxy': '切换代理',
            'Refresh Proxy Status': '刷新代理状态',
            'Learn how to update Traefik.': '了解如何更新 Traefik。',
            'acme.json backups': 'acme.json 备份',
            'Restart the proxy to apply TLS certificate changes.': '重启代理以应用 TLS 证书变更。',
            'Your configuration changed, please restart the proxy.': '配置已变更，请重启代理。',
            'Reset password': '重置密码',
            'Automatic security updates': '自动安全更新',
            'Check for updates': '检查更新',
            'Updating packages': '正在更新软件包',
            'New version': '新版本',
            'Patches': '补丁',
            'Package': '软件包',
            'Scheduled maintenance': '计划维护',
            'Select an operating system': '选择操作系统',
            'Type the server name in the confirmation dialog to continue.': '在确认弹窗里输入服务器名以继续。',
            'No applications are deployed on this server yet.': '这台服务器上还没有部署任何应用。',
            'Servers online': '在线服务器',
            'Server Timing': '服务器耗时',
            'Toggle Server Timing HUD': '开关服务器耗时悬浮层',
            'Proxy': '代理',
            'All supported proxies:': '支持的所有代理：',
            'Active proxy only:': '仅当前代理：',
            'Resolver': 'Resolver',
            'Alternative names': '备用名称',
            'Dynamic Configurations': '动态配置',
            'The proxy uses the': '此代理使用',
            'Traefik and Caddy labels are both generated, so switching the proxy keeps routing working.': 'Traefik 和 Caddy 的标签都会生成，所以切换代理后路由仍然有效。',
            'Configure and operate the proxy outside Coolify.': '在 Coolify 之外自行配置和管理代理。',
            'NONE': '无',
            'None (manual proxy)': '无（手动代理）'
        },

        // ---------- 代码来源 / 部署目标 / 镜像仓库 / S3 ----------
        sources: {
            'Connect to GitLab': '连接 GitLab',
            'Connect to Gitea': '连接 Gitea',
            'Register with GitHub': '注册 GitHub App',
            'GitHub App': 'GitHub App',
            'GitLab App': 'GitLab App',
            'Gitea App': 'Gitea App',
            'Self-hosted / Enterprise GitHub': '自托管 / 企业版 GitHub',
            'Self-hosted GitLab': '自托管 GitLab',
            'Self-hosted Gitea': '自托管 Gitea',
            'GitHub (': 'GitHub（',
            'Repositories': '仓库',
            'Refetch': '重新获取',
            'Sync name': '同步名称',
            'Use this App for': '此 App 用于',
            'Use team-specific GitHub Apps when you need repository isolation between teams.': '需要在团队之间隔离仓库时，使用团队专属的 GitHub App。',
            'Mandatory permissions': '必需权限',
            'Register the GitHub App before using this source.': '先注册 GitHub App 才能使用此代码来源。',
            'Finish registering this GitHub App before using it as a source': '先完成 GitHub App 注册，才能用作代码来源',
            'Finish connecting this GitLab App before using it as a source': '先完成 GitLab App 连接，才能用作代码来源',
            'Finish connecting this Gitea App before using it as a source': '先完成 Gitea App 连接，才能用作代码来源',
            'Contact a team administrator if this GitHub App must be deleted.': '如需删除此 GitHub App，请联系团队管理员。',
            'from Coolify. Applications using this source will need another Git provider configured.': '。使用此来源的应用需要另配 Git 提供方。',
            'Redirect URI': '回调地址（Redirect URI）',
            'Confidential client': '机密客户端',
            'Confidential': '机密',
            'Enable scopes:': '启用权限范围：',
            'Create Private Key': '创建私钥',
            'New private key': '新建私钥',
            'Delete unused keys': '删除未使用的密钥',
            'Delete unused': '删除未使用',
            'Private keys are encrypted at rest in Coolify\u2019s database.': '私钥在 Coolify 数据库中加密存储。',
            "Private keys are encrypted at rest in Coolify's database.": '私钥在 Coolify 数据库中加密存储。',
            'A private key is required.': '需要一个私钥。',
            'You need to create a private key before you can create a server.': '需要先创建私钥，才能创建服务器。',
            'Delete Team': '删除团队',
            'Permanently delete your account from Coolify. This action cannot be undone.': '将从 Coolify 彻底删除你的账号，此操作无法撤销。',
            'Before you can delete your account:': '删除账号之前：',
            'Destructive actions for your account cannot be undone.': '针对你账号的危险操作无法撤销。',
            'Delete account': '删除账号',
            'Danger zone': '危险操作区',
            'Add and test an S3-compatible storage under Storages before selecting it here.': '先在「S3 存储」页添加并测试 S3 兼容存储，再来这里选择。'
        },

        // ---------- 设置 ----------
        settings: {
            'Instance Settings': '实例设置',
            'Configure global settings for this Coolify instance.': '配置此 Coolify 实例的全局设置。',
            'Instance': '实例',
            'Updates': '更新',
            'Advanced': '高级',
            'Authentication': '登录认证',
            'Auto DNS': '自动 DNS',
            'Ok': '好的',
            'Auto update': '自动更新',
            'Wide': '宽',
            'Content width': '内容宽度',
            'Color theme': '配色主题',
            'Dark': '深色',
            'Light': '浅色',
            'System': '跟随系统',
            'Custom': '自定义',
            'Pick a color': '挑个颜色',
            'Custom color': '自定义颜色',
            'Choose the color scheme used in this browser.': '选择此浏览器使用的配色。',
            'Choose how content uses the available browser width.': '选择内容如何利用浏览器宽度。',
            'Choose how the main sidebar shows its items.': '选择主侧栏如何展示菜单项。',
            'Choose how the top bar and sidebars sit on the page.': '选择顶栏和侧栏在页面上的布局。',
            'Navigation style': '导航样式',
            'Show sponsorship reminder': '显示赞助提醒',
            'Love Coolify? Support our work.': '喜欢 Coolify？支持一下我们吧。',
            'Maybe next time': '下次一定',
            'Sponsor us': '赞助我们',
            'GitHub Sponsors': 'GitHub Sponsors',
            'Open Collective': 'Open Collective',
            'Coolify is profitable thanks to': 'Coolify 能自我维持，多亏了',
            'through Coolify\u2019s affiliate link.': '通过 Coolify 的推广链接。',
            "through Coolify's affiliate link.": '通过 Coolify 的推广链接。',
            'through Coolify\u2019s referral link.': '通过 Coolify 的推荐链接。',
            'Product updates, fixes, and improvements.': '产品更新、修复与改进。',
            'There are no product updates available yet.': '目前没有可用的产品更新。',
            'Developer tools': '开发者工具',
            'Tell us what you need': '告诉我们你想要什么',
            'Restrict the allowlist before using API access on a public production instance.': '在公网生产实例上启用 API 前，先收紧白名单。',
            'SSL certificates might not work correctly.': 'SSL 证书可能无法正常工作。',
            'SSL certificates might not work correctly': 'SSL 证书可能无法正常工作',
            'SSL configuration': 'SSL 配置',
            'You may not be able to access the Coolify dashboard properly.': '你可能无法正常访问 Coolify 控制台。',
            'The Coolify instance domain will conflict with existing resources.': 'Coolify 实例域名会与现有资源冲突。',
            'Routing behavior will be unpredictable.': '路由行为会不可预测。',
            'The routing behavior will be unpredictable': '路由行为会不可预测',
            'You can also set an internal port per domain on': '也可以在下面按域名单独设置内部端口：',
            'Only one resource will be accessible at this domain': '此域名只能被一个资源使用',
            'Only one service will be accessible at this domain': '此域名只能被一个服务使用',
            'The latest configuration has not been applied': '最新配置尚未应用',
            'to secure the dashboard with HTTPS.': '来给控制台加上 HTTPS。',
            'to match the URL you use to access Coolify.': '，与访问 Coolify 用的 URL 保持一致。',
            'Set your domain in': '请在下面设置你的域名：',
            'Settings &rarr; FQDN': '设置 → FQDN',
            'Automated Cloudflare DNS (Domain Connect) stays hidden until a private key is set.': '设置私钥后，才会显示自动 Cloudflare DNS（Domain Connect）。',
            'If you can still access Coolify via': '如果你仍能通过以下地址访问 Coolify：',
            'for your Coolify domain, as these can interrupt login sessions.': '（针对 Coolify 域名），否则可能中断登录会话。'
        },

        // ---------- 团队 ----------
        team: {
            'Members': '成员',
            'Invitation link': '邀请链接',
            'Generate link': '生成链接',
            'Review invitation': '查看邀请',
            'You have been invited to collaborate on Coolify.': '有人邀请你协作使用 Coolify。',
            'You are already a member of this team. Dismiss the invitation to continue.': '你已经是这个团队的成员。请忽略邀请以继续。',
            'You': '你',
            'Activity': '活动记录',
            'Actor': '操作者',
            'Remove member': '移除成员',
            'New value': '新值',
            'Previous value': '旧值',
            'Only team owners can delete this team.': '只有团队所有者能删除团队。',
            'The default team cannot be deleted.': '默认团队无法删除。',
            'Your last or personal team cannot be deleted.': '最后一个团队或个人团队无法删除。',
            'This team still owns:': '此团队还拥有以下资源：',
            'Remove or move these resources before deleting the team.': '删除团队前，请先移除或转移这些资源。',
            'before deleting this team.': '之后才能删除此团队。',
            'from Coolify. This action cannot be undone.': '。此操作无法撤销。',
            'Configure transactional email in instance settings to send invitations directly.': '在实例设置里配置邮件服务后即可直接发送邀请。',
            'Two-factor authentication is': '所有成员的两步验证状态：',
            'All members have two-factor authentication enabled.': '所有成员都已启用两步验证。',
            'Two-factor authentication': '两步验证',
            'Configure 2FA': '配置两步验证',
            'Disable 2FA': '停用两步验证',
            'Validate 2FA': '验证两步验证',
            'Add a time-based one-time password to protect your account.': '为账号添加基于时间的一次性密码保护。',
            'Scan the QR code, then enter the current code from your authenticator.': '扫描二维码，然后输入验证器当前显示的动态码。',
            'Regenerate recovery codes': '重新生成恢复代码',
            'Add passkey': '添加通行密钥',
            'Create passkey': '创建通行密钥',
            'Passkeys': '通行密钥',
            'Passkeys need HTTPS on the instance domain, or': '通行密钥需要实例域名启用 HTTPS，或',
            'Your avatar, display name, and verified sign-in address.': '你的头像、显示名称和已验证的登录邮箱。',
            'Profile details': '个人资料',
            'Changing your password signs out every active session.': '更改密码会让你所有已登录的会话下线。',
            'Something went wrong. Please review the fields and try again.': '出了点问题，请检查表单后重试。',
            'Delete or move every attached resource before deleting this destination.': '删除此部署目标前，请先删除或转移其上所有资源。',
            'from Coolify. The Docker network is also removed from the server.': '。服务器上的 Docker 网络也会一并删除。',
            'This value will not be shown again after you leave this page.': '离开此页面后，这个值不会再显示。'
        },

        // ---------- 通知 ----------
        notifications: {
            // 'Email' 见 CONTEXT_DICT（v1.0.2）
            'Discord': 'Discord',
            'Telegram': 'Telegram',
            'Slack': 'Slack',
            'Pushover': 'Pushover',
            'Webhook': 'Webhook',
            'Enable one or more events above to assign forum topic IDs.': '先在上面启用至少一个事件，才能填论坛 Topic ID。',
            'Topic ID': 'Topic ID',
            'Mark read': '标记已读',
            'Mark all read': '全部标为已读',
            'Open notifications': '打开通知',
            'Configure how your team receives deployment and system alerts.': '配置团队接收部署和系统告警的方式。',
            'No notifications enabled': '尚未启用任何通知',
            'Copy from instance settings': '从实例设置复制',
            'Test channel': '测试频道',
            'Send email': '发送邮件'
        },

        // ---------- 确认弹窗（modal-confirmation） ----------
        modal: {
            'Are you sure?': '确定要执行吗？',
            'Confirm Deletion': '确认删除',
            'Please confirm the execution of the actions by entering the Name below': '请在下方输入名称，确认执行这些操作',
            'This operation is permanent and cannot be undone. Please think again before proceeding!': '此操作是永久性的、无法撤销！请三思后再继续！',
            'The following actions will be performed:': '将执行以下操作：',
            'Confirm actions': '确认操作',
            'Final Confirmation': '最终确认',
            'Please enter your password to confirm this destructive action.': '请输入密码，确认此危险操作。',
            'Password is required.': '需要输入密码。',
            'This will:': '此操作将：',
            // 应用页顶部 Stop / 移除容器确认弹窗（heading.blade.php）
            'Stop': '停止',
            'Start': '启动',
            'Confirm Container Removal?': '确认移除容器？',
            'Confirm Application Stopping?': '确认停止应用？',
            'This application will be stopped.': '此应用将被停止。',
            'All non-persistent data of this application will be deleted.': '此应用的所有非持久化数据将被删除。',
            'The exited application container will be removed.': '已退出的应用容器将被移除。',
            'Anonymous volumes may become eligible for Docker cleanup.': '匿名卷之后可能会被 Docker 清理掉。',
            'Retry deployment': '重试部署',
            'Retry deployment (without cache)': '重试部署（不用缓存）',
            'Deploy (without cache)': '部署（不用缓存）',
            'This permanently deletes': '此操作会永久删除',
            'inside the container. This cannot be undone.': '（容器内）。此操作无法撤销。',
            'WARNING. You could corrupt your data. Only do it if you know what you are doing.': '警告：可能损坏数据。除非你清楚自己在做什么，否则不要操作。',
            'Existing objects can cause the import to fail unless replacement is enabled.': '若不开启替换，已存在的对象会导致导入失败。',
            'You can select which backup archives to remove.': '你可以选择要删除哪些备份归档。',
            'The task stops running and cannot be restored.': '任务会停止运行，且无法恢复。',
            'You will lose the rolling update feature!': '你将失去滚动更新功能！',
            'The running resource will not be changed.': '正在运行的资源不会被改动。',
            'All configuration will move with the resource.': '所有配置会随资源一起转移。'
        },

        // ---------- 云端 / 订阅（自托管也可能看到） ----------
        billing: {
            'Calculate Price': '计算价格',
            'Base price': '基础价格',
            'Due now': '应付金额',
            'Monthly': '按月',
            'Yearly': '按年',
            'per month': '每月',
            'month': '个月',
            'Paid servers': '付费服务器',
            'Active servers:': '活跃服务器：',
            'Update Server Limit': '更新服务器上限',
            'Adjust server limit': '调整服务器上限',
            'Reducing below your active server count will deactivate excess servers.': '上限降到活跃服务器数以下时，多出的服务器会被停用。',
            'Prorated charge': '按比例计费',
            'Charged immediately to your payment method.': '立即从你的付款方式扣款。',
            'Keep access until the end of your billing period, or cancel immediately.': '保留到账期结束，或立即取消。',
            'Your subscription is set to cancel at the end of the billing period.': '你的订阅将在当前账期结束时取消。',
            'Cancel subscription': '取消订阅',
            'Resume Subscription': '恢复订阅',
            'Refund': '退款',
            'Total /': '总计 /',
            'paid': '已支付',
            'billing': '账单',
            'subscription': '订阅',
            'Subscription Error.': '订阅出错。',
            'Choose a plan to continue using Coolify Cloud.': '选择一个套餐继续使用 Coolify Cloud。',
            'Open billing portal': '打开账单中心',
            'Update the payment method or settle the outstanding invoice in the billing portal.': '在账单中心更新付款方式或结清账单。',
            'Contact us.': '联系我们。'
        },

        // ---------- 共享变量 / 密钥管理器 ----------
        sharedVars: {
            'Shared variables': '共享变量',
            'Reusable environment variables across resources': '跨资源复用的环境变量',
            'Scope': '作用范围',
            'Sort': '排序',
            'Alphabetical': '按字母',
            'Creation order': '按创建顺序',
            'Most used': '按使用频率',
            'Recently changed': '最近修改',
            'Not used': '未被使用',
            'Every shared variable is in use.': '所有共享变量都在使用中。',
            'No shared variables yet.': '还没有共享变量。',
            'No resource uses a shared variable yet.': '还没有资源使用共享变量。',
            'Add as variable': '添加为变量',
            'Import all keys': '导入全部密钥',
            'No keys match the search.': '没有匹配的密钥。',
            'No matching keys in the secret manager.': '密钥管理器里没有匹配的密钥。',
            'No secrets found at this source.': '此代码来源没有找到密钥。',
            'No shared variables found in': '没有在以下位置找到共享变量：',
            'Inline comments with space before # (e.g.,': '行内注释需在 # 前留空格（例如：'
        },

        // ---------- 杂项：云厂商 / 错误页 / 邮件等 ----------
        misc: {
            'Loading containers': '正在加载容器',
            'Showing': '正在显示',
            'of': '共',
            'Simulate': '模拟',
            'OK or done': '完成或确认',
            'healthy': '健康',
            'offline': '离线',
            'attention': '需要注意',
            'hottest,': '最热门，',
            'Up to date': '已是最新',
            'Provision a server': '开通服务器',
            'Add a server': '添加服务器',
            'Buy and create': '购买并创建',
            'Select an image': '选择镜像',
            'Select a token': '选择令牌',
            'Select a region': '选择区域',
            'Select a plan': '选择套餐',
            'Select S3 storages': '选择 S3 存储',
            'Paste the provider token': '粘贴云服务商令牌',
            'Optional note': '备注（可选）',
            'Accept': '接受',
            'Upgrade': '升级',
            'Contact support': '联系支持',
            'Technical details': '技术细节',
            'Migrate resource': '迁移资源',
            'Clone environment ': '克隆环境',
            'If something goes wrong, check the': '如果出问题，请查看',
            'or the logs on the server at': '，或服务器上的日志：',
            'or get help on': '，或到以下地址求助：',
            'View servers': '查看服务器',
            'Existing resources': '现有资源',
            'Set up on': '设置于',
            'Open onboarding': '打开引导',
            'To create a resource': '要创建资源',
            'to create a resource.': '即可创建资源。',
            'to get started.': '即可开始。',
            'and review recent connection or push errors.': '，并查看最近的连接或推送错误。',
            'Required Cloudflare permissions': '需要的 Cloudflare 权限',
            'Zone - DNS - Edit': 'Zone - DNS - Edit',
            'Zone - Zone - Read': 'Zone - Zone - Read',
            'Account - Cloudflare Tunnel - Edit': 'Account - Cloudflare Tunnel - Edit',
            'Create a replacement token in Cloudflare': '在 Cloudflare 创建替换令牌',
            'Create token at Cloudflare': '在 Cloudflare 创建令牌',
            'Add Cloudflare token': '添加 Cloudflare 令牌',
            'Domains this token can manage': '此令牌可管理的域名',
            'Limit zone resources to the zones Coolify should manage.': '把 zone 范围限制在 Coolify 需要管理的区域内。',
            'Refresh zones': '刷新 zone 列表',
            'Validate and save': '验证并保存',
            'Validate and add': '验证并添加',
            'Accessible': '可访问',
            'accessible': '可访问',
            'managed': '托管',
            'Create the token in the': '在以下位置创建令牌：',
            'Validate and configure': '验证并配置',
            'Check DNS, TLS certificates, outbound firewall rules, and proxy settings.': '检查 DNS、TLS 证书、出站防火墙规则和代理设置。',
            'Under Attack Mode': '「防御模式」（Under Attack）',
            'Browser Integrity Check': '浏览器完整性检查',
            'Cloudflare users: disable': 'Cloudflare 用户请关闭：',
            'Are you the site owner?': '你是站长吗？',
            'This site is not available at the moment': '此站点暂时不可用',
            'We are doing some maintenance': '我们正在做维护',
            'is temporarily unavailable for maintenance. Please check back soon.': '正在维护中，请稍后再来。',
            'cannot answer your request right now. Please try again later.': '暂时无法响应请求，请稍后再试。',
            'Read the troubleshooting guide': '阅读排障指南',
            'The application health check is failing.': '应用健康检查未通过。',
            'The health check is failing.': '健康检查未通过。',
            'The application is stopped, still deploying, or has crashed.': '应用已停止、仍在部署中，或已崩溃。',
            'The resource may be functioning normally.': '资源本身可能仍在正常运行。',
            'This resource will': '此资源将会',
            'NOT work with Traefik': '与 Traefik 不兼容',
            'More details in the': '详情见',
            'If you are seeing this, it means that your Email settings are correct.': '看到这封邮件，说明你的邮箱设置是正确的。',
            'If it was not you who requested this invitation, please ignore this email.': '如果这不是你发起的邀请，请忽略这封邮件。'
        },

        // ---------- v1.0.2 新增：全局 / 外观 / 反馈 ----------
        v45Global: {
            'This will cause unusual problems on the UI. Open the': '这会让界面出现异常。请打开',
            'required ports': '所需端口',
            'Acknowledge & disable': '知道了，不再提示',
            'you': '你',
            '. Your support helps us build more features and keep improving the project.': '。你的支持能帮我们做出更多功能、持续改进项目。',
            'Enable at least one notification channel so you receive important alerts. Visit': '请至少启用一个通知渠道，以便收到重要告警。前往',
            'notifications': '通知',
            'Global': '全局',
            'This page': '本页',
            'Loading…': '加载中…',
            'Full width': '全宽',
            'Centered': '居中',
            'Floating': '悬浮',
            'Flat': '扁平',
            'Open sidebar': '打开侧栏',
            'Environment': '环境',
            'environment': '个环境',
            'resources': '个资源',
            'Project': '项目',
            'This is the server where Coolify is running on. Don\'t delete this!': '这是运行 Coolify 本身的服务器，千万别删！',
            'Ready': '就绪',
            'For more details, please visit the': '更多细节请访问',
            'Protocol': '协议',
            'Host': '主机',
            'Optional path, query, or fragment appended after the domain and port.': '可选：附加在域名和端口后面的路径、查询参数或锚点。',
            'Bucket': '存储桶',
            'Region': '区域',
            'Region only required for AWS. Leave it as-is for other providers.': '只有 AWS 需要填区域，其他服务商保持默认即可。',
            'Access Key': 'Access Key',
            'Secret Key': 'Secret Key',
            'No options available.': '没有可选项。',
            'Private key': '私钥',
            'Public key': '公钥',
            'Copy this value to ~/.ssh/authorized_keys on the target server.': '把这个值复制到目标服务器的 ~/.ssh/authorized_keys 里。',
            'Organization': '组织',
            'Subject': '主题',
            'Details': '详情',
            'How can we help?': '需要什么帮助？',
            'Share a problem, question, or idea. Include enough context for us to understand what happened.': '说说你遇到的问题、疑问或想法，尽量把来龙去脉写清楚。',
            'New Team': '新建团队',
            'New Project': '新建项目',
            'New Environment': '新建环境',
            'Name A–Z': '名称 A–Z',
            'Name Z–A': '名称 Z–A',
            'Most resources': '资源最多',
            'Most environments': '环境最多',
            'Custom…': '自定义…',
            'Other': '其他',
            'Username': '用户名',
            'No matching options': '没有匹配的选项',
            'Select servers': '选择服务器',
            'Select…': '请选择…',
            'Never': '永不',
            'Include': '包含',
            'Resources': '资源',
            'Resource': '资源',
            'Resource types': '资源类型',
            'Statuses': '状态',
            'Domain': '域名',
            'in': '位于',
            'True': '是',
            'False': '否',
            'Version': '版本',
            'Loading page…': '正在加载页面…',
            'You have changes that haven\'t been saved yet.': '你有尚未保存的更改。',
            'Avatar': '头像',
            'Browse…': '浏览…',
            'Comment': '备注',
            'Developer': '开发者',
            'Developer view': '开发者视图',
            'Single line': '单行',
            'Value type': '值类型',
            'Capabilities': '功能',
            'API token': 'API 令牌',
            'API key': 'API 密钥',
            'Allowed': '允许',
            'Blocked': '禁止',
            'Root': 'Root（完全权限）',
            'Write': '写入',
            'Read': '读取',
            'Permissions': '权限',
            'Timeout': '超时',
            'Encryption': '加密方式',
            'In use': '使用中',
            'Connected': '已连接',
            'Destination': '部署目标',
            'Registry': '镜像仓库',
            'Scopes': '权限范围',
            'Base URL': '基础 URL',
            'Tenant': '租户',
            'Hosted domain': '托管域名',
            'Sender': '发件人',
            'Delete Project': '删除项目',
            'Confirm Project Deletion?': '确认删除项目？',
            'This will delete the selected project': '这将删除所选项目',
            'All Environments inside the project will be deleted as well.': '项目里的所有环境也会一并删除。',
            'Please confirm the execution of the actions by entering the Project Name below': '请在下方输入项目名称，确认执行这些操作',
            'Project Name': '项目名称',
            'Permanently Delete': '彻底删除'
        },

        // ---------- v1.0.2 新增：流量分析 / 指标 ----------
        v45Monitor: {
            'Requests': '请求数',
            'Unique visitors': '独立访客',
            'Bandwidth': '带宽',
            'Error rate': '错误率',
            'p95 latency': 'p95 延迟',
            'Status codes': '状态码',
            'Top hosts': '热门主机',
            'Top applications': '热门应用',
            'Top paths': '热门路径',
            'Locations': '访问地区',
            'Resource usage across every server, reported by Sentinel.': '由 Sentinel 上报的所有服务器资源用量。',
            'Fleet CPU': '整体 CPU',
            'Fleet memory': '整体内存',
            'Fleet disk': '整体磁盘',
            'Fleet network': '整体网络',
            'Memory used': '已用内存',
            'Network throughput': '网络吞吐',
            'Load average': '平均负载',
            'Disk usage': '磁盘用量',
            'Hottest containers': '最忙的容器'
        },

        // ---------- v1.0.2 新增：代码来源 / 部署目标 / 镜像仓库 / S3 ----------
        v45Sources: {
            'Connect a GitHub App for private repositories, webhooks, and commit / pull request deployments.': '连接 GitHub App，用于私有仓库、Webhook，以及按提交 / 拉取请求部署。',
            'If empty, your GitHub user will be used. GitHub Actions runners need an organization.': '留空则使用你的 GitHub 个人账号。GitHub Actions Runner 需要组织。',
            'System wide': '全实例共享',
            'If checked, this GitHub App will be available for everyone in this Coolify instance.': '勾选后，这个 GitHub App 对本 Coolify 实例的所有人可用。',
            'Shared with every team': '所有团队共享',
            'System-wide GitHub Apps are available to every team on this instance. Prefer team-specific apps when you need repository isolation.': '全实例共享的 GitHub App 对本实例所有团队可用。需要隔离仓库时，建议用团队专属的 App。',
            'Deploying applications from private repositories is always included. The choices below select the permissions and webhook events on the next page.': '从私有仓库部署应用总是包含在内。下面的选项决定下一页要申请的权限和 Webhook 事件。',
            'Pull request previews': '拉取请求预览',
            'Deploys pull requests and posts deployment status on them.': '部署拉取请求，并把部署状态回写到上面。',
            'GitHub Actions runners': 'GitHub Actions Runner',
            'Runs workflow jobs on your servers. Needs an organization.': '在你的服务器上运行工作流任务，需要组织。',
            'HTML URL': 'HTML 地址',
            'API URL': 'API 地址',
            'Custom Git user': '自定义 Git 用户',
            'Custom Git port': '自定义 Git 端口',
            'No matching sources': '没有匹配的代码来源',
            'New GitHub App': '新建 GitHub App',
            'New GitLab App': '新建 GitLab App',
            'New Gitea App': '新建 Gitea App',
            'Connect a GitLab OAuth application for private repositories, webhooks, and deployments.': '连接 GitLab OAuth 应用，用于私有仓库、Webhook 和部署。',
            'Group name': '群组名',
            'Optional. Comma-separated group names to filter repositories (e.g. myorg,myteam).': '可选。用逗号分隔的群组名，用来筛选仓库（例如 myorg,myteam）。',
            'If checked, this GitLab App will be available for everyone in this Coolify instance.': '勾选后，这个 GitLab App 对本 Coolify 实例的所有人可用。',
            'System-wide GitLab Apps are available to every team on this instance. Prefer team-specific apps when you need repository isolation.': '全实例共享的 GitLab App 对本实例所有团队可用。需要隔离仓库时，建议用团队专属的 App。',
            'GitLab URL': 'GitLab 地址',
            'Usually your GitLab URL with /api/v4 appended.': '一般是你的 GitLab 地址后面加 /api/v4。',
            'Connect a Gitea OAuth2 application for private repositories, webhooks, and deployments.': '连接 Gitea OAuth2 应用，用于私有仓库、Webhook 和部署。',
            'Optional. Comma-separated organization or user names to filter repositories (e.g. myorg,myuser).': '可选。用逗号分隔的组织名或用户名，用来筛选仓库（例如 myorg,myuser）。',
            'If checked, this Gitea App will be available for everyone in this Coolify instance.': '勾选后，这个 Gitea App 对本 Coolify 实例的所有人可用。',
            'System-wide Gitea Apps are available to every team on this instance. Prefer team-specific apps when you need repository isolation.': '全实例共享的 Gitea App 对本实例所有团队可用。需要隔离仓库时，建议用团队专属的 App。',
            'Gitea URL': 'Gitea 地址',
            'Usually your Gitea URL with /api/v1 appended.': '一般是你的 Gitea 地址后面加 /api/v1。',
            'Standalone Docker': '独立 Docker',
            'No matching destinations': '没有匹配的部署目标',
            'New Destination': '新建部署目标',
            'Registry logins on each server, read from the Docker config that deployments use. Use': '各服务器上的镜像仓库登录信息，读取自部署所用的 Docker 配置。可以用',
            ', or run': '，或者运行',
            'on a server.': '（在服务器上执行）。',
            'Loading registries': '正在加载镜像仓库',
            'Log in on multiple servers': '在多台服务器上登录',
            'Runs docker login on each server that you choose.': '在你选中的每台服务器上执行 docker login。',
            'Password or token': '密码或令牌',
            'Coolify does not save the token. Docker saves the login on the server in': 'Coolify 不保存令牌。Docker 会把登录信息保存在服务器的',
            ', encoded but not encrypted.': '里，只是编码，并没有加密。',
            'No S3 storage yet': '还没有 S3 存储',
            'Add an S3-compatible destination to store backups outside your servers.': '添加一个 S3 兼容的存储，把备份放到服务器之外。',
            'New S3 Storage': '新建 S3 存储'
        },

        // ---------- v1.0.2 新增：共享变量 ----------
        v45SharedVars: {
            'Team wide': '团队范围',
            'Every resource of this team.': '本团队的所有资源。',
            'Project wide': '项目范围',
            'Every environment of a project.': '某个项目的所有环境。',
            'Environment wide': '环境范围',
            'Resources in one environment.': '某个环境里的资源。',
            'Server wide': '服务器范围',
            'Resources deployed on one server.': '部署在某台服务器上的资源。',
            'Team variables': '团队变量',
            'No shared variables': '没有共享变量',
            'Add a variable to make it available to resources in this scope.': '添加一个变量，让这个范围里的资源都能用。',
            'New Shared Variable': '新建共享变量',
            'Add a note to document what this environment variable is used for.': '加个备注，记下这个环境变量是做什么用的。'
        },

        // ---------- v1.0.2 新增：团队 / 成员 / 审计日志 ----------
        v45Team: {
            'Manage your team, members, and access settings.': '管理你的团队、成员和访问设置。',
            'Manage this team\'s identity and shared API access.': '管理这个团队的身份信息和共享 API 访问。',
            'JPG, PNG, or WebP. Shown in the team switcher.': '支持 JPG、PNG 或 WebP，显示在团队切换器里。',
            'MCP server': 'MCP 服务',
            'Controls whether this team\'s API tokens can use the instance MCP endpoint.': '控制这个团队的 API 令牌能否使用实例的 MCP 端点。',
            'Enabled for this team': '对本团队启用',
            'Disabled for this team': '对本团队停用',
            'Build server fallback': '构建服务器兜底',
            'Controls what happens when an application is configured to use a dedicated build server, but no usable build server is available.': '应用配置了专用构建服务器、但没有可用的构建服务器时，该怎么处理。',
            'Build on the deployment server': '在部署服务器上构建',
            'Fail the deployment': '让部署失败',
            'All roles': '全部角色',
            'Member': '成员',
            'Email A–Z': '邮箱 A–Z',
            'Email Z–A': '邮箱 Z–A',
            'owner': '所有者',
            'Two-factor authentication is disabled': '未启用两步验证',
            'No matching members': '没有匹配的成员',
            'Try a different name, email address, or role.': '换个名字、邮箱或角色试试。',
            'Invite a member': '邀请成员',
            'Create a reusable invitation link or deliver it by email.': '生成可重复使用的邀请链接，或通过邮件发送。',
            'Email delivery is not configured': '尚未配置邮件发送',
            'Email address': '邮箱地址',
            'Activity from the last 90 days for the current team.': '当前团队最近 90 天的活动记录。',
            'All actions': '全部操作',
            'Deployed': '已部署',
            'Login Failed': '登录失败',
            'Login Succeeded': '登录成功',
            'Registered': '已注册',
            'Settings Updated': '设置已更新',
            'Storage Created': '存储已创建',
            'Storage Updated': '存储已更新',
            'Unauthenticated': '未认证',
            'Auth Unauthenticated': '认证失败（未认证）',
            'Instance Updated': '实例已更新',
            'All sources': '全部来源',
            'Web UI': '网页界面',
            'Git Branch': 'Git 分支',
            'Is Multiline': '是否多行',
            'Is Preview': '是否预览',
            'Resourceable Type': '所属资源类型',
            'Is Shared': '是否共享',
            'Is Literal': '是否字面量',
            'Is Required': '是否必填',
            'Is Runtime': '是否运行时可用',
            'Is Buildtime': '是否构建时可用',
            'Instance users': '实例用户',
            'All users': '全部用户',
            'Current team': '当前团队',
            'Outside team': '团队外',
            'No users found': '没有找到用户',
            'Try a different name or email address.': '换个名字或邮箱试试。',
            'Destructive actions for this team cannot be undone.': '针对这个团队的危险操作无法撤销。',
            'Resolve the requirements shown before deleting this team.': '删除团队前，请先处理上面列出的事项。'
        },

        // ---------- v1.0.2 新增：通知 ----------
        v45Notify: {
            'Email delivery': '邮件发送',
            'Email service': '邮件服务',
            'Use team email settings': '使用团队邮件设置',
            'Use system-wide settings': '使用全实例设置',
            'From name': '发件人名称',
            'Name used in emails.': '邮件里显示的名字。',
            'From address': '发件地址',
            'Email address used in emails.': '发件用的邮箱地址。',
            'SMTP server': 'SMTP 服务器',
            'Deliver messages through your own SMTP server.': '通过你自己的 SMTP 服务器发送。',
            'SMTP delivery': 'SMTP 发送',
            'SMTP username': 'SMTP 用户名',
            'SMTP password': 'SMTP 密码',
            'Timeout value for sending emails.': '发送邮件的超时时间。',
            'EHLO domain': 'EHLO 域名',
            'Fully qualified domain sent in the SMTP EHLO command. Uses the system default when empty.': 'SMTP EHLO 命令里发送的完整域名，留空则用系统默认值。',
            'Resend': 'Resend',
            'Resend delivery': 'Resend 发送',
            'Notification events': '通知事件',
            'Deployment failure': '部署失败',
            'Deployment success': '部署成功',
            'Restart limit reached': '达到重启次数上限',
            'Resource status changes': '资源状态变化',
            'Backup failure': '备份失败',
            'Backup success': '备份成功',
            'Scheduled tasks': '计划任务',
            'Scheduled task failure': '计划任务失败',
            'Scheduled task success': '计划任务成功',
            'Docker cleanup failure, Server disk usage, Server unreachable, Server patching, Traefik proxy outdated': 'Docker 清理失败、服务器磁盘用量、服务器不可达、服务器补丁、Traefik 代理过旧',
            'Docker cleanup failure, Disk usage warning, Server unreachable, Server patching, Traefik proxy outdated': 'Docker 清理失败、磁盘用量告警、服务器不可达、服务器补丁、Traefik 代理过旧',
            'Docker cleanup failure, Disk usage warning, Server unreachable, Traefik proxy outdated': 'Docker 清理失败、磁盘用量告警、服务器不可达、Traefik 代理过旧',
            'Docker cleanup success': 'Docker 清理成功',
            'Docker cleanup failure': 'Docker 清理失败',
            'Server disk usage': '服务器磁盘用量',
            'Server reachable': '服务器恢复可达',
            'Server unreachable': '服务器不可达',
            'Server patching': '服务器补丁',
            'Traefik proxy outdated': 'Traefik 代理过旧',
            'Disk usage warning': '磁盘用量告警',
            'Include commit details in deployment emails': '部署邮件里附上提交信息',
            'Adds the commit SHA, branch, and commit message to deployment success and failure emails.': '在部署成功和失败的邮件里加上提交 SHA、分支和提交说明。',
            'Send team notifications to a Discord channel through an incoming webhook.': '通过传入 Webhook 把团队通知发到 Discord 频道。',
            'Critical event mention': '严重事件提醒',
            'Mention @here when a critical event occurs.': '发生严重事件时 @here。',
            'Mention @here': '@here 提醒',
            'Do not mention': '不提醒',
            'Webhook URL': 'Webhook 地址',
            'Create an incoming webhook in your Discord server settings.': '在你的 Discord 服务器设置里创建一个传入 Webhook。',
            'Choose which events send a notification on this channel.': '选择哪些事件要通过这个渠道发通知。',
            'Deliver team notifications through a Telegram bot and chat.': '通过 Telegram 机器人和聊天发送团队通知。',
            'Bot API token': 'Bot API 令牌',
            'Create a bot with BotFather to obtain this token.': '用 BotFather 创建机器人，获取这个令牌。',
            'Chat ID': '聊天 ID',
            'Add the bot to your chat, then enter that chat ID.': '先把机器人拉进聊天，再填那个聊天的 ID。',
            'Forum topics': '论坛话题',
            'Optional. Route enabled events to a Telegram forum topic using its message thread ID. Leave blank to post in the main chat.': '可选。用消息线程 ID 把已启用的事件发到 Telegram 论坛话题里；留空则发在主聊天。',
            'Send JSON event payloads to your own HTTP endpoint.': '把 JSON 事件数据发到你自己的 HTTP 端点。',
            'Coolify sends POST requests to this HTTP or HTTPS endpoint.': 'Coolify 会向这个 HTTP 或 HTTPS 端点发 POST 请求。'
        },

        // ---------- v1.0.2 新增：密钥与令牌 ----------
        v45Keys: {
            'Manage SSH keys, cloud credentials, and API access tokens.': '管理 SSH 密钥、云凭证和 API 访问令牌。',
            'Private keys': '私钥',
            'SSH keys used to connect servers and private repositories.': '用来连接服务器和私有仓库的 SSH 密钥。',
            'Generate ED25519': '生成 ED25519',
            'Generate RSA': '生成 RSA',
            'The private key for the Coolify host machine (localhost).': 'Coolify 所在主机（localhost）的私钥。',
            'Confirm unused SSH Key Deletion?': '确认删除未使用的 SSH 密钥？',
            'All unused SSH keys (marked with unused) are permanently deleted.': '所有未使用的 SSH 密钥（标为 unused 的）都会被永久删除。',
            'Add Private Key Manually': '手动添加私钥',
            'Edit Private Key': '编辑私钥',
            'Cloud tokens': '云令牌',
            'Provider credentials used to provision cloud servers.': '用来开通云服务器的服务商凭证。',
            'No cloud tokens': '还没有云令牌',
            'Add a provider token to provision new cloud servers.': '添加服务商令牌，就能开通新的云服务器。',
            'New Cloud Token': '新建云令牌',
            'Hetzner console': 'Hetzner 控制台',
            'Token name': '令牌名称',
            'Integration tokens': '集成令牌',
            'Credentials used by third-party integrations such as DNS providers and secret managers.': '第三方集成（比如 DNS 服务商、密钥管理器）用的凭证。',
            'No integration tokens': '还没有集成令牌',
            'Add a provider token to connect a third-party integration.': '添加服务商令牌来连接第三方集成。',
            'New Integration Token': '新建集成令牌',
            'Manage Cloudflare DNS records.': '管理 Cloudflare DNS 记录。',
            'Create and manage tunnels for server SSH. Needs DNS.': '为服务器 SSH 创建和管理隧道，需要 DNS 权限。',
            'Automatically configure DNS': '自动配置 DNS',
            'Create DNS records automatically when a new domain has one unambiguous matching credential.': '新域名恰好匹配到唯一一个凭证时，自动创建 DNS 记录。',
            'Proxy DNS records through Cloudflare': '通过 Cloudflare 代理 DNS 记录',
            'Create new DNS records with the Cloudflare proxy on (orange cloud), so the server IP is not public. Existing records keep their proxy status.': '新建的 DNS 记录会打开 Cloudflare 代理（橙色云朵），服务器 IP 不会公开。已有记录保持原来的代理状态。',
            'Cloud-init scripts': 'Cloud-init 脚本',
            'Reusable initialization scripts for cloud servers.': '可复用的云服务器初始化脚本。',
            'New script': '新建脚本',
            'No cloud-init scripts': '还没有 cloud-init 脚本',
            'Create a script to reuse it during server provisioning.': '创建一个脚本，开通服务器时可以重复使用。',
            'New Cloud-Init Script': '新建 Cloud-Init 脚本',
            'Script name': '脚本名称',
            'A recognizable name for this reusable script.': '给这个可复用脚本起个好认的名字。',
            'Script content': '脚本内容',
            'Cloud-config YAML or another script accepted by your provider.': 'Cloud-config YAML，或你的服务商支持的其他脚本。',
            'Create script': '创建脚本',
            'API access is turned off': 'API 访问已关闭',
            'REST API requests are rejected. Tokens still authenticate the MCP endpoint when the MCP server is enabled.': 'REST API 请求会被拒绝。开启 MCP 服务时，令牌仍可用于 MCP 端点认证。',
            'Enable API access': '开启 API 访问',
            'New API token': '新建 API 令牌',
            'Expires in': '有效期',
            'Only grant the abilities this token needs.': '只授予这个令牌需要的权限。',
            'Selected permissions: Read': '已选权限：读取',
            'Selected permissions: Root': '已选权限：Root（完全权限）',
            'Full access to every API operation.': '可以执行所有 API 操作。',
            'Create and update resources.': '创建和更新资源。',
            'Deploy, start, stop, and restart resources. With Write, also apply changes that run on servers immediately, such as scheduled tasks, proxy configuration, and imports.': '部署、启动、停止、重启资源。同时有「写入」时，还能立即应用会在服务器上执行的变更，比如计划任务、代理配置和导入。',
            'Read non-sensitive resource data.': '读取不敏感的资源数据。',
            'Read sensitive data': '读取敏感数据',
            'Include secrets, logs, passwords, and Compose content.': '包括密钥、日志、密码和 Compose 内容。',
            'Issued tokens': '已签发的令牌',
            'No matching tokens': '没有匹配的令牌',
            'Try a different description or permission.': '换个描述或权限试试。',
            'Confirm API Token Revocation?': '确认吊销 API 令牌？',
            'This API token will be permanently revoked.': '这个 API 令牌会被永久吊销。',
            'Enter the token description to confirm': '输入令牌描述以确认',
            'Token description': '令牌描述',
            'Revoke token': '吊销令牌',
            'No API tokens': '还没有 API 令牌',
            'Create a token when an external client needs access.': '有外部客户端要访问时，再来创建令牌。'
        },

        // ---------- v1.0.2 新增：实例设置 ----------
        v45Settings: {
            'Passkeys are tied to this domain. If you change it, users must add their passkeys again.': '通行密钥绑定在这个域名上。改了域名，所有人都得重新添加通行密钥。',
            'Disable only when Cloudflare Tunnel or another proxy connects to Coolify over HTTP. Keep enabled when Cloudflare uses Full or Full (Strict) SSL.': '只有 Cloudflare Tunnel 或其他代理用 HTTP 连 Coolify 时才关闭。Cloudflare 用 Full 或 Full (Strict) SSL 时保持开启。',
            'Enter the full URL of the instance (for example, https://dashboard.example.com).': '填写实例的完整地址（例如 https://dashboard.example.com）。',
            'Custom name for this Coolify instance.': '给这个 Coolify 实例起的名字。',
            'Instance timezone': '实例时区',
            'Timezone used for update checks and the automatic update schedule.': '检查更新和自动更新计划使用的时区。',
            'No matching timezone': '没有匹配的时区',
            'Network addresses': '网络地址',
            'Instance public IPv4': '实例公网 IPv4',
            'Instance public IPv6': '实例公网 IPv6',
            'Coolify detects this address on start only when the field is empty. Set it when the detected address is wrong. Detect looks it up again and saves it.': '只有这一栏为空时，Coolify 才会在启动时自动检测地址。检测错了就手动填写；点「检测」会重新查一次并保存。',
            'Access and API': '访问与 API',
            'Registration': '注册',
            'Allow users to create their own account. When disabled, only administrators can create accounts.': '允许用户自己注册账号。关闭后只有管理员能创建账号。',
            'Registration disabled': '已关闭注册',
            'Anyone can register': '任何人都能注册',
            'Password registration with OAuth': 'OAuth 下的密码注册',
            'Hide password registration whenever at least one OAuth provider is enabled.': '只要启用了任意一个 OAuth 提供方，就隐藏密码注册。',
            'Allow password registration': '允许密码注册',
            'Disable when OAuth is enabled': '启用 OAuth 时关闭',
            'Destructive action confirmation': '危险操作确认',
            'Choose whether destructive actions require password and text confirmation.': '选择危险操作是否需要输入密码和文字确认。',
            'Require two-step confirmation': '需要两步确认',
            'Skip two-step confirmation': '跳过两步确认',
            'Let users sign in with a passkey. Passkeys need an HTTPS instance URL. Stored passkeys are kept when this is disabled.': '允许用通行密钥登录，需要实例地址是 HTTPS。关闭后已保存的通行密钥不会删除。',
            'API and MCP': 'API 与 MCP',
            'API access': 'API 访问',
            'Allow authenticated requests to the Coolify REST API.': '允许经过认证的请求访问 Coolify REST API。',
            'Expose the authenticated Streamable HTTP endpoint at /mcp.': '在 /mcp 开放需要认证的 Streamable HTTP 端点。',
            'Allowed IPs': '允许的 IP',
            'Applies to the REST API and the MCP endpoint. Comma-separated IPs or CIDR ranges. Empty or 0.0.0.0 allows all sources.': '对 REST API 和 MCP 端点都生效。用逗号分隔 IP 或 CIDR 网段；留空或填 0.0.0.0 表示允许所有来源。',
            'MCP endpoint': 'MCP 端点',
            'Authenticate with a bearer token from': '使用 Bearer 令牌认证，令牌在',
            'Security → API Tokens': '安全 → API 令牌',
            'Domain validation and the internal targets that outbound requests may reach.': '域名校验，以及对外请求允许访问的内部目标。',
            'DNS validation': 'DNS 校验',
            'Validate custom domains before deployment.': '部署前先校验自定义域名。',
            'Custom DNS servers': '自定义 DNS 服务器',
            'Comma-separated resolvers. Leave empty to use system defaults.': '用逗号分隔的解析服务器，留空则用系统默认值。',
            'Outbound endpoints': '对外端点',
            'Allowed internal targets': '允许的内部目标',
            'Hostnames, IPs, or CIDR ranges separated by commas or new lines.': '主机名、IP 或 CIDR 网段，用逗号或换行分隔。',
            'Localhost targets': '本机目标',
            'Loopback targets must also be present in the allowlist.': '回环地址也必须写进白名单。',
            'Interface and telemetry': '界面与遥测',
            'Prefetch pages and navigate without full reloads.': '预加载页面，切换页面时不整页刷新。',
            'SPA navigation': '单页式导航',
            'Full page navigation': '整页刷新导航',
            'Anonymous telemetry': '匿名遥测',
            'Control installation counting and error reports.': '控制安装统计和错误上报。',
            'Sponsorship reminders': '赞助提醒',
            'Show the monthly project sponsorship reminder.': '每月显示一次项目赞助提醒。',
            'Where Coolify stores uploaded images and how users download files.': 'Coolify 把上传的图片存在哪里，以及用户怎么下载文件。',
            'Image storage': '图片存储',
            'Choose where compressed profile pictures and project icons are stored. Use S3 for multi-instance or cloud deployments so every application replica can access the same files.': '选择压缩后的头像和项目图标存在哪里。多实例或云部署建议用 S3，这样每个应用副本都能访问同一份文件。',
            'Storage destination': '存储位置',
            'Local storage': '本地存储',
            'Image CDN URL': '图片 CDN 地址',
            'Optional public URL (for example a CDN or public bucket domain) that serves profile pictures and project icons stored on S3. Leave empty to serve them through Coolify.': '可选的公开地址（比如 CDN 或公开存储桶的域名），用来提供存在 S3 上的头像和项目图标。留空则由 Coolify 自己提供。',
            'No usable S3 storage configured': '没有可用的 S3 存储',
            'File downloads': '文件下载',
            'Download method': '下载方式',
            'Stream through Coolify': '经 Coolify 中转',
            'Bucket auto-delete rule': '存储桶自动删除规则',
            'When you select an S3 storage, Coolify adds a lifecycle rule that deletes objects under': '选择 S3 存储后，Coolify 会加一条生命周期规则，删除以下路径中的对象：',
            'after 1 day, as a safety net. The selected storage must be reachable from your servers, and the S3 provider must support lifecycle rules.': '（1 天后删除，作为兜底）。所选存储必须能被你的服务器访问，而且 S3 服务商要支持生命周期规则。',
            'Install the latest Coolify version manually when an update is available.': '有更新时手动安装最新版 Coolify。',
            'Check frequency': '检查频率',
            'A cron expression or preset such as hourly, daily, weekly, monthly, or yearly.': 'cron 表达式，或 hourly、daily、weekly、monthly、yearly 这类预设。',
            'Docker registry': 'Docker 镜像源',
            'Switch registries if the current source is rate limited.': '当前镜像源被限流时可以切换。',
            'Automatic updates': '自动更新',
            'Update frequency': '更新频率',
            'Cron expression or preset for installing updates.': '安装更新用的 cron 表达式或预设。',
            'Control password registration when an OAuth provider is available.': '有 OAuth 提供方时，控制是否允许密码注册。',
            'Disable password registration when OAuth is enabled': '启用 OAuth 时关闭密码注册',
            'OAuth providers can still create users when registration is enabled for that provider.': '某个提供方开启了注册时，仍然可以通过它创建用户。',
            'Issuer URL': 'Issuer 地址',
            'Client ID': 'Client ID',
            'Client secret': 'Client Secret',
            'Must include openid. Common scopes are openid email profile groups.': '必须包含 openid。常用的有 openid email profile groups。',
            'Clock skew (seconds)': '允许的时钟偏差（秒）',
            'Login button label': '登录按钮文字',
            'Allow OIDC user creation': '允许通过 OIDC 创建用户',
            'Allow a successful OIDC login to create a user when password registration is disabled.': '关闭密码注册时，允许 OIDC 登录成功后自动创建用户。',
            'Require verified email': '要求邮箱已验证',
            'Use PKCE': '使用 PKCE',
            'Auto-join new users to Root team': '新用户自动加入 Root 团队',
            'Add newly-created OAuth users to the Root team as members without creating a personal team.': '通过 OAuth 新建的用户直接作为成员加入 Root 团队，不另建个人团队。',
            'Optional Google Workspace domain, for example example.com. Only accounts from this domain can sign in. Use * to allow any Workspace account but no personal Google accounts.': '可选的 Google Workspace 域名，例如 example.com，只有该域名的账号能登录。填 * 表示允许任意 Workspace 账号，但不允许个人 Google 账号。',
            'Name shown in outgoing email.': '发出邮件里显示的名字。',
            'Address used for outgoing email.': '发出邮件用的地址。',
            'Maximum delivery time in seconds.': '最长发送时间（秒）。',
            'Instance backup': '实例备份',
            'Backup is not configured': '尚未配置备份',
            'Coolify needs an internal database resource to create automatic backups.': 'Coolify 需要一个内部数据库资源才能自动备份。',
            'Configure backup': '配置备份'
        },

        // ---------- v1.0.2 新增：标签 / 个人资料 / 终端 ----------
        v45Profile: {
            'Group applications and services for bulk deploys': '把应用和服务分组，方便批量部署',
            'No tags yet': '还没有标签',
            'Create a tag, then connect it to resources to group related deployments.': '先建一个标签，再关联到资源上，就能把相关部署归到一组。',
            'Lowercase, without spaces. You can add resources to the tag later.': '小写、不要空格。资源可以之后再加到标签里。',
            'JPG, PNG, or WebP. Shown in the user menu and team member lists.': '支持 JPG、PNG 或 WebP，显示在用户菜单和团队成员列表里。',
            'Current password': '当前密码',
            'New password': '新密码',
            'Confirm new password': '确认新密码',
            'Two-factor authentication is off': '两步验证未开启',
            'Configure an authenticator app to add another sign-in check.': '配置一个验证器 App，多加一道登录校验。',
            'Sign in with your fingerprint, face, or a security key. A passkey sign-in skips two-factor authentication.': '用指纹、面容或安全密钥登录。用通行密钥登录时会跳过两步验证。',
            'No passkeys': '还没有通行密钥',
            'Add a passkey to sign in without your password.': '添加通行密钥，就能不输密码登录。',
            '• The root user cannot be deleted.': '• root 用户不能删除。',
            'Resolve the requirements shown before deleting your account.': '删除账号前，请先处理上面列出的事项。',
            'Change email': '更换邮箱',
            'A six-digit verification code will be sent to the new address.': '会向新邮箱发送一个 6 位验证码。',
            'New email address': '新邮箱地址',
            'If you cannot connect, confirm the server is reachable and that the terminal port is open on the firewall.': '如果连不上，请确认服务器可达，并且防火墙放行了终端端口。',
            'Run commands on reachable servers and containers from the browser.': '直接在浏览器里对可达的服务器和容器执行命令。'
        },

        // ---------- v1.0.2 新增：服务器页 ----------
        v45Server: {
            'In sync': '已同步',
            'Private Key': '私钥',
            'Images': '镜像',
            'Server overview': '服务器概览',
            'Operating system and hardware details for the server running this Coolify instance.': '运行这个 Coolify 实例的服务器的系统和硬件信息。',
            'Fetch server details': '获取服务器信息',
            'Revalidate connection': '重新验证连接',
            'The server is reachable, validated, and ready to host resources.': '服务器可达、已验证，可以部署资源了。',
            'Configure how Coolify identifies and connects to this server.': '设置 Coolify 如何识别和连接这台服务器。',
            'IP address or domain': 'IP 地址或域名',
            'Enter a hostname or IP address without http:// or https://.': '填主机名或 IP 地址，不要带 http:// 或 https://。',
            'SSH user': 'SSH 用户',
            'SSH port': 'SSH 端口',
            'Connection timeout': '连接超时',
            'Seconds to wait before an SSH connection fails.': 'SSH 连接等多少秒没连上就算失败。',
            'Server timezone': '服务器时区',
            'Used for backup schedules, cron jobs, and displayed timestamps.': '用于备份计划、cron 任务和界面上显示的时间。',
            'Wildcard domain': '通配域名',
            'New resources can receive generated subdomains from this domain.': '新资源可以从这个域名自动生成子域名。',
            'Waiting for the process to start...': '正在等待进程启动…',
            'Confirm Proxy Restart?': '确认重启代理？',
            'This proxy will be stopped and started again.': '代理会先停止再重新启动。',
            'All resources hosted on Coolify will be unavailable during the restart.': '重启期间，Coolify 上托管的所有资源都无法访问。',
            'Confirm Proxy Stopping?': '确认停止代理？',
            'The Coolify proxy will be stopped.': 'Coolify 代理会被停止。',
            'All resources hosted on Coolify will be unavailable.': 'Coolify 上托管的所有资源都将无法访问。',
            'Use this server for deployments and builds?': '用这台服务器做部署和构建？',
            'Builds can use a large amount of CPU and memory. During a build, deployed resources on this server can become slow or unreachable.': '构建会占用大量 CPU 和内存，构建期间这台服务器上已部署的资源可能变慢甚至无法访问。',
            'Enable builds on this deployment server.': '允许在这台部署服务器上构建。',
            'Enable deployments and builds': '启用部署和构建',
            'TLS Certificates': 'TLS 证书',
            'TLS certificates': 'TLS 证书',
            'Proxy configuration': '代理配置',
            'Configure the reverse proxy and request handling for this server.': '设置这台服务器的反向代理和请求处理。',
            'Saved and running configuration are synchronized.': '已保存的配置和正在运行的配置一致。',
            'Routing behavior': '路由行为',
            'Control generated labels and requests that do not match a running resource.': '控制自动生成的标签，以及匹配不到运行中资源的请求怎么处理。',
            'Generated labels': '生成的标签',
            'generates fewer labels, but all resources must be redeployed to become accessible again after each proxy switch.': '生成的标签更少，但每次切换代理后，所有资源都要重新部署才能恢复访问。',
            'Labels for all supported proxies': '为所有支持的代理生成标签',
            'Labels for the active proxy only': '只为当前代理生成标签',
            'Unknown requests': '未知请求',
            'Control the 503 response for unknown hosts and stopped services. Custom request handling shows an error page or redirects to a URL.': '控制未知主机和已停止服务返回的 503。自定义处理可以显示错误页或跳转到某个地址。',
            'Use custom request handling': '使用自定义处理',
            'Return the default 503 response': '返回默认的 503',
            'Redirect URL': '跳转地址',
            'Leave empty to return a 503 response instead of redirecting.': '留空则返回 503，不跳转。',
            'Certificate resolver': '证书解析器',
            'Custom error page (HTML)': '自定义错误页（HTML）',
            'Reset to default': '恢复默认',
            'Traefik configuration': 'Traefik 配置',
            'Edit the generated proxy compose configuration used on this server.': '编辑这台服务器使用的代理 compose 配置。',
            'Reset configuration': '重置配置',
            'Loading proxy configuration': '正在加载代理配置',
            'Updating proxy configuration…': '正在更新代理配置…',
            'Reset Proxy Configuration?': '重置代理配置？',
            'Reset the proxy configuration to Coolify defaults.': '把代理配置恢复成 Coolify 默认值。',
            'Remove custom ports, entrypoints, and other manual changes.': '移除自定义端口、入口点和其他手动改动。',
            'Confirm by entering the server name': '输入服务器名称以确认',
            'Server Name': '服务器名称',
            'Reset Configuration': '重置配置',
            'Monitor server and container health while collecting historical metrics.': '监控服务器和容器的健康状况，同时收集历史指标。',
            'Configure how Sentinel authenticates with and reports to Coolify.': '设置 Sentinel 如何向 Coolify 认证和上报。',
            'Restore defaults': '恢复默认',
            'Coolify URL': 'Coolify 地址',
            'Public URL used by Sentinel to reach this Coolify instance.': 'Sentinel 访问这个 Coolify 实例用的公网地址。',
            'Sentinel token': 'Sentinel 令牌',
            'Authentication token used by Sentinel.': 'Sentinel 用的认证令牌。',
            'Restore default Sentinel configuration?': '恢复 Sentinel 默认配置？',
            'Your custom Sentinel configuration will be replaced with Coolify defaults.': '你自定义的 Sentinel 配置会被 Coolify 默认值替换。',
            'Restore the generated Coolify URL and default collection settings.': '恢复自动生成的 Coolify 地址和默认采集设置。',
            'Clear debug logging and the development image override.': '清除调试日志和开发镜像覆盖。',
            'The Sentinel token and metrics setting will be preserved.': 'Sentinel 令牌和指标设置会保留。',
            'Restart Sentinel to apply the restored configuration.': '重启 Sentinel 让恢复的配置生效。',
            'Control when Coolify checks this server and when your team is notified.': '控制 Coolify 什么时候检查这台服务器、什么时候通知团队。',
            'Cron expression or preset such as hourly, daily, weekly, monthly, or yearly.': 'cron 表达式，或 hourly、daily、weekly、monthly、yearly 这类预设。',
            'Notification threshold': '通知阈值',
            'Notify the team when root filesystem usage exceeds this percentage.': '根分区用量超过这个百分比时通知团队。',
            'Notification interval (hours)': '通知间隔（小时）',
            'Minimum time between high disk usage notifications for this server.': '这台服务器两次磁盘用量告警之间的最短间隔。',
            'Limit how much CPU volume backup compression may use on this server.': '限制这台服务器上卷备份压缩能用多少 CPU。',
            'Backup compression CPU': '备份压缩 CPU',
            'Sets how many CPU threads can be used to compress volume backups, based on this server\'s available CPUs.': '按这台服务器的可用 CPU，设置压缩卷备份能用几个线程。',
            'Low (25%)': '低（25%）',
            'Balanced (50%)': '均衡（50%）',
            'High (75%)': '高（75%）',
            'Maximum (100%)': '最大（100%）',
            'Builds': '构建',
            'Set deployment concurrency, execution timeouts, and queue capacity.': '设置部署并发数、执行超时和队列容量。',
            'Concurrent builds': '并发构建数',
            'Maximum deployments that can build at the same time.': '最多同时构建几个部署。',
            'Deployment timeout': '部署超时',
            'Maximum deployment duration in seconds.': '单次部署最长时间（秒）。',
            'Queue limit': '队列上限',
            'Maximum queued deployments before new requests are rejected.': '排队的部署超过这个数，新请求就会被拒绝。',
            'Choose the SSH key Coolify uses to connect to this server.': '选择 Coolify 连接这台服务器用的 SSH 密钥。',
            'CA certificate': 'CA 证书',
            'Manage the certificate authority used to sign database certificates on this server.': '管理给这台服务器上数据库证书签名的证书颁发机构。',
            'Valid': '有效',
            'Using this certificate': '使用这张证书',
            'Mount the CA certificate into containers that connect to databases over SSL. Re-deploy affected databases and resources after replacing or regenerating it.': '把 CA 证书挂载进通过 SSL 连数据库的容器。替换或重新生成后，要重新部署受影响的数据库和资源。',
            'Read the SSL guide.': '阅读 SSL 指南。',
            'Read-only bind mount': '只读绑定挂载',
            'Certificate content': '证书内容',
            'Review or replace the PEM certificate stored on this server.': '查看或替换这台服务器上保存的 PEM 证书。',
            'Show certificate': '显示证书',
            'Save certificate': '保存证书',
            'Save Certificate': '保存证书',
            'Regenerate': '重新生成',
            'Show the certificate to review or edit its contents.': '显示证书，查看或编辑内容。',
            'Confirm changing of CA Certificate?': '确认更换 CA 证书？',
            'Database certificates on this server will be regenerated and signed with the custom CA.': '这台服务器上的数据库证书会重新生成，并用自定义 CA 签名。',
            'You must redeploy affected databases and resources.': '你必须重新部署受影响的数据库和资源。',
            'CA Certificate Path': 'CA 证书路径',
            'Confirm Regenerate Certificate?': '确认重新生成证书？',
            'This replaces the current CA certificate with a newly generated certificate.': '这会用新生成的证书替换当前的 CA 证书。',
            'Database certificates on this server will be regenerated and signed with the new CA.': '这台服务器上的数据库证书会重新生成，并用新的 CA 签名。',
            'Regenerate Certificate': '重新生成证书',
            'Review Coolify-managed resources and other Docker containers running on this server.': '查看这台服务器上由 Coolify 管理的资源和其他 Docker 容器。',
            'Managed': '托管的',
            'Unmanaged': '非托管的',
            'Docker images stored on this server. Images that no container uses can be deleted here.': '这台服务器上存着的 Docker 镜像。没有容器在用的镜像可以在这里删除。',
            'Reading images from the Docker daemon': '正在从 Docker 守护进程读取镜像',
            'Docker cleanup': 'Docker 清理',
            'Remove unused Docker data and keep disk usage under control.': '清掉没用的 Docker 数据，控制磁盘用量。',
            'Run cleanup': '立即清理',
            'Cleanup runs automatically using the schedule and threshold configured below.': '会按下面设置的计划和阈值自动清理。',
            'Choose when cleanup runs and whether it should wait for a disk threshold.': '选择什么时候清理，以及是否要等磁盘用量到阈值。',
            'Cleanup frequency': '清理频率',
            'Cleanup trigger': '清理触发条件',
            'Forced cleanup runs on every schedule without waiting for the threshold.': '强制清理会按计划每次都执行，不等阈值。',
            'Run on every schedule': '按计划每次都清理',
            'Only above disk threshold': '只在磁盘用量超过阈值时',
            'Advanced cleanup': '高级清理',
            'Control destructive cleanup behavior and application image retention.': '控制有破坏性的清理行为，以及应用镜像保留多少。',
            'These options can remove recoverable data': '这些选项可能删掉还能恢复的数据',
            'Unused volumes may contain data from stopped containers, while removing retained images disables rollback to older application versions.': '未使用的卷里可能有已停止容器的数据；删掉保留的镜像后，就不能回滚到旧版本了。',
            'Unused volumes': '未使用的卷',
            'Permanently remove volumes not attached to running containers.': '永久删除没挂在运行中容器上的卷。',
            'Keep unused volumes': '保留未使用的卷',
            'Delete unused volumes': '删除未使用的卷',
            'Unused networks': '未使用的网络',
            'Remove Docker networks not attached to running containers.': '删除没连接运行中容器的 Docker 网络。',
            'Keep unused networks': '保留未使用的网络',
            'Delete unused networks': '删除未使用的网络',
            'Application images': '应用镜像',
            'Choose Keep retained images to follow each application’s Images to keep setting under Rollback. Delete all old images ignores that setting and keeps only the running image.': '选「保留镜像」会按各应用「回滚」里设置的保留数量来；选「删除所有旧镜像」会无视那个设置，只留正在运行的镜像。',
            'Keep retained images': '保留镜像',
            'Delete all old images': '删除所有旧镜像',
            'Recent executions': '最近执行记录',
            'Review cleanup status, duration, and command output.': '查看清理状态、耗时和命令输出。',
            'Confirm Docker Cleanup?': '确认执行 Docker 清理？',
            'Deletes stopped containers managed by Coolify.': '删除由 Coolify 管理的已停止容器。',
            'Deletes unused images and clears the build cache.': '删除未使用的镜像并清空构建缓存。',
            'Removes old Coolify helper images.': '删除旧的 Coolify 辅助镜像。',
            'May delete unused volumes or networks when those options are enabled.': '如果开了对应选项，还可能删除未使用的卷或网络。',
            'Run Docker Cleanup': '执行 Docker 清理',
            'Registry logins are read from the Docker config that deployments use. Use': '镜像仓库登录信息读取自部署所用的 Docker 配置。可以用',
            'on the server.': '（在服务器上执行）。',
            'Log drains': '日志收集',
            'Forward container logs from this server to one external destination.': '把这台服务器的容器日志转发到一个外部目的地。',
            'Not configured': '未配置',
            'Only one log drain can be active at a time. Disable the current destination before enabling another provider.': '同一时间只能启用一个日志收集。要换服务商，先停用当前的。',
            'Send logs through the New Relic Log API.': '通过 New Relic Log API 发送日志。',
            'License key': '许可证密钥',
            'Endpoint': '端点',
            'Use the EU or US New Relic Log API endpoint.': '使用欧盟或美国的 New Relic Log API 端点。',
            'Send logs to an Axiom dataset using its ingest API.': '通过 Axiom 的写入 API 把日志发到某个数据集。',
            'Dataset name': '数据集名称',
            'Send container logs directly to CloudWatch Logs using the Docker awslogs logging driver.': '用 Docker 的 awslogs 日志驱动，把容器日志直接发到 CloudWatch Logs。',
            'AWS credentials are read by the Docker daemon on this server, not by Coolify. Attach an IAM instance role, or configure': 'AWS 凭证由这台服务器上的 Docker 守护进程读取，而不是 Coolify。请绑定 IAM 实例角色，或者配置',
            'for the Docker service or in': '（给 Docker 服务），或者写在',
            'The credentials need': '凭证需要',
            ', plus': '，以及',
            'if the log group does not exist yet.': '（如果日志组还不存在）。',
            'Delivery errors do not stop containers; they appear in the Docker daemon logs (': '发送出错不会停掉容器，错误会出现在 Docker 守护进程日志里（',
            '). Redeploy or restart resources to apply the logging driver.': '）。重新部署或重启资源后，日志驱动才会生效。',
            'Log group': '日志组',
            'Log stream prefix': '日志流前缀',
            'Optional. Log streams are named after the container, prefixed with this value (e.g. docker/<container name>).': '可选。日志流按容器命名，前面加上这个前缀（例如 docker/<容器名>）。',
            'Custom Fluent Bit': '自定义 Fluent Bit',
            'Provide a custom Fluent Bit output and optional parser configuration.': '提供自定义的 Fluent Bit 输出配置，以及可选的解析器配置。',
            'Fluent Bit configuration': 'Fluent Bit 配置',
            'Parser configuration': '解析器配置',
            'Inspect recent CPU and memory usage reported by Sentinel.': '查看 Sentinel 上报的近期 CPU 和内存用量。',
            'Metrics are disabled': '指标未启用',
            'Enable metrics to begin collecting CPU and memory history for this server.': '启用指标后，开始收集这台服务器的 CPU 和内存历史。',
            'Control proxy traffic collection, retention, and visitor geolocation for this server.': '控制这台服务器的代理流量采集、保留时长和访客地理定位。',
            'Traffic analytics is disabled': '流量分析未启用',
            'Enable traffic analytics to collect proxy access logs and geolocate visitor traffic.': '启用流量分析后，会收集代理访问日志并定位访客地区。',
            'Restarting Sentinel and proxy...': '正在重启 Sentinel 和代理…',
            'Enable traffic analytics?': '启用流量分析？',
            'Application traffic may be interrupted while Sentinel and the proxy restart.': 'Sentinel 和代理重启期间，应用访问可能会中断。',
            'Enabling traffic analytics will restart Sentinel and the proxy. Your applications will experience a brief interruption.': '启用流量分析会重启 Sentinel 和代理，你的应用会短暂中断。',
            'Docker networks used to isolate and connect resources on this server.': '这台服务器上用来隔离和连接资源的 Docker 网络。',
            '+ Add': '+ 添加',
            'Patching': '补丁',
            'Terminal Access': '终端访问',
            'Discover and apply operating system package updates.': '发现并安装操作系统软件包更新。',
            'Last checked:': '上次检查：',
            'never': '从未',
            'Supported package managers': '支持的包管理器',
            'Automated package discovery currently supports apk, apt, dnf, pacman, and zypper. Automatic security updates are available for apt and dnf (Debian, Ubuntu, and RHEL family)': '自动发现软件包目前支持 apk、apt、dnf、pacman 和 zypper。自动安全更新只支持 apt 和 dnf（Debian、Ubuntu 和 RHEL 系）',
            '. Status notifications can be managed from': '。状态通知可以在这里管理：',
            'notification settings': '通知设置',
            'Shell': 'Shell',
            'Interactive shell (docker exec)': '交互式 Shell（docker exec）',
            'Console': '控制台',
            'Attach to the app process (docker attach)': '连接到应用进程（docker attach）',
            'connecting…': '正在连接…',
            '· Enter to send · Esc to cancel': '· Enter 发送 · Esc 取消',
            'paste': '粘贴',
            'copy': '复制',
            'Loading dynamic configurations': '正在加载动态配置',
            'Dynamic configurations loaded.': '动态配置已加载。',
            'New Dynamic Configuration': '新建动态配置',
            'Filename': '文件名',
            '(default)': '（默认）',
            'Delete TLS Certificate?': '删除 TLS 证书？',
            'The proxy keeps using the certificate until you restart it. If a route still uses the domain, Traefik requests a new certificate after the restart. You can restore the backup below to undo this.': '重启前代理会继续用这张证书。重启后如果还有路由用这个域名，Traefik 会重新申请证书。想撤销的话，可以恢复下面的备份。',
            'Save the current acme.json as a backup that you can restore below.': '把当前的 acme.json 存成备份，之后可以在下面恢复。',
            'Confirm by entering the domain': '输入域名以确认',
            'Delete Certificate': '删除证书'
        },

        // ---------- v1.0.2 新增：应用页（概览 / 访问 / 构建） ----------
        v45App: {
            'Running (no healthcheck)': '运行中（未配健康检查）',
            'Application status': '应用状态',
            'No links available': '没有可用链接',
            'Environment Variables': '环境变量',
            'Webhooks': 'Webhook',
            'Name the application and choose the build strategy Coolify should use to deploy it.': '给应用起名，并选择 Coolify 部署它时用的构建方式。',
            'Manage how this application is reached publicly, who can access it, and how it is reached from the Docker network.': '管理这个应用怎么被公网访问、谁能访问，以及在 Docker 网络里怎么访问它。',
            'No public domain configured': '没有配置公网域名',
            'Make this application available from a URL': '让这个应用可以通过网址访问',
            'HTTP Basic Authentication adds the required authentication labels to the proxy. Coolify currently supports a single username and password.': 'HTTP 基本认证会给代理加上认证标签。Coolify 目前只支持一组用户名和密码。',
            'HTTP Basic Authentication': 'HTTP 基本认证',
            'Exposed ports': '暴露端口',
            'Network aliases': '网络别名',
            'How Coolify builds the application, where it pushes the image, and the commands it runs around each deployment.': 'Coolify 怎么构建应用、镜像推到哪里，以及每次部署前后要执行的命令。',
            'Build strategy': '构建方式',
            'Nixpacks (deprecated)': 'Nixpacks（已弃用）',
            'Static': '静态',
            'Compose': 'Compose',
            'Base directory': '根目录',
            'Repository directory used as the build root. Useful for monorepos.': '作为构建根目录的仓库目录，适合一个仓库放多个项目的情况。',
            'Dockerfile location': 'Dockerfile 位置',
            'Path relative to the base directory.': '相对于根目录的路径。',
            'Resolved file:': '实际文件：',
            'Base directory is repeated': '根目录重复了',
            'Dockerfile location is relative to the base directory, so it should not start with': 'Dockerfile 位置是相对于根目录的，所以开头不要再写',
            'again.': '。',
            'Watch paths': '监听路径',
            'Order-based pattern matching to filter Git webhook deployments. Enter one pattern per line. Commas do not separate patterns. Supports wildcards (*, **, ?) and negation (!). Last matching pattern wins.': '按顺序匹配规则，筛选哪些 Git Webhook 推送会触发部署。每行一条，逗号不能分隔。支持通配符（*、**、?）和取反（!），以最后一条匹配的为准。',
            'Docker build stage target': 'Docker 构建阶段目标',
            'Useful if you have multi-staged dockerfile.': 'Dockerfile 是多阶段构建时有用。',
            'Builder selection': '构建机选择',
            'Deployment server': '部署服务器',
            'No build servers connected': '没有连接构建服务器',
            'Image registry': '镜像仓库',
            'Empty means it won\'t push the image to a docker registry. Pre-tag the image with your registry url if you want to push it to a private registry (default: Dockerhub).': '留空表示不推送镜像到镜像仓库。想推到私有仓库，就在镜像名前加上仓库地址（默认是 Docker Hub）。',
            'If set, it will tag the built image with this tag too.': '填了的话，构建出的镜像也会打上这个标签。',
            'Example: If you set it to \'latest\', it will push the image with the commit sha tag + with the latest tag.': '例如：填 latest，推送时会同时带上提交 SHA 标签和 latest 标签。',
            'Pre-deployment': '部署前',
            'An optional script or command to execute in the existing container before the deployment begins.': '可选：部署开始前，在现有容器里执行的脚本或命令。',
            'It is always executed with \'sh -c\', so you do not need add it manually.': '它总是用 sh -c 执行，不用自己加。',
            'Post-deployment': '部署后',
            'An optional script or command to execute in the newly built container after the deployment completes.': '可选：部署完成后，在新建的容器里执行的脚本或命令。',
            'Options and labels applied to the container when it starts.': '容器启动时应用的选项和标签。',
            'Custom Docker options': '自定义 Docker 选项',
            'You can add custom docker run options that will be used when your container is started.': '可以添加自定义的 docker run 选项，容器启动时会用上。',
            'Note: Not all options are supported, as they could mess up Coolify\'s automation and could cause bad experience for users.': '注意：并非所有选项都支持，有些会打乱 Coolify 的自动化，导致体验变差。',
            'Check the': '请查看',
            'docs.': '文档。',
            'Label management': '标签管理',
            'When Coolify manages the labels, they are regenerated automatically and manual edits can be lost.': '由 Coolify 管理标签时，标签会自动重新生成，手动改的可能会丢。',
            'If you edit them yourself, be careful: a wrong label set can break the proxy configuration after a restart (you can always reset to the Coolify defaults).': '自己改的话要小心：标签写错，重启后可能把代理配置搞坏（随时可以重置回 Coolify 默认值）。',
            'Managed by Coolify (auto-generated)': '由 Coolify 管理（自动生成）',
            'Managed manually (edit labels yourself)': '手动管理（自己编辑标签）',
            'Special characters': '特殊字符',
            'By default, $ (and other special characters) are escaped: writing $ saves it as $$.': '默认会转义 $ 等特殊字符：写 $ 会存成 $$。',
            'Keep them unescaped if you want to use environment variables inside the labels.': '想在标签里用环境变量，就保持不转义。',
            'Escape special characters ($ becomes $$)': '转义特殊字符（$ 变成 $$）',
            'Keep unescaped (allow env variables)': '不转义（允许用环境变量）',
            'Active labels': '当前生效的标签',
            'Reset to defaults': '恢复默认',
            'Run Docker Cleanup (remove unused images and builder cache).': '执行 Docker 清理（删除未使用的镜像和构建缓存）。',
            'Confirm Application Restart?': '确认重启应用？',
            'This application will be restarted without rebuilding.': '应用会直接重启，不重新构建。',
            'Ports the container exposes, host port mappings and internal network aliases.': '容器暴露的端口、映射到主机的端口，以及内网别名。',
            'Ports exposes': '暴露的端口',
            'A comma separated list of ports your application uses. The first port will be used as default healthcheck port if nothing defined in the Healthcheck menu. Be sure to set this correctly.': '应用用到的端口，用逗号分隔。健康检查里没填端口时，默认用第一个。一定要填对。',
            'You can also set a different internal port for each domain on the': '也可以给每个域名单独设置内部端口，在',
            'page.': '页面。',
            'Port mappings': '端口映射',
            'A comma separated list of ports you would like to map to the host system. Useful when you do not want to use domains.': '想映射到主机上的端口，用逗号分隔。不想用域名时有用。',
            'Rolling update is not supported if you have a port mapped to the host.': '映射了主机端口就不支持滚动更新。',
            'A comma separated list of custom network aliases you would like to add for container in Docker network.': '给容器在 Docker 网络里加的自定义别名，用逗号分隔。',
            'Confirm Labels Reset to Coolify Defaults?': '确认把标签重置为 Coolify 默认值？',
            'All your custom proxy labels will be lost.': '你自定义的代理标签会全部丢失。',
            'Proxy labels (traefik, caddy, etc) will be reset to the coolify defaults.': '代理标签（traefik、caddy 等）会重置为 Coolify 默认值。',
            'Please confirm the execution of the actions by entering the Application URL below': '请在下方输入应用地址，确认执行这些操作',
            'Application URL': '应用地址',
            'Permanently Reset Labels': '彻底重置标签'
        },

        // ---------- v1.0.2 新增：应用页（域名 / 环境变量 / 存储） ----------
        v45AppConfig: {
            'No domains configured': '没有配置域名',
            'Add your first domain with the Add domain button above, or generate one with the server wildcard domain.': '用上面的「添加域名」加第一个域名，或用服务器的通配域名生成一个。',
            'Maintenance mode': '维护模式',
            'Show a maintenance page with a 503 status on all domains of this resource. The containers keep running, and the change applies without a redeploy.': '在这个资源的所有域名上显示 503 维护页。容器照常运行，不用重新部署就生效。',
            'Off: serve the resource': '关闭：正常提供服务',
            'On: show the maintenance page': '开启：显示维护页',
            'Custom maintenance page (HTML)': '自定义维护页（HTML）',
            'One self-contained HTML file (max 1024 KB) with inline CSS and images.': '单个自包含的 HTML 文件（最大 1024 KB），CSS 和图片都内联。',
            'Hosts that still need DNS at your provider (working domains are omitted). Create matching Type / Name / Value records so traffic reaches this server.': '还需要在 DNS 服务商那里配置的主机（已经能用的域名不列出）。按类型 / 名称 / 值建好记录，流量才能到这台服务器。',
            'Nothing to configure': '无需配置',
            'No pending DNS entries. All listed domains already resolve correctly, or no domains are configured yet. Use Recheck after changing DNS.': '没有待配置的 DNS 记录：列出的域名都已正确解析，或者还没配置域名。改完 DNS 后可以点「重新检查」。',
            'Port is required': '需要填写端口',
            'The proxy cannot route this domain. Enter the port your container listens on in the Port field.': '代理无法路由这个域名。请在「端口」里填容器监听的端口。',
            'Search engine indexing': '搜索引擎收录',
            'Indexable': '允许收录',
            'www redirect': 'www 跳转',
            'Applies to all domains for this application.': '对这个应用的所有域名生效。',
            'No redirect': '不跳转',
            'Regenerate hostname': '重新生成主机名',
            'Redirect to www': '跳转到 www',
            'Redirect to non-www': '跳转到不带 www',
            'Environment variables': '环境变量',
            'Environment variables (secrets) for this resource.': '这个资源的环境变量（密钥）。',
            'Environment variable order': '环境变量顺序',
            'Controls how environment variables are ordered in the list and written to the generated .env file on deploy.': '控制环境变量在列表里的顺序，以及部署时写进 .env 文件的顺序。',
            'Build secrets': '构建密钥',
            'Docker BuildKit secrets keep values out of the final image for enhanced security during builds. Requires Docker 18.09+ with BuildKit support.': 'Docker BuildKit secrets 能让这些值不进入最终镜像，构建更安全。需要 Docker 18.09 以上并支持 BuildKit。',
            'Standard build arguments': '普通构建参数',
            'Docker BuildKit secrets': 'Docker BuildKit secrets',
            'Include Coolify default variables': '包含 Coolify 默认变量',
            'Environment values in logs': '日志里的环境变量值',
            'Hide all values': '隐藏全部值',
            'Hide locked values only': '只隐藏锁定的值',
            'User-defined': '自定义的',
            'All environments': '全部环境',
            'Production': '生产',
            'Preview': '预览',
            'Reset filters': '重置筛选',
            'Default order': '默认顺序',
            'Secret manager': '密钥管理器',
            'No secret manager tokens': '没有密钥管理器令牌',
            'Add a Doppler, Infisical, or HashiCorp Vault token first.': '先添加 Doppler、Infisical 或 HashiCorp Vault 的令牌。',
            'New Environment Variable': '新建环境变量',
            'to reference a shared environment variable': '可以引用共享环境变量',
            'Interpolation': '变量替换',
            'Literal means $VARIABLES in the value is kept as the actual characters \'$VARIABLES\' instead of being resolved from another variable. Useful when your value contains a $ sign.': '字面量的意思是：值里的 $VARIABLES 就按这几个字符原样保留，不会被替换成别的变量。值里本来就有 $ 时有用。',
            'Interpolate $VARIABLES': '替换 $VARIABLES',
            'Literal (keep $ characters as-is)': '字面量（$ 原样保留）',
            'Build time': '构建时',
            'Make this variable available during the Docker build process. Useful for build secrets and dependencies.': '让这个变量在 Docker 构建过程中可用，适合构建密钥和依赖。',
            'Available during build': '构建时可用',
            'Not available during build': '构建时不可用',
            'Make this variable available in the running container at runtime.': '让这个变量在运行中的容器里可用。',
            'Available in the container': '容器里可用',
            'Not available in the container': '容器里不可用',
            'Edit environment variable': '编辑环境变量',
            'Loading value...': '正在加载值…',
            'Confirm Environment Variable Deletion?': '确认删除环境变量？',
            'The selected environment variable will be permanently deleted.': '所选环境变量会被永久删除。',
            'Please confirm the execution of the actions by entering the Environment Variable Name below': '请在下方输入环境变量名，确认执行这些操作',
            'Environment Variable Name': '环境变量名',
            'Persistent storage': '持久存储',
            'Preview deployment volumes can use a -pr-#PRNumber suffix so each pull request receives isolated storage.': '预览部署的卷可以加 -pr-#PR编号 后缀，让每个拉取请求都有独立存储。',
            'No persistent storage': '没有持久存储',
            'Add a volume, file, or directory mount to preserve data between deployments.': '添加卷、文件或目录挂载，让数据在多次部署之间保留下来。',
            'Mount a Docker volume inside the container.': '把一个 Docker 卷挂进容器。',
            'Volume name.': '卷名称。',
            'Directory inside the container.': '容器里的目录。',
            'Add volume': '添加卷',
            'Create a managed file on the host and mount it inside the container.': '在主机上创建一个托管文件，并挂进容器。',
            'Host file path': '主机文件路径',
            'Host File Path': '主机文件路径',
            'File location inside the container': '容器里的文件位置',
            'File location inside the container.': '容器里的文件位置。',
            'Content': '内容',
            'Add file': '添加文件',
            'Bind an existing host file into the container. Coolify will not modify or delete the source file.': '把主机上现有的文件绑定进容器。Coolify 不会修改或删除源文件。',
            'Existing file on the host system.': '主机上已有的文件。',
            'Add host file': '添加主机文件',
            'Bind a directory from the host system into the container.': '把主机上的目录绑定进容器。',
            'Source Directory': '源目录',
            'Destination Directory': '目标目录',
            'Add directory': '添加目录'
        },

        // ---------- v1.0.2 新增：应用页（高级 / 日志 / 部署 / 文件） ----------
        v45AppAdvanced: {
            'How images are built, how deployments start, and how the repository is cloned.': '镜像怎么构建、部署怎么触发、仓库怎么克隆。',
            'Build cache': '构建缓存',
            'Disabling the cache forces a completely fresh Docker build on every deployment.': '关闭缓存后，每次部署都会从头完整构建。',
            'Use Docker build cache': '使用 Docker 构建缓存',
            'Rebuild from scratch every time': '每次都从头构建',
            'Build arguments': '构建参数',
            'When injected automatically, Coolify adds ARG statements to your Dockerfile for build-time variables. Manage them manually to preserve Docker build cache.': '自动注入时，Coolify 会为构建时变量往 Dockerfile 里加 ARG 语句。想保住构建缓存就手动管理。',
            'Inject build args automatically': '自动注入构建参数',
            'Managed manually in Dockerfile': '在 Dockerfile 里手动管理',
            'Source commit availability': '提交哈希可用范围',
            'SOURCE_COMMIT (git commit hash) is always available at runtime. Making it available during build invalidates the cache on every commit.': 'SOURCE_COMMIT（git 提交哈希）在运行时总是可用。让它在构建时也可用的话，每次提交都会让缓存失效。',
            'Runtime only (preserves cache)': '只在运行时（保住缓存）',
            'Automatic deployments from Git webhooks.': '由 Git Webhook 触发的自动部署。',
            'Auto deploy': '自动部署',
            'Automatically deploy new commits based on Git webhooks.': '根据 Git Webhook 自动部署新的提交。',
            'Deploy on push (webhooks)': '推送即部署（Webhook）',
            'Manual deployments only': '只手动部署',
            'Options applied while cloning the repository during builds.': '构建时克隆仓库用的选项。',
            'Submodules': '子模块',
            'Allow Git submodules during the build process.': '构建时允许拉取 Git 子模块。',
            'Clone submodules': '克隆子模块',
            'Skip submodules': '跳过子模块',
            'Git LFS': 'Git LFS',
            'Allow Git LFS during the build process.': '构建时允许使用 Git LFS。',
            'Clone depth': '克隆深度',
            'Shallow cloning (--depth=1) speeds up deployments by only fetching the latest commit, useful for large repositories.': '浅克隆（--depth=1）只拉最新一次提交，部署更快，适合大仓库。',
            'Shallow clone (latest commit only)': '浅克隆（只拉最新提交）',
            'Full history': '完整历史',
            'Naming, shutdown, logs, and GPU access for the deployed container.': '部署出的容器的命名、关闭方式、日志和 GPU 访问。',
            'Container naming': '容器命名',
            'Generated name (rolling updates)': '自动生成名字（支持滚动更新）',
            'Consistent name (no rolling updates)': '固定名字（不支持滚动更新）',
            'Container name prefix': '容器名前缀',
            'Optional prefix for generated container names. Containers are named': '可选：自动生成的容器名前缀。容器会被命名为',
            ', for example': '，例如',
            ', instead of starting with': '，而不是以这个开头：',
            'The prefix is converted to slug format when saved, can be up to 30 characters and must be unique on this server. Rolling updates keep working.': '保存时前缀会转成 slug 格式，最多 30 个字符，在这台服务器上不能重复。滚动更新照常可用。',
            'Shutdown and restart behavior for this application\'s containers.': '这个应用的容器怎么关闭、怎么重启。',
            'Stop grace period (seconds)': '停止宽限期（秒）',
            'Max restart count': '最大重启次数',
            'Maximum number of restarts before Coolify automatically stops the application and sends a notification. Saved automatically. Set to 0 to disable the limit.': '重启超过这个次数，Coolify 会自动停掉应用并发通知。自动保存。填 0 表示不限制。',
            'Forward container logs to an external endpoint.': '把容器日志转发到外部端点。',
            'Log drain': '日志收集',
            'Drain logs to the log drain endpoint configured in your Server settings.': '把日志发到服务器设置里配置的日志收集端点。',
            'Send logs to the log drain endpoint': '把日志发到日志收集端点',
            'Give this application access to the host\'s GPUs. More info': '允许这个应用使用主机的 GPU。更多信息',
            'Detected GPUs': '检测到的 GPU',
            'GPU access': 'GPU 访问',
            'How the proxy serves traffic for this application.': '代理怎么为这个应用转发流量。',
            'Gzip compression': 'Gzip 压缩',
            'Some services compress data by default. In that case you do not need this.': '有些服务默认就会压缩数据，那样就不需要开这个。',
            'Path prefixes': '路径前缀',
            'Strip Prefix removes prefixes from paths, like /api/ to /.': '去掉前缀会把路径里的前缀删掉，比如 /api/ 变成 /。',
            'Strip prefixes': '去掉前缀',
            'Keep paths as-is': '路径保持不变',
            'Traefik certificate resolver for this application\'s HTTPS routes. Choose': '这个应用 HTTPS 路由用的 Traefik 证书解析器。如果域名用的是 Traefik 动态配置里的证书（例如 Cloudflare Origin CA 证书），请选',
            'for domains that use certificates from Traefik\'s dynamic configuration (for example Cloudflare Origin CA certificates). Redeploy the application to apply the change.': '。改完要重新部署应用才生效。',
            'Server setting (letsencrypt)': '跟随服务器设置（letsencrypt）',
            'None (use your own certificates)': '无（用你自己的证书）',
            'Custom resolver': '自定义解析器',
            'Deployment history': '部署历史',
            'Search, filter, and open a deployment to inspect its build logs.': '搜索、筛选，点开某次部署查看构建日志。',
            'Manual': '手动',
            'Newest first': '最新的在前',
            'Oldest first': '最早的在前',
            'choose a container to start a session': '选择一个容器开始会话',
            'Browse and manage files inside the running container.': '浏览和管理运行中容器里的文件。',
            'Change permissions': '修改权限',
            'Set the octal permission mode for': '设置八进制权限：',
            'Octal mode': '八进制权限',
            'New name': '新名称',
            'Delete this item?': '删除这一项？',
            'Edit file': '编辑文件',
            'File name': '文件名',
            'Create file': '创建文件',
            'Folder name': '文件夹名',
            'Create folder': '创建文件夹',
            'Manual ·': '手动 ·',
            'Debug logs': '调试日志',
            'Copied and downloaded logs hide secrets.': '复制和下载的日志会隐去敏感信息。',
            'Copy visible logs': '复制当前显示的日志',
            'Download visible logs': '下载当前显示的日志',
            'Download full log (with debug)': '下载完整日志（含调试）'
        },

        // ---------- v1.0.2 新增：应用页（来源 / 健康检查 / 服务器 / 预览 / 计划任务等） ----------
        v45AppMore: {
            'Repository': '仓库',
            'Configure the Git repository, branch, and commit Coolify deploys.': '设置 Coolify 部署的 Git 仓库、分支和提交。',
            'Branch': '分支',
            'Commit SHA': '提交 SHA',
            'Switch the Git provider App Coolify uses to clone this repository.': '切换 Coolify 克隆这个仓库用的 Git App。',
            'GitHub · Personal account': 'GitHub · 个人账号',
            'No other sources available.': '没有其他可用的代码来源。',
            'Connect another source': '连接其他代码来源',
            'to switch providers.': '后即可切换。',
            'Define how Coolify determines whether this application is ready to receive traffic.': '设置 Coolify 怎么判断这个应用已经可以接收流量。',
            'Check type': '检查方式',
            'Container command': '容器命令',
            'Coolify sends this request from inside the container and evaluates the response.': 'Coolify 会在容器内部发这个请求，并检查返回结果。',
            'Scheme': '协议',
            'Uses the first exposed port when empty.': '留空则用第一个暴露端口。',
            'Expected code': '期望状态码',
            'Expected response text': '期望返回内容',
            'Leave empty when the response body does not need to contain specific text.': '返回内容不需要包含特定文字时留空。',
            'Control how quickly healthchecks start, repeat, and fail.': '控制健康检查多快开始、多久一次、多久算失败。',
            'Interval (seconds)': '间隔（秒）',
            'Timeout (seconds)': '超时（秒）',
            'Retries': '重试次数',
            'Start period (seconds)': '启动等待期（秒）',
            'Enable healthcheck?': '启用健康检查？',
            'If the healthcheck fails, your application will become inaccessible. Review the': '健康检查失败的话，应用会无法访问。继续之前请先看看',
            'Healthchecks guide': '健康检查指南',
            'before continuing.': '。',
            'Enable healthcheck for this resource.': '为这个资源启用健康检查。',
            'Enable healthcheck': '启用健康检查',
            'Primary server': '主服务器',
            'The default server and network used for this application\'s deployments.': '这个应用部署时默认用的服务器和网络。',
            'Primary': '主',
            'Open server': '打开服务器',
            'Add another server': '再加一台服务器',
            'Attach another available server and network as a deployment destination.': '再挂一台可用的服务器和网络，作为部署目标。',
            'Every usable server is already attached, or no additional server networks are configured.': '可用的服务器都已经挂上了，或者没有配置其他服务器网络。',
            'Preview settings': '预览设置',
            'Automatic pull request deployments and who can trigger them.': '拉取请求的自动部署，以及谁能触发。',
            'Enable preview deployments': '启用预览部署',
            'PR deployment access': 'PR 部署权限',
            'When public, anyone can trigger PR deployments. Otherwise only PRs from branches in the same repository are deployed and fork PRs are blocked.': '设为公开时任何人都能触发 PR 部署；否则只部署同一仓库分支发起的 PR，来自 fork 的 PR 会被拦下。',
            'Repository members only': '仅限仓库成员',
            'Public (fork PRs allowed)': '公开（允许 fork 的 PR）',
            'Preview URL template': '预览地址模板',
            'Define how Coolify generates domains for pull request deployments.': '设置 Coolify 怎么给拉取请求部署生成域名。',
            'Reset template': '重置模板',
            'Use {{ random }} for a random subdomain, {{ pr_id }} for the pull request number, or {{ domain }} for the application domain.': '用 {{ random }} 表示随机子域名，{{ pr_id }} 表示拉取请求编号，{{ domain }} 表示应用域名。',
            'Generated pattern': '生成的格式',
            'Preview deployments': '预览部署',
            'Manage domains, deployments, logs, and lifecycle actions for configured previews.': '管理已配置预览的域名、部署、日志和启停操作。',
            'No preview deployments': '没有预览部署',
            'Configure a pull request or manual preview to create an isolated deployment.': '配置一个拉取请求或手动预览，生成独立的部署。',
            'Pull requests': '拉取请求',
            'Load open pull requests from GitHub, then configure or deploy a preview.': '从 GitHub 加载未合并的拉取请求，然后配置或部署预览。',
            'Loading pull requests': '正在加载拉取请求',
            'No open pull requests': '没有未合并的拉取请求',
            'No open pull requests were found for this repository.': '这个仓库没有未合并的拉取请求。',
            'Run commands inside this resource automatically using a cron schedule.': '按 cron 计划，在这个资源里自动执行命令。',
            'No scheduled tasks': '没有计划任务',
            'Create a task to run maintenance commands, scripts, or recurring jobs automatically.': '创建任务，自动执行维护命令、脚本或周期性工作。',
            'New scheduled task': '新建计划任务',
            'Use every_minute, hourly, daily, weekly, monthly, yearly, or a cron expression.': '可以填 every_minute、hourly、daily、weekly、monthly、yearly，或 cron 表达式。',
            'Maximum execution time from 60 to 36,000 seconds.': '最长执行时间，60 到 36,000 秒。',
            'Leave empty when the resource only has one container.': '资源只有一个容器时留空。',
            'Trigger a deployment from an external service. Requests must include a valid Coolify API authorization token.': '从外部服务触发部署。请求里必须带有效的 Coolify API 认证令牌。',
            'Enable API access before external services can call the deploy webhook.': '先开启 API 访问，外部服务才能调用部署 Webhook。',
            'Deploy webhook URL': '部署 Webhook 地址',
            'Manual repository webhooks are only required when a repository is not connected through an official Git App.': '只有仓库没通过官方 Git App 连接时，才需要手动配置仓库 Webhook。',
            'Managed by your Git App': '由你的 Git App 管理',
            'This application uses an official Git App, so Coolify configures repository webhooks automatically.': '这个应用用的是官方 Git App，Coolify 会自动配置仓库 Webhook。',
            'Create a copy of this resource. Choose where it runs and where it belongs. The current values are selected by default.': '复制一份这个资源。选择它跑在哪、归到哪，默认选中当前值。',
            'Configuration only': '只复制配置',
            'Cloning copies settings, environment variables, and resource configuration. Stored files, database records, and other persistent data are not copied.': '克隆会复制设置、环境变量和资源配置；存储的文件、数据库记录和其他持久数据不会复制。',
            'Network destination': '网络目标',
            'No network destinations are available on this server.': '这台服务器上没有可用的网络目标。',
            'Transfer this resource to another project environment without changing the running deployment.': '把这个资源转到别的项目环境，运行中的部署不受影响。',
            'The current environment is excluded.': '当前环境不在列表里。',
            'Limit CPU capacity, affinity, and scheduling priority for this container.': '限制这个容器的 CPU 用量、绑定的核心和调度优先级。',
            'Docker CPU constraints': 'Docker CPU 限制',
            'CPU limit': 'CPU 上限',
            'Set to 0 to use all available CPUs. Decimal values such as 0.5 are supported.': '填 0 表示可以用全部 CPU，支持 0.5 这样的小数。',
            'CPU set': 'CPU 核心',
            'Restrict execution to specific cores, for example 0-2 or 0,1,3. Leave empty for all cores.': '只在指定核心上运行，例如 0-2 或 0,1,3。留空表示全部核心。',
            'CPU weight': 'CPU 权重',
            'Relative CPU scheduling weight. Docker uses 1024 by default.': '相对的 CPU 调度权重，Docker 默认是 1024。',
            'Memory': '内存',
            'Set hard and soft memory limits, swap allowance, and swappiness.': '设置内存硬上限、软预留、交换空间和 swappiness。',
            'Memory reservation': '内存预留',
            'Soft reservation used when the host is under memory pressure. Use values such as 256m or 1g.': '主机内存紧张时的软预留，填 256m 或 1g 这样的值。',
            'Memory limit': '内存上限',
            'Maximum memory available to the container. Set to 0 for unlimited.': '容器最多能用的内存，填 0 表示不限。',
            'Memory and swap limit': '内存加交换空间上限',
            'Combined memory and swap allowance. Use values such as 512m or 2g.': '内存和交换空间加起来的上限，填 512m 或 2g 这样的值。',
            'Swappiness': 'Swappiness',
            'Controls how aggressively anonymous memory is swapped. Enter a value from 0 to 100.': '控制匿名内存换出到交换空间的积极程度，填 0 到 100。',
            'Accepted units are': '可用的单位有',
            ', and': '和',
            'Rollback images': '回滚镜像',
            'Keep previously built Docker images available for fast rollbacks. Rollback uses an existing image without rebuilding the application. Images in the Docker registry are pulled to the server first.': '保留之前构建的 Docker 镜像，方便快速回滚。回滚直接用现成镜像，不重新构建；镜像仓库里的镜像会先拉到服务器上。',
            'Images to keep': '保留镜像数',
            'Set to 0 to keep only the running image. Pull request images are always removed during cleanup.': '填 0 表示只保留正在运行的镜像。拉取请求的镜像清理时总会被删除。',
            'Loading available images': '正在加载可用镜像',
            'Organize this resource with reusable team tags. Separate multiple tag names with spaces.': '用可复用的团队标签整理这个资源，多个标签用空格分隔。',
            'Tag names': '标签名',
            'Existing tags are assigned automatically. New names create team tags.': '已有的标签会直接关联，新名字会创建新的团队标签。',
            'Assigned tags': '已关联的标签',
            'Tags currently attached to this resource.': '这个资源当前关联的标签。',
            'No tags assigned': '没有关联标签',
            'Add a tag above or select one from your team\'s available tags.': '在上面添加一个标签，或从团队已有标签里选。',
            'Destructive resource actions cannot be undone.': '针对资源的危险操作无法撤销。',
            'Delete application': '删除应用',
            ', stop its containers, and remove the selected Docker resources and configuration.': '，停止它的容器，并删除所选的 Docker 资源和配置。',
            '• Active deployments will be stopped.': '• 进行中的部署会被停止。',
            '• Selected volumes and stored data may be permanently removed.': '• 所选的卷和存储的数据可能会被永久删除。',
            '• This application cannot be restored from Coolify after deletion.': '• 删除后无法在 Coolify 里恢复这个应用。',
            'Delete application?': '删除应用？',
            'Permanently delete all volumes associated with this resource.': '永久删除与这个资源相关的所有卷。',
            'Permanently delete all non-predefined networks associated with this resource.': '永久删除与这个资源相关的所有非预定义网络。',
            'Permanently delete all configuration files from the server.': '从服务器上永久删除所有配置文件。',
            'Permanently delete this resource and its selected Docker resources.': '永久删除这个资源以及所选的 Docker 资源。',
            'Enter the resource name to confirm permanent deletion': '输入资源名称，确认永久删除',
            'Resource name': '资源名称',
            'Inspect CPU and memory usage for this application.': '查看这个应用的 CPU 和内存用量。',
            'Metrics are not enabled': '指标未启用',
            'Enable metrics for this server before collecting application usage data.': '先为这台服务器启用指标，才能收集应用用量数据。'
        },

        // ---------- v1.0.2 新增：新建资源页（只翻界面，不翻服务模板目录） ----------
        v45NewResource: {
            'Choose a resource': '选择资源类型',
            'All resources': '全部资源',
            'All categories': '全部分类',
            'Deploy canvas': '部署画布',
            'Connect a server, a source, and its settings step by step, then deploy every resource at once.': '一步步连好服务器、代码来源和设置，然后一次性部署所有资源。',
            'Loading resources': '正在加载资源',
            'Public Git Repository': '公开 Git 仓库',
            'Git source': 'Git 来源',
            'Deploy any public Git repository. Coolify builds it from source, no credentials required.': '部署任意公开 Git 仓库，Coolify 从源码构建，不需要凭证。',
            'Private Git Repository (with Deploy Key)': '私有 Git 仓库（用部署密钥）',
            'Deploy a private repository over SSH with a repository-scoped deploy key. Set the URL and branch manually, no automatic deploys.': '用仓库专属的部署密钥通过 SSH 部署私有仓库。地址和分支手动填，不会自动部署。',
            'Git Repository (with GitHub App)': 'Git 仓库（用 GitHub App）',
            'Deploy public or private GitHub repositories through a GitHub App, with automatic webhooks and pull request previews.': '通过 GitHub App 部署公开或私有的 GitHub 仓库，自动配置 Webhook，支持拉取请求预览。',
            'Git Repository (with GitLab App)': 'Git 仓库（用 GitLab App）',
            'Deploy public or private GitLab projects through a GitLab App, with automatic webhooks and merge request previews.': '通过 GitLab App 部署公开或私有的 GitLab 项目，自动配置 Webhook，支持合并请求预览。',
            'Git Repository (with Gitea App)': 'Git 仓库（用 Gitea App）',
            'Deploy public or private Gitea repositories through a Gitea App, with automatic webhooks and pull request previews.': '通过 Gitea App 部署公开或私有的 Gitea 仓库，自动配置 Webhook，支持拉取请求预览。',
            'Docker source': 'Docker 来源',
            'Deploy an application using a Dockerfile, without a Git repository.': '用 Dockerfile 部署应用，不需要 Git 仓库。',
            'Deploy a multi-container application using a Docker Compose file, without a Git repository.': '用 Docker Compose 文件部署多容器应用，不需要 Git 仓库。',
            'Docker Image': 'Docker 镜像',
            'Deploy an application using a prebuilt image from any Docker registry, without a Git repository.': '用任意镜像仓库里的现成镜像部署应用，不需要 Git 仓库。',
            'A relational database with strong SQL standards support and extensibility.': '关系型数据库，SQL 标准支持好、扩展性强。',
            'Website': '官网',
            'A relational database for web and general-purpose applications.': '适合网站和通用应用的关系型数据库。',
            'A relational database and drop-in replacement for MySQL.': '关系型数据库，可以直接替代 MySQL。',
            'An in-memory key-value store used as a database, cache, and message broker.': '内存键值存储，可当数据库、缓存和消息队列用。',
            'A multithreaded, Redis-compatible in-memory store.': '多线程、兼容 Redis 的内存存储。',
            'An in-memory datastore compatible with Redis and Memcached.': '兼容 Redis 和 Memcached 的内存数据存储。',
            'A document-oriented NoSQL database that stores JSON-like documents.': '面向文档的 NoSQL 数据库，存类似 JSON 的文档。',
            'A column-oriented database for real-time analytics over large datasets.': '列式数据库，适合对大数据集做实时分析。',
            'Experimental': '实验性',
            'A lightweight relational database stored in a single file.': '存在单个文件里的轻量关系型数据库。',
            'Trademarks policy': '商标说明',
            'The respective trademarks mentioned here are owned by the respective companies, and use of them does not imply any affiliation or endorsement.': '这里提到的商标归各自公司所有，使用它们不代表任何隶属或背书关系。'
        }
    };

    // =========================================================================
    // 二、属性字典（placeholder / title / aria-label 专用，同样完全匹配）
    //    只碰这三个纯展示属性；绝不碰 value / name / id 等功能属性。
    // =========================================================================
    var ATTR_DICT = {
        'placeholder': {
            'Search resources': '搜索资源',
            'Name': '名称',
            'Email': '邮箱',
            'Password': '密码',
            'New Password': '新密码',
            'Confirm Password': '确认密码',
            'Search': '搜索',
            'Select a private key': '选择私钥',
            'Select a token': '选择令牌',
            'Select a repository': '选择仓库',
            'Select a region': '选择区域',
            'Select a plan': '选择套餐',
            'Select an operating system': '选择操作系统',
            'Select an image': '选择镜像',
            'Select S3 storages': '选择 S3 存储',
            'Choose a project…': '选择项目…',
            'Choose a server…': '选择服务器…',
            'Choose a destination…': '选择部署目标…',
            'Choose an environment…': '选择环境…',
            'Filter targets…': '筛选目标…',
            'Find in logs': '在日志中查找',
            'Optional note': '备注（可选）',
            'Leave empty to use the image default.': '留空则使用镜像默认值。',
            'If empty, it will match the username.': '留空则与用户名一致。',
            'If empty, it will match the normal user.': '留空则与普通用户一致。',
            'Enter your password': '输入密码',
            'Search backups': '搜索备份',
            'Search services or domains': '搜索服务或域名',
            'Paste the provider token': '粘贴云服务商令牌',
            'production': 'production',
            'latest': 'latest',
            // ---- v1.0.2 新增（4.5.0） ----
            'Search resources, paths, everything (type new for create)...': '搜索资源、路径、所有内容（输入 new 新建）…',
            'Your project name': '项目名称',
            'A short project description': '一句话描述项目',
            'minio.internal or 192.168.1.50': '例如 minio.internal 或 192.168.1.50',
            'Personal account when empty': '留空则用个人账号',
            'A short summary of your feedback': '用一句话概括你的反馈',
            'What were you trying to do, what happened, and what would you like to see instead?': '你当时想做什么、发生了什么、希望它怎样？',
            'Search projects': '搜索项目',
            'Search sources': '搜索代码来源',
            'All accessible repositories when empty': '留空则为所有可访问的仓库',
            'Search destinations': '搜索部署目标',
            'Search servers…': '搜索服务器…',
            'Search servers': '搜索服务器',
            'Search variables': '搜索变量',
            'Search members': '搜索成员',
            'Search activity': '搜索活动记录',
            'Search users': '搜索用户',
            'Production Hetzner token': '例如：生产环境 Hetzner 令牌',
            'Optional notes about where this token is used': '可选：备注这个令牌用在哪里',
            'Production DNS': '例如：生产环境 DNS',
            'CI deployment token': '例如：CI 部署令牌',
            'Search timezones': '搜索时区',
            'Login with SSO': '使用 SSO 登录',
            'Filter servers…': '筛选服务器…',
            'Filter targets': '筛选目标',
            'Leave empty to use the Coolify default error page.': '留空则使用 Coolify 默认错误页。',
            'Search resources by name': '按名称搜索资源',
            'Search images by repository, tag or ID': '按仓库、标签或 ID 搜索镜像',
            'weekly (default, on Sunday)': 'weekly（默认，每周日）',
            'Send a command to the process…': '向进程发送命令…',
            'Leave empty to use the Coolify default maintenance page.': '留空则使用 Coolify 默认维护页。',
            'Search environment variables': '搜索环境变量',
            'e.g. my-api': '例如 my-api',
            'Search deployments': '搜索部署',
            'Database cleanup': '例如：数据库清理',
            'Search environments': '搜索环境'
        },
        'title': {
            'Toggle sidebar': '折叠 / 展开侧栏',
            'Open sidebar': '打开侧栏',
            'Scroll tabs left': '向左滚动标签',
            'Scroll tabs right': '向右滚动标签',
            'Back to the main menu': '返回主菜单',
            'You do not have permission to perform this action.': '你没有权限执行此操作。'
        },
        'aria-label': {
            'Toggle sidebar': '折叠 / 展开侧栏',
            'Open sidebar': '打开侧栏',
            'Scroll tabs left': '向左滚动标签',
            'Scroll tabs right': '向右滚动标签'
        },
        // 'any'：title / aria-label / placeholder 通用（v1.0.2 新增，4.5.0）
        'any': {
            'Dismiss real-time connection warning': '关闭实时连接警告',
            'Dismiss sponsorship reminder': '关闭赞助提醒',
            'Dismiss notifications reminder': '关闭通知提醒',
            'Press Tab to switch between global search and this page': '按 Tab 在全局搜索和本页搜索之间切换',
            'Search scope': '搜索范围',
            'No upgrade available': '没有可用升级',
            'Switch team': '切换团队',
            'Navigation menu': '导航菜单',
            'Close menu': '关闭菜单',
            'Search (Press / or Ctrl+K)': '搜索（按 / 或 Ctrl+K）',
            'Custom theme color': '自定义主题色',
            'Custom theme mode': '自定义主题模式',
            'Table view': '表格视图',
            'Grid view': '网格视图',
            'Canvas view (beta): see everything and how it connects': '画布视图（测试版）：看到所有东西以及它们怎么连接',
            'More information': '更多说明',
            'Toggle password visibility': '显示 / 隐藏密码',
            'Copy to clipboard': '复制到剪贴板',
            'Clear search': '清除搜索',
            'Items per page': '每页条数',
            'Custom items per page': '自定义每页条数',
            'Previous page': '上一页',
            'Next page': '下一页',
            'Search this page and everything (Press / or Ctrl+K, then Tab to switch)': '搜索本页和全部内容（按 / 或 Ctrl+K，再按 Tab 切换）',
            'This account is not protected by two-factor authentication.': '这个账号没有两步验证保护。',
            'Copy MCP endpoint': '复制 MCP 端点',
            'OAuth providers': 'OAuth 提供方',
            'Switch server': '切换服务器',
            'Refresh status': '刷新状态',
            'More actions': '更多操作',
            'Server configuration sections': '服务器配置分区',
            'Filter terminal targets': '筛选终端目标',
            'Clear target filter': '清除目标筛选',
            'Switch project': '切换项目',
            'Switch environment': '切换环境',
            'Switch resource': '切换资源',
            'Editor content': '编辑器内容',
            'Searching resources...': '正在搜索资源…',
            'Search images': '搜索镜像',
            'Choose terminal mode': '选择终端模式',
            'Choose terminal theme': '选择终端主题',
            'Console command': '控制台命令',
            'Send (Enter) · Clear input (Esc) · Clear output (Ctrl+L)': '发送（Enter）· 清空输入（Esc）· 清空输出（Ctrl+L）',
            'Exit fullscreen': '退出全屏',
            'Fullscreen': '全屏',
            'Copy details': '复制详情',
            'About unconfigured healthchecks': '关于未配置的健康检查',
            'Open application links': '打开应用链接',
            'Configuration sections': '配置分区',
            'Add an application domain': '添加应用域名',
            'DNS entries for this server': '这台服务器的 DNS 记录',
            'Recheck DNS': '重新检查 DNS',
            'Copy value': '复制值',
            'Loading environment variables...': '正在加载环境变量…',
            'Stream Logs': '实时日志',
            'Refresh Logs': '刷新日志',
            'Follow Logs': '跟随最新日志',
            'Minimize': '最小化',
            'Number of lines (max 50,000; use -1 for all)': '行数（最多 50,000；填 -1 表示全部）',
            'Show all logs': '显示全部日志',
            'Loading all logs': '正在加载全部日志',
            'View Options': '显示选项',
            'Copy or Download Logs': '复制或下载日志',
            'Filtering deployments...': '正在筛选部署…',
            'Loading deployments...': '正在加载部署…',
            'Loading deployment logs...': '正在加载部署日志…',
            'Loading debug logs...': '正在加载调试日志…',
            'Terminal input': '终端输入',
            'Upload a file to this folder': '上传文件到这个文件夹',
            'Refresh this folder': '刷新这个文件夹',
            'Edit permissions': '修改权限',
            'Loading private key editor': '正在加载私钥编辑器',
            'Search deployments': '搜索部署',
            'Search members': '搜索成员',
            'Search activity': '搜索活动记录',
            'Search users': '搜索用户',
            'Search sources': '搜索代码来源',
            'Search destinations': '搜索部署目标',
            'Search environment variables': '搜索环境变量',
            'Search resources by name': '按名称搜索资源',
            'Find in logs': '在日志中查找'
        }
    };

    // =========================================================================
    // 二点五、按位置区分译法 / 属性句式规则（v1.0.2）
    // -------------------------------------------------------------------------
    // CONTEXT_DICT：同一个英文在不同位置要用不同译法时用它，优先于 DICT。
    //   inside   : 文字节点的祖先命中 sel 时的译法
    //   otherwise: 其余位置的译法
    // PATTERNS：只用于 placeholder / title / aria-label，整句匹配。
    //   精确词典查不到时才轮到它；{1} 处的内容先查正文词典，查不到原样保留
    //   （多半是你的资源名、服务器名，本来就不该翻）。
    // =========================================================================
    var CONTEXT_DICT = {
        'Email': { sel: 'a, nav, [role="tab"], [role="menuitem"]', inside: '邮件', otherwise: '邮箱' }
    };

    var PATTERNS = [
        { re: /^More information about (.+)$/, out: '关于「{1}」的说明' },
        { re: /^Back to the (.+) menu$/, out: '返回「{1}」菜单' },
        { re: /^Account menu for (.+)$/, out: '{1} 的账号菜单' },
        { re: /^Team: (.+)$/, out: '团队：{1}' },
        { re: /^Server status: (.+)$/, out: '服务器状态：{1}' },
        { re: /^Open settings for (.+)$/, out: '打开「{1}」的设置' },
        { re: /^Shared variables for (.+)$/, out: '「{1}」的共享变量' },
        { re: /^Add resource to (.+)$/, out: '向「{1}」添加资源' },
        { re: /^Edit (.+)'s key$/, out: '编辑 {1} 的密钥' },
        { re: /^(.+) topic ID$/, out: '「{1}」的话题 ID' },
        { re: /^Open (.+)$/, out: '打开 {1}' }
    ];

    // =========================================================================
    // 三、基础工具
    // =========================================================================

    var SCRIPT_TAG = '[coolify-zh]';
    var logCount = 0; // 已打印条数，上限 LOG_LIMIT 见文件顶部配置常量区

    // 统一日志：出错位置 + 堆栈 + 关键变量。禁止空 catch。
    function log(where, err, extra) {
        try {
            if (logCount >= LOG_LIMIT) { return; }
            logCount++;
            console.warn(SCRIPT_TAG + ' 出错 @ ' + where +
                (extra !== undefined ? ' | 关键变量: ' + extra : ''), err && err.stack ? err.stack : err);
        } catch (logErr) {
            // 日志本身失败时只能静默（不能再抛，否则破坏页面脚本）。不做任何其他事。
        }
    }

    // localStorage 读写：隐私模式等场景会抛异常，全部 try-catch，读不到默认中文。
    var LS_KEY = 'coolifyZh.lang'; // 只存这一个值：'zh' 或 'en'

    function loadLang() {
        try {
            var v = window.localStorage.getItem(LS_KEY);
            if (v === 'en') { return 'en'; }
            return 'zh'; // 读不到 / 值不认识 → 默认中文
        } catch (err) {
            log('loadLang', err, 'localStorage 不可用，默认 zh');
            return 'zh';
        }
    }

    function saveLang(v) {
        try {
            window.localStorage.setItem(LS_KEY, v);
        } catch (err) {
            log('saveLang', err, 'v=' + v);
        }
    }

    // 合并主字典 → 一个 Map（英文 key 精确匹配）
    var WORD_MAP = new Map();
    (function buildWordMap() {
        try {
            Object.keys(DICT).forEach(function (group) {
                var table = DICT[group];
                Object.keys(table).forEach(function (en) {
                    WORD_MAP.set(en, table[en]);
                });
            });
        } catch (err) {
            log('buildWordMap', err);
        }
    })();

    var ATTR_MAPS = (function () {
        var m = {};
        try {
            Object.keys(ATTR_DICT).forEach(function (attr) {
                var table = ATTR_DICT[attr];
                var map = new Map();
                Object.keys(table).forEach(function (en) { map.set(en, table[en]); });
                m[attr] = map;
            });
        } catch (err) {
            log('ATTR_MAPS', err);
        }
        return m;
    })();

    // =========================================================================
    // 四、扫描与翻译
    // =========================================================================

    var currentLang = loadLang();

    // 翻译记录：切回英文时「原样还原」。
    // WeakMap：节点从 DOM 移除后自动可回收，不会内存泄漏。
    // v1.0.2：记录里同时存「原文」和「本脚本写进去的译文」，
    //         还原时只在节点仍是那段译文时才还原，页面自己改过的不动。
    var origText = new WeakMap();   // TextNode -> { orig: 原文, zh: 译文 }
    var origAttr = new WeakMap();   // Element  -> { placeholder: {orig, zh}, title: {...}, 'aria-label': {...} }

    // 绝不进入的元素：代码 / 日志 / 终端 / 编辑器 / 用户数据
    var SKIP_TAGS = { 'SCRIPT': 1, 'STYLE': 1, 'CODE': 1, 'PRE': 1, 'TEXTAREA': 1, 'INPUT': 1, 'SELECT': 1, 'KBD': 1, 'SAMP': 1, 'NOSCRIPT': 1 };
    var SKIP_SEL = 'pre, code, kbd, samp, textarea, input, select, script, style, .font-mono, .coolify-monaco-editor, .monaco-editor, .xterm, [contenteditable="true"], .logs-viewer-viewport, .font-logs';
    // 属性的跳过区（v1.0.2）：输入框本身的 placeholder 要翻，所以不排除 input / textarea / select；
    // 只排除编辑器、终端、日志区和本脚本自己的按钮。
    var ATTR_SKIP_TAGS = { 'SCRIPT': 1, 'STYLE': 1, 'NOSCRIPT': 1 };
    var ATTR_SKIP_SEL = '.coolify-monaco-editor, .monaco-editor, .xterm, [contenteditable="true"], .logs-viewer-viewport, .font-logs, #' + BTN_ID;
    var ATTR_NAMES = ['placeholder', 'title', 'aria-label'];
    var ATTR_QUERY = '[placeholder], [title], [aria-label]';

    function inSkipZone(node) {
        try {
            var el = node.parentElement;
            if (!el) { return true; }
            if (SKIP_TAGS[el.tagName]) { return true; }
            if (el.closest && el.closest(SKIP_SEL)) { return true; }
            return false;
        } catch (err) {
            log('inSkipZone', err);
            return true; // 判断不了就跳过，宁可不翻
        }
    }

    function inAttrSkipZone(el) {
        try {
            if (ATTR_SKIP_TAGS[el.tagName]) { return true; }
            if (el.closest && el.closest(ATTR_SKIP_SEL)) { return true; }
            return false;
        } catch (err) {
            log('inAttrSkipZone', err, el && el.tagName);
            return true;
        }
    }

    // 正文查词：先看按位置区分的 CONTEXT_DICT，再查主词典。查不到返回 null。
    function lookupText(trimmed, node) {
        try {
            var ctx = CONTEXT_DICT[trimmed];
            if (ctx) {
                var el = node.parentElement;
                var hit = !!(el && el.closest && el.closest(ctx.sel));
                return hit ? ctx.inside : ctx.otherwise;
            }
            return WORD_MAP.has(trimmed) ? WORD_MAP.get(trimmed) : null;
        } catch (err) {
            log('lookupText', err, JSON.stringify(trimmed.slice(0, 40)));
            return null;
        }
    }

    // 属性查词：属性专属词典 → 通用属性词典（any）→ 正文词典 → 句式规则。查不到返回 null。
    function lookupAttr(attr, trimmed) {
        try {
            var own = ATTR_MAPS[attr];
            if (own && own.has(trimmed)) { return own.get(trimmed); }
            var any = ATTR_MAPS['any'];
            if (any && any.has(trimmed)) { return any.get(trimmed); }
            if (WORD_MAP.has(trimmed)) { return WORD_MAP.get(trimmed); }
            for (var i = 0; i < PATTERNS.length; i++) {
                var m = PATTERNS[i].re.exec(trimmed);
                if (m) {
                    var part = m[1].trim();
                    var partZh = WORD_MAP.has(part) ? WORD_MAP.get(part) : part;
                    return PATTERNS[i].out.replace('{1}', partZh);
                }
            }
            return null;
        } catch (err) {
            log('lookupAttr', err, attr + '=' + JSON.stringify(trimmed.slice(0, 40)));
            return null;
        }
    }

    // 翻一个文字节点。返回值：1=已翻译 2=已还原 0=无动作
    function translateTextNode(node) {
        if (!node || node.nodeType !== 3) { return 0; }
        if (inSkipZone(node)) { return 0; }
        var raw = node.nodeValue;
        if (!raw) { return 0; }

        if (currentLang === 'zh') {
            var trimmed = raw.trim();
            if (!trimmed || trimmed.length > 200) { return 0; }
            // 快速预检：不含 ASCII 字母就不可能是英文 key（只在中文模式下用；
            // v1.0.1 把它放在两种模式共用的位置，导致中文译文永远走不到还原分支）
            if (!/[A-Za-z]/.test(trimmed)) { return 0; }
            var zh = lookupText(trimmed, node);
            if (zh === null) { return 0; }
            var lead = raw.slice(0, raw.length - raw.trimStart().length);
            var tail = raw.slice(raw.trimEnd().length);
            var written = lead + zh + tail;
            // 每次都刷新记录：此刻节点里是英文，说明这就是页面当前的原文
            origText.set(node, { orig: raw, zh: written });
            node.nodeValue = written;
            return 1;
        }

        // en 模式：只还原「仍是本脚本写入的译文」的节点
        var rec = origText.get(node);
        if (!rec) { return 0; }
        origText.delete(node);
        if (node.nodeValue === rec.zh) {
            node.nodeValue = rec.orig;
            return 2;
        }
        return 0; // 页面已经自己改写过这个节点，保持页面的值
    }

    // 翻一个元素的展示属性（只碰 placeholder / title / aria-label）
    function translateAttrs(el) {
        try {
            if (!el || el.nodeType !== 1) { return 0; }
            if (inAttrSkipZone(el)) { return 0; }
            var changed = 0;
            for (var i = 0; i < ATTR_NAMES.length; i++) {
                var attr = ATTR_NAMES[i];
                if (!el.hasAttribute(attr)) { continue; }
                var val = el.getAttribute(attr);
                if (!val) { continue; }
                if (currentLang === 'zh') {
                    var trimmed = val.trim();
                    if (!trimmed || trimmed.length > 200 || !/[A-Za-z]/.test(trimmed)) { continue; }
                    var zh = lookupAttr(attr, trimmed);
                    if (zh === null || zh === val) { continue; }
                    if (!origAttr.has(el)) { origAttr.set(el, {}); }
                    origAttr.get(el)[attr] = { orig: val, zh: zh };
                    el.setAttribute(attr, zh);
                    changed++;
                } else if (origAttr.has(el)) {
                    var bag = origAttr.get(el);
                    if (!(attr in bag)) { continue; }
                    var rec = bag[attr];
                    delete bag[attr];
                    if (val === rec.zh) {
                        el.setAttribute(attr, rec.orig);
                        changed++;
                    }
                }
            }
            // 全部还原完就清掉记录，避免残留
            if (currentLang === 'en' && origAttr.has(el)) {
                var leftover = origAttr.get(el);
                var empty = true;
                for (var k in leftover) { if (Object.prototype.hasOwnProperty.call(leftover, k)) { empty = false; break; } }
                if (empty) { origAttr.delete(el); }
            }
            return changed;
        } catch (err) {
            log('translateAttrs', err, el && el.tagName);
            return 0;
        }
    }

    // 扫描一个子树里所有带展示属性的元素（含根元素自身）
    function scanAttrs(root) {
        try {
            if (!root) { return; }
            if (root.nodeType === 1 && root.matches && root.matches(ATTR_QUERY)) { translateAttrs(root); }
            if (!root.querySelectorAll) { return; }
            var list = root.querySelectorAll(ATTR_QUERY);
            for (var i = 0; i < list.length; i++) { translateAttrs(list[i]); }
        } catch (err) {
            log('scanAttrs', err, root && root.nodeName);
        }
    }

    // 全页 / 指定根扫描
    function scan(root) {
        if (currentLang !== 'zh' && currentLang !== 'en') { return; }
        var target = root || document;
        try {
            var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
                acceptNode: function (n) {
                    if (!n.nodeValue || !n.nodeValue.trim()) { return NodeFilter.FILTER_REJECT; }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            // 收集后统一处理，避免处理途中改动树导致遍历异常
            var batch = [];
            var n = walker.nextNode();
            while (n) { batch.push(n); n = walker.nextNode(); }
            for (var i = 0; i < batch.length; i++) {
                try { translateTextNode(batch[i]); } catch (err) { log('scan:text', err, JSON.stringify(batch[i].nodeValue && batch[i].nodeValue.slice(0, 40))); }
            }
            // 属性单独扫（v1.0.2：输入框没有文字子节点，旧做法扫不到它们的 placeholder）
            scanAttrs(target === document ? document.documentElement : target);
        } catch (err) {
            log('scan', err);
        }
    }

    function scanNewSubtree(mutations) {
        try {
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (m.type === 'characterData' && m.target) {
                    translateTextNode(m.target);
                }
                if (m.type === 'childList') {
                    // 新增子树
                    for (var j = 0; j < m.addedNodes.length; j++) {
                        var added = m.addedNodes[j];
                        if (added.nodeType === 3) {
                            translateTextNode(added);
                            if (added.parentElement) { translateAttrs(added.parentElement); }
                        } else if (added.nodeType === 1) {
                            scan(added); // 文字 + 属性（含 added 自身）一起扫
                        }
                    }
                    // 被改属性的直接元素
                    if (m.target && m.target.nodeType === 1) {
                        translateAttrs(m.target);
                    }
                }
                if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
                    translateAttrs(m.target);
                }
            }
        } catch (err) {
            log('scanNewSubtree', err);
        }
    }

    // =========================================================================
    // 五、MutationObserver：增量处理 + 防自触发 + 去抖
    // -------------------------------------------------------------------------
    // v1.0.1 性能修复：v1.0.0 的回调把 records 直接丢掉，work() 里 takeRecords()
    // 拿到的几乎总是空的（回调被调用时队列已被清空），只能每次 scan(document)
    // 全页重扫，部署日志页每刷新一次就全页扫一遍。现在：
    //   1. 回调把 records 累积进 pendingRecords，交给 work() 只处理
    //      新增/变化的节点（scanNewSubtree）；
    //   2. 全页扫描只留给三种情况：启动（boot）、换页（onNavigated）、
    //      切换语言（switchLang / restoreAll），以及手动 schedule() 时
    //      恰好没有增量记录的兜底；
    //   3. 防自触发死循环（三道闸）：
    //      a. 本脚本自己写入产生的 records（悬浮按钮及其 style）在回调里
    //         直接丢弃（isOwnRecord）；
    //      b. 对页面内容的翻译写入会再产生一轮 records，但翻译结果（中文）
    //         不在字典里，下一轮 scanNewSubtree 无写入，自然收敛（两帧内）；
    //      c. scheduled / working / requeue 三标志保证同一时刻只有一轮
    //         处理在跑，期间新变化只置位不递归。
    // =========================================================================

    var mo = null;
    var scheduled = false;
    var working = false;   // 正在处理本批：期间新产生的 mutation 不再排队（避免自己触发自己）
    var requeue = false;   // 期间又来了新变化，处理完再来一轮
    var pendingRecords = []; // 回调累积的 records，work() 里清空消费

    // 该节点是否为本脚本注入（悬浮按钮本体 / 其样式 style）
    function isOwnNode(node) {
        try {
            if (!node) { return false; }
            var el = node.nodeType === 1 ? node : node.parentElement;
            if (!el) { return false; }
            if (el.id === BTN_ID || el.id === BTN_STYLE_ID) { return true; }
            return !!(el.closest && (el.closest('#' + BTN_ID) || el.closest('#' + BTN_STYLE_ID)));
        } catch (err) {
            log('isOwnNode', err, 'nodeType=' + (node && node.nodeType));
            return false; // 判断不了按外部变化处理，宁可多扫不可漏扫
        }
    }

    // 一条 mutation 记录是否全部来自本脚本自己的写入。
    // 一条记录对应一次 DOM 操作，实践中不会把本脚本节点和真实内容混在同一条里；
    // 万一混了，最多损失这条记录里的少量节点，下次全页扫描（换页/切语言）会补上。
    function isOwnRecord(m) {
        try {
            if (m.target && isOwnNode(m.target)) { return true; }
            if (m.type === 'childList') {
                for (var i = 0; i < m.addedNodes.length; i++) {
                    if (isOwnNode(m.addedNodes[i])) { return true; }
                }
            }
            return false;
        } catch (err) {
            log('isOwnRecord', err, 'type=' + (m && m.type));
            return false;
        }
    }

    function schedule() {
        if (scheduled || working) { requeue = true; return; }
        scheduled = true;
        window.requestAnimationFrame(function () {
            scheduled = false;
            work();
        });
    }

    function work() {
        working = true;
        try {
            // 消费回调累积的 records；再补捞一次 takeRecords()，
            // 覆盖「最后一次微任务回调之后、本帧之前」产生的少量记录
            var records = pendingRecords;
            pendingRecords = [];
            var late = mo.takeRecords();
            if (late.length) {
                for (var k = 0; k < late.length; k++) {
                    if (!isOwnRecord(late[k])) { records.push(late[k]); }
                }
            }
            if (currentLang === 'zh') {
                if (records.length) { scanNewSubtree(records); }
                else { scan(document); } // 只有无增量时才全页扫（启动/换页/切语言的主动调度）
            } else {
                // en 模式只处理还原（新增节点无需动作）
                if (records.length) { scanNewSubtree(records); }
            }
        } catch (err) {
            log('work', err, 'pending=' + pendingRecords.length);
        } finally {
            working = false;
            if (requeue) {
                requeue = false;
                schedule(); // 还有一轮待处理的改动
            }
        }
    }

    function startObserver() {
        try {
            mo = new MutationObserver(function (records) {
                try {
                    for (var i = 0; i < records.length; i++) {
                        if (!isOwnRecord(records[i])) { pendingRecords.push(records[i]); }
                    }
                } catch (err) {
                    log('mo.callback', err, 'records=' + (records && records.length));
                }
                schedule();
            });
            mo.observe(document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['placeholder', 'title', 'aria-label']
            });
        } catch (err) {
            log('startObserver', err);
        }
    }

    // =========================================================================
    // 六、右下角悬浮切换按钮（手绘 SVG，无 emoji，无网络请求）
    // -------------------------------------------------------------------------（BTN_ID / BTN_STYLE_ID 常量已上移到文件顶部配置区）

    // SVG 图标：左边「中」字（口 + 竖），右边字母 A —— 中 / EN 双语含义
    // 用 createElementNS 逐个建节点，脚本里没有任何把字符串当 HTML 解析的地方。
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var ICON_PARTS = [
        ['rect', { x: '3', y: '6', width: '10', height: '10', rx: '1.6', stroke: 'currentColor', 'stroke-width': '1.7' }],
        ['path', { d: 'M8 3v16', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round' }],
        ['path', { d: 'M14.6 21 18 10.5 21.4 21', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
        ['path', { d: 'M15.9 17.4h4.2', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round' }]
    ];

    function buildIcon() {
        try {
            var svg = document.createElementNS(SVG_NS, 'svg');
            var rootAttrs = { viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', 'aria-hidden': 'true' };
            Object.keys(rootAttrs).forEach(function (k) { svg.setAttribute(k, rootAttrs[k]); });
            ICON_PARTS.forEach(function (part) {
                var el = document.createElementNS(SVG_NS, part[0]);
                Object.keys(part[1]).forEach(function (k) { el.setAttribute(k, part[1][k]); });
                svg.appendChild(el);
            });
            return svg;
        } catch (err) {
            log('buildIcon', err);
            return null;
        }
    }

    function injectButtonStyle() {
        try {
            if (document.getElementById(BTN_STYLE_ID)) { return; }
            var css = [
                '#' + BTN_ID + ' {',
                '  position: fixed;',
                '  right: 14px;',
                '  bottom: 16px;',
                '  z-index: 98;', // 低于 Coolify 确认弹窗(z-99)：弹窗打开时按钮被盖住，不打扰
                '  width: 46px;',
                '  height: 46px;',
                '  border-radius: 50%;',
                '  border: 1px solid rgba(127,127,127,.45);',
                '  background: rgba(22,22,22,.72);',
                '  color: #f5f5f5;',
                '  display: flex;',
                '  align-items: center;',
                '  justify-content: center;',
                '  cursor: pointer;',
                '  box-shadow: 0 2px 10px rgba(0,0,0,.35);',
                '  backdrop-filter: blur(6px);',
                '  -webkit-backdrop-filter: blur(6px);',
                '  padding: 0;',
                '  margin: 0;',
                '  touch-action: manipulation;',
                '  user-select: none;',
                '  -webkit-tap-highlight-color: transparent;',
                '}',
                '#' + BTN_ID + ':hover { background: rgba(88,28,135,.85); }',
                '#' + BTN_ID + ':active { transform: scale(.94); }',
                '@media (max-width: 430px) {',
                '  #' + BTN_ID + ' { right: 10px; bottom: 12px; width: 48px; height: 48px; }',
                '}'
            ].join('\n');
            var style = document.createElement('style');
            style.id = BTN_STYLE_ID;
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        } catch (err) {
            log('injectButtonStyle', err);
        }
    }

    function updateButtonTitle(btn) {
        try {
            var tip = currentLang === 'zh' ? '当前：中文 —— 点击切换到 English' : 'Current: English — click for 中文';
            btn.setAttribute('title', tip);
            btn.setAttribute('aria-label', tip);
        } catch (err) {
            log('updateButtonTitle', err);
        }
    }

    function switchLang(next) {
        currentLang = next;
        saveLang(currentLang);
        try {
            if (currentLang === 'en') {
                // 还原所有翻译过的文字节点（原样还原）
                restoreAll();
            } else {
                scan(document);
            }
        } catch (err) {
            log('switchLang', err, 'next=' + next);
        }
        var btn = document.getElementById(BTN_ID);
        if (btn) { updateButtonTitle(btn); }
    }

    function restoreAll() {
        try {
            // WeakMap 不可枚举：还原走的是「Observer 无事可做 + 手动扫一遍还原」的路线——
            // translateTextNode 在 en 模式下遇到有备份的节点会自动还原。
            scan(document);
        } catch (err) {
            log('restoreAll', err);
        }
    }

    function injectButton() {
        try {
            if (document.getElementById(BTN_ID)) { return; }
            injectButtonStyle();
            var btn = document.createElement('button');
            btn.id = BTN_ID;
            btn.type = 'button';
            var icon = buildIcon();
            if (icon) { btn.appendChild(icon); } else { btn.textContent = '中/A'; }
            updateButtonTitle(btn);
            btn.addEventListener('click', function (ev) {
                try {
                    ev.preventDefault();
                    ev.stopPropagation();
                    switchLang(currentLang === 'zh' ? 'en' : 'zh');
                } catch (err) {
                    log('btn.click', err);
                }
            });
            (document.body || document.documentElement).appendChild(btn);
        } catch (err) {
            log('injectButton', err);
        }
    }

    // wire:navigate 换页后：按钮被换掉要补种，内容要重扫
    function onNavigated() {
        try {
            injectButton();
            schedule();
            window.setTimeout(function () { if (currentLang === 'zh') { scan(document); } }, 120);
            window.setTimeout(function () { if (currentLang === 'zh') { scan(document); } }, 600);
        } catch (err) {
            log('onNavigated', err);
        }
    }

    // =========================================================================
    // 七、启动
    // =========================================================================

    function boot() {
        try {
            startObserver();
            injectButton();
            scan(document);
            // Livewire 3 事件：wire:navigate 完成换页
            document.addEventListener('livewire:navigated', onNavigated);
            // 兜底：部分组件晚于 document-idle 渲染
            window.setTimeout(function () { if (currentLang === 'zh') { scan(document); } }, 800);
            window.setTimeout(function () { if (currentLang === 'zh') { scan(document); } }, 2500);
        } catch (err) {
            log('boot', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
