# 给 agent 的提示词模板

下面四段按顺序发给你的 agent，`<尖括号>` 里换成你自己的。每段都要求它**动手前先说要做什么、不在对话里显示任何密钥**。

## 1. 只读盘点

```text
先读 https://zeabur.com/blogs/migrate-from-zeabur.md，遵守里面的规则。

这一步只做勘察，不改动、不删除、不备份、不安装任何东西。

旧服务器：Zeabur 租的专用服务器，IP <旧IP>，root SSH。新服务器：HostHatch，IP <新IP>，之后装 Coolify。

请查：
1. 每个 environment 命名空间属于哪个项目（k3s kubectl get ns -L zeabur_project_name）
2. 每个服务：名字、镜像地址、镜像是否来自 zeabur 仓库、代码是否在 GitHub 上
3. 每个存档盘：属于哪个服务、里面有什么、多大、最近有没有在写入；有没有对应不上任何服务的存档盘
4. 每个服务的环境变量名，哪些是自动注入的、哪些含 ${}、哪些含 .zeabur.internal 或 .zeabur.app。只列名字，不要显示值
5. Zeabur 以外的东西：docker ps -a、自己装的系统服务、/root 下的文件
6. 域名、对外端口、硬盘总占用

最后按“每个服务一行”整理成报告，列出必须备份的东西和迁移风险。报告里不能出现任何密钥的值。
```

## 2. 备份

```text
勘察结果我确认过了，进入备份阶段。每一步动手前先告诉我要做什么。

不需要的服务（不备份）：<列出来>。

要备份的：
1. 存档盘：SQLite 用 sqlite3 .backup 安全导出（没有 sqlite3 就用 Python 的 sqlite3.backup），
   MariaDB/PostgreSQL 用同大版本的 dump 工具，其他文件打包
2. 我自己装的 Docker 容器：先记下 docker inspect，再停容器、打包卷、启动回去
3. 自建的系统服务：配置文件夹 + systemd 服务文件
4. /root 下的脚本，先列出来给我看
5. 每个保留服务的 deploy yaml（含环境变量），每个服务一个文件
6. 来自 zeabur 仓库、又找不到 GitHub 源码的服务，导出正在运行的镜像

全部下载到我电脑一个专门的文件夹，敏感文件只给我的账户读；逐个核对 SHA256、压缩包能列出内容、
sqlite 跑 integrity_check；最后给我一份清单。不要删除服务器上任何东西。
```

## 3. 生成 Coolify 用的环境变量文件（每个服务发一次）

```text
从备份的 deploy-yaml 里找 <服务名> 的配置，生成 <服务名>-coolify.env：
- 每行 名字=值，不加任何引号
- 去掉 ZEABUR_ 开头的、CONTAINER_HOSTNAME、WEB_PORT、PORT_FORWARDED_ 开头的、PORT
- 指向 .zeabur.app 或 .zeabur.internal 的变量，单独列出名字
- 值里含 $ 或换行的，单独列出名字
告诉我：一共几行、这个服务原来监听哪个端口。不要显示任何值。
```

## 4. 扫代码里的旧地址

```text
只读扫描，不修改代码。把仓库 <owner/repo> 完整搜一遍：
zeabur、.zeabur.app、.zeabur.internal、service-，以及所有读环境变量的地方中以 _HOST、_URL、_BASE 结尾的。
输出一张表：文件和行号、写死还是环境变量、地址或变量名（不要写密钥）、对应什么功能、
是我自己的服务还是外部公共服务。最后列出需要改的地方和推荐改法。
```

## 换 agent 的话

上面几段不依赖 Claude Code，任何能在你电脑上跑命令、能 SSH 的 agent 都能用。关键是两条规矩一直带着：**先说再动手，密钥不进对话。**

想让 AI 直接在 Coolify 面板里替你建服务，见[小妙招](10-小妙招-让AI替你部署.md)里的那段提示词。
