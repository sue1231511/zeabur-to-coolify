# 04 装 Coolify

一条命令装好，装完**立刻注册管理员**，然后启动代理，十几分钟的事。本文按 Coolify v4.5.0 写，界面以后可能会变，以[官方文档](https://coolify.io/docs/get-started/installation)为准。

## 安装

1. 在 Termius 里登录新服务器，粘这一条，它会自动装 Docker 和 Coolify：

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

2. 装完会打出一个地址 `http://<新IP>:8000`。**马上在浏览器打开，马上注册**：第一个注册的人就是管理员，还能拿到这台服务器的 root 权限。密码用长的、没在别处用过的。
   - 注册完一般会自动关闭注册。去 设置（Settings）→ 高级（Advanced）→ Registration 确认一眼是 **Registration disabled**。
   - 更稳的做法：按官方文档的“高级安装”，在安装时用 `ROOT_USERNAME`、`ROOT_USER_EMAIL`、`ROOT_USER_PASSWORD` 直接预设管理员，注册页根本不会暴露出来。
3. 新手引导：服务器选 **This machine**（部署在 Coolify 自己这台机器上），别选 Hetzner、Vultr 那些（那是让你去别家租机器）。然后点 Create "My First Project"。
4. 进 **Servers → localhost**，如果显示 Attention required、Proxy 是 Exited，点右上角 **Start Proxy**，变成 Running 就好。这个 Traefik 是所有服务的大门，HTTPS 证书也是它去申请的。
5. **Docker Cleanup**（Docker 清理）默认已经开着，每天自动清旧镜像。**Unused volumes 保持 Keep（保留）**，别改成删除，数据卷里是你的存档。
6. 备份 `/data/coolify/source/.env`（见第 03 步最后一节）。

## 防火墙

Coolify 用到的端口（来自[官方防火墙文档](https://coolify.io/docs/core/infrastructure/servers/firewall)）：

| 端口 | 用途 | 面板挂好域名以后 |
|---|---|---|
| 22 | SSH | 保留 |
| 80 | HTTP，以及申请证书 | 保留 |
| 443 | HTTPS | 保留 |
| 8000 | 用 IP 直接访问面板 | **可以关** |
| 6001 | 用 IP 访问时的实时推送 | **可以关** |
| 6002 | 用 IP 访问时的网页终端 | **可以关** |

面板挂上域名以后（第 05 步），面板、实时推送和终端都会走 80 / 443，8000、6001、6002 就可以关了。

### 普通的 ufw 挡不住 Docker 开的端口

Docker 官方文档写得很清楚：容器发布出来的端口，流量会在经过 ufw 规则**之前**就被转走，等于**无视你的 ufw 配置**。所以：

- **最靠谱的是用服务器商控制台里的防火墙**，它在服务器外面，Docker 管不着；
- 服务器商没有防火墙的话，可以用 `ufw-docker` 这类工具（Coolify 官方文档提到过）；
- 自己 `docker run` 起的、不归 Coolify 管的容器，能只给本机用的端口就只绑本机：`-p 127.0.0.1:5900:5900`。

另外，如果你走代理上网，出口 IP 会变，**别把 SSH 只放行给“你的 IP”**，会把自己锁在外面。

## 自动更新

Coolify 默认每天自动更新（设置 → 更新）。我们就遇到过：某天早上醒来，它自己从 4.4.7 升到了 4.5.0，界面变了一些。

- **开着**：安全修复第一时间就有。代价是界面可能某天突然变了，汉化脚本之类的需要跟着补。
- **关掉**：界面一直稳定，什么时候升你说了算。代价是要自己记得去更新。

更新时间按“实例时区”算（设置 → 通用），默认是 UTC，比北京时间晚 8 小时。

---

参考：

- 官方安装文档 <https://coolify.io/docs/get-started/installation>
- 官方防火墙文档 <https://coolify.io/docs/core/infrastructure/servers/firewall>
- Docker 关于防火墙的说明 <https://docs.docker.com/engine/network/packet-filtering-firewalls/>

下一步：[05 域名和 DNS](05-域名和DNS.md)
