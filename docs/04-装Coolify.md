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

Coolify 用到的端口（来自[官方防火墙文档](https://coolify.io/docs/core/infrastructure/servers/firewall)），再加上我们在自己服务器上实际查到的一个：

| 端口 | 用途 | 面板挂好域名以后 |
|---|---|---|
| 22 | SSH | 保留 |
| 80 | HTTP，以及申请证书 | 保留 |
| 443 | HTTPS（UDP 的 443 是 HTTP/3） | 保留 |
| 8000 | 用 IP 直接访问面板 | **可以关** |
| 6001 | 用 IP 访问时的实时推送 | **可以关** |
| 6002 | 用 IP 访问时的网页终端 | **可以关** |
| 8080 | 代理（Traefik）的 API 端口 | **应该关** |

面板挂上域名以后（第 05 步），面板、实时推送和终端都会走 80 / 443，8000、6001、6002 就可以关了。

**关于 8080**：官方防火墙文档的表里没有它，但我们的代理容器把它开到了公网。按 [Coolify 的 Traefik 面板文档](https://coolify.io/docs/core/networking/proxy/traefik/dashboard)，如果代理配置开了 insecure 模式，Traefik 面板会在这个端口上**不需要密码**就能打开，能看到你所有的路由和域名。可以去 服务器 → localhost → 代理 → 配置 里看一眼有没有 `8080:8080` 和 `--api.insecure=true`。不管有没有开，从公网都用不到它，一起拦掉。我们拦上以后几分钟，计数器上就有外面来敲 8080 的包，网上一直有人在扫。

### 动手之前：先看清到底开了哪些口

别凭记忆，我们就漏记了两个。在服务器上粘：

```bash
# 等外面来连的端口（排除掉只给本机用的）
ss -tulpn | grep -vE '127\.0\.0\.1|\[::1\]'
# 每个容器把哪些端口挂到了外面
docker ps --format 'table {{.Names}}\t{{.Ports}}'
# 有没有公网 IPv6（只看到 fd 开头的是 Docker 内部地址，不算）
ip -6 addr show scope global
```

`docker-proxy` 开的口是 Docker 发布的；`sshd`、你自己装的代理之类是直接跑在系统上的，两种拦法不一样（见下）。

### 普通的 ufw 挡不住 Docker 开的端口

Docker 官方文档写得很清楚：容器发布出来的端口，流量会在经过 ufw 规则**之前**就被转走，等于**无视你的 ufw 配置**。办法三选一：

1. **服务器商控制台里的防火墙**：最省事，它在服务器外面，Docker 管不着。
2. **没有的话，用 Docker 留给用户的 DOCKER-USER 链**，见下一节。我们用的就是这个。
3. 自己 `docker run` 起的、不归 Coolify 管的容器，从根上只绑本机：`-p 127.0.0.1:5900:5900`。这要重建容器，可以和第 2 种一起用当双保险。

另外，如果你走代理上网，出口 IP 会变，**别把 SSH 只放行给“你的 IP”**，会把自己锁在外面。

### 用 DOCKER-USER 链拦掉 Docker 发布的端口

**它的好处**：这条链只管 Docker 转发给容器的流量，**碰不到 SSH 和直接跑在系统上的程序**，写错了也不会把你锁在外面；容器之间走内网，也不受影响。

**要注意的一点**：包到这条链时，目标端口已经被 Docker 改成容器里的端口了（比如面板的 8000 会变成容器里的 8080）。所以要用 conntrack 按“**外面原本连的端口**”来匹配，这是 [Docker 官方文档](https://docs.docker.com/engine/network/firewall-iptables/)给的写法。直接写 `--dport 8000` 是拦不到的，反而可能误伤别的容器。

**第 1 步：查网卡名。** 下面的命令里写的是 `eth0`，先确认你的叫什么：

```bash
ip -o -4 route show to default
```

输出里 `dev` 后面那个就是，比如 `dev eth0`。不是 `eth0` 的，把下面所有 `eth0` 换掉。

**第 2 步：先临时加上。** 这样加的规则重启就没了，万一哪里不对，`reboot` 一下就是后悔药：

```bash
for p in 8000 6001 6002 8080; do
  iptables -I DOCKER-USER -i eth0 -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport $p -j DROP
done
iptables -L DOCKER-USER -n -v --line-numbers
```

- `-i eth0`：只管从外网口进来的；
- `--ctdir ORIGINAL --ctorigdstport`：只认“外面主动来连这个原始端口”的包，容器自己往外连别人收到的回包不会被误伤；
- 你自己的容器还有别的口要关（比如机器人的管理后台），把端口号加进 `for p in` 后面就行；
- 最后一行列出规则，**数一下条数**：一个端口一条。分几次粘很容易粘重复，重复了就按编号**从大往小**删（`iptables -D DOCKER-USER 编号`），从小往大删编号会错位。

**第 3 步：测。** 用手机流量（不连 Wi-Fi），打开 `http://<新IP>:8000` 应该一直转圈打不开；`https://coolify.你的域名.com` 照常能登、日志和实时状态正常；你的网站、机器人照常。

> **代理搭在这台服务器上的，测之前先把代理关掉。** 开着的话，请求是从服务器自己身上绕回来的，不经过外网口，会显示“还能打开”，测了等于白测。

**第 4 步：确认没问题，做成开机自动加载。** 写一个脚本（已经有的规则会跳过，不会越加越多），再让 systemd 跟着 Docker 一起跑它，服务器重启、Coolify 升级重启 Docker 都会自动补上：

```bash
cat > /usr/local/sbin/docker-user-firewall.sh <<'EOF'
#!/bin/sh
# 拦外网直连 Docker 发布的端口
iptables -N DOCKER-USER 2>/dev/null || true
for p in 8000 6001 6002 8080; do
  iptables -C DOCKER-USER -i eth0 -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport $p -j DROP 2>/dev/null \
  || iptables -I DOCKER-USER -i eth0 -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport $p -j DROP
done
EOF
chmod 700 /usr/local/sbin/docker-user-firewall.sh

cat > /etc/systemd/system/docker-user-firewall.service <<'EOF'
[Unit]
Description=Block public access to internal Docker ports
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/docker-user-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=docker.service
EOF
systemctl daemon-reload
systemctl enable --now docker-user-firewall.service
systemctl status docker-user-firewall.service --no-pager | head -n 5
iptables -L DOCKER-USER -n --line-numbers
```

脚本里的端口列表要和第 2 步一致（你加了别的端口，这里也加上）。看到 `active (exited)` 是正常的，意思是“跑完了、在岗”；最后列出来的条数和第 2 步一样、没有翻倍，说明“已有就跳过”生效了。

**以后怎么改**：要多拦一个口，改脚本里的端口列表，再 `systemctl restart docker-user-firewall`。想临时全部放开排查问题：`iptables -F DOCKER-USER`，重启 Docker 或这个服务后会自动加回来。

**这一招管不到的**：直接跑在系统上的程序（不是 Docker 起的），比如你自己装的代理。那些要么在程序配置里只监听本机，要么用服务器商防火墙或 ufw 管。我们只有 SSH 和一个代理是这类，两个都要对外，就没动。

## 自动更新

Coolify 默认每天自动更新（设置 → 更新）。我们就遇到过：某天早上醒来，它自己从 4.4.7 升到了 4.5.0，界面变了一些。

- **开着**：安全修复第一时间就有。代价是界面可能某天突然变了，汉化脚本之类的需要跟着补。
- **关掉**：界面一直稳定，什么时候升你说了算。代价是要自己记得去更新。

更新时间按“实例时区”算（设置 → 通用），默认是 UTC，比北京时间晚 8 小时。

---

参考：

- 官方安装文档 <https://coolify.io/docs/get-started/installation>
- 官方防火墙文档 <https://coolify.io/docs/core/infrastructure/servers/firewall>
- 官方 Traefik 面板文档 <https://coolify.io/docs/core/networking/proxy/traefik/dashboard>
- Docker 关于防火墙的说明 <https://docs.docker.com/engine/network/packet-filtering-firewalls/>
- Docker 的 DOCKER-USER 链和 conntrack 写法 <https://docs.docker.com/engine/network/firewall-iptables/>

下一步：[05 域名和 DNS](05-域名和DNS.md)
