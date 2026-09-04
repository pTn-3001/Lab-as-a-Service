import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ImageBuilderService {
  private readonly logger = new Logger(ImageBuilderService.name);
  private readonly orchestrationUrl = process.env.ORCHESTRATION_SERVICE_URL || 'http://localhost:3004/api';

  constructor(private readonly prisma: PrismaService) {}

  async createBuildSession(userId: string, data: { baseImageId: string; flavorId: string; targetImageName: string; targetImageDesc?: string; customBaseImageName?: string; vmUsername?: string; vmPassword?: string; networkType?: string; cidr?: string; staticIp?: string }) {
    // 1. Lưu Record ImageBuildSession với trạng thái STARTING
    const session = await this.prisma.imageBuildSession.create({
      data: {
        userId,
        baseImageId: data.baseImageId,
        flavorId: data.flavorId,
        targetImageName: data.targetImageName,
        targetImageDesc: data.targetImageDesc || '',
        status: 'STARTING',
        vmUsername: data.vmUsername?.trim() || 'instructor',
        vmPassword: data.vmPassword?.trim() || 'Laas@2026',
        networkType: data.networkType || 'dhcp',
        cidr: data.cidr || '10.20.200.0/24',
        staticIp: data.staticIp || null,
      }
    });

    const stackName = `temp-vm-img-build-${session.id.substring(session.id.length - 6)}`;
    const vmUsername = data.vmUsername?.trim() || 'instructor';
    const vmPassword = data.vmPassword?.trim() || 'Laas@2026';

    // 2. Tạo Heat Template: 1 internal network + security group + port + server + floating IP
    // Floating IP từ provider-net (tương tự các lab template thông thường)
    const providerNet = process.env.OPENSTACK_PROVIDER_NETWORK || 'provider-net';
    const sharedRouterId = process.env.OPENSTACK_SHARED_ROUTER_ID || '';

    const routerResourcesYaml = sharedRouterId
      ? ''
      : `
  builder_router:
    type: OS::Neutron::Router
    properties:
      name: ${stackName}-router
      distributed: false
      external_gateway_info:
        network: ${providerNet}
`;

    const routerIdYaml = sharedRouterId ? sharedRouterId : '{ get_resource: builder_router }';

    const heatTemplateYaml = `
heat_template_version: 2018-08-31
description: Temp VM for Custom Image Building

resources:

  builder_network:
    type: OS::Neutron::Net
    properties:
      name: ${stackName}-net

  builder_subnet:
    type: OS::Neutron::Subnet
    properties:
      name: ${stackName}-subnet
      network: { get_resource: builder_network }
      cidr: 10.20.200.0/24
      gateway_ip: 10.20.200.1
      dns_nameservers: [8.8.8.8, 1.1.1.1]
${routerResourcesYaml}
  builder_router_iface:
    type: OS::Neutron::RouterInterface
    properties:
      router_id: ${routerIdYaml}
      subnet: { get_resource: builder_subnet }

  builder_security_group:
    type: OS::Neutron::SecurityGroup
    properties:
      name: ${stackName}-sg
      rules:
        - direction: ingress
          ethertype: IPv4
          protocol: tcp
          port_range_min: 22
          port_range_max: 22
          remote_ip_prefix: 0.0.0.0/0
        - direction: ingress
          ethertype: IPv4
          protocol: tcp
          port_range_min: 7681
          port_range_max: 7681
          remote_ip_prefix: 0.0.0.0/0
        - direction: ingress
          ethertype: IPv4
          protocol: icmp
          remote_ip_prefix: 0.0.0.0/0
        - direction: egress
          ethertype: IPv4
          remote_ip_prefix: 0.0.0.0/0

  builder_volume:
    type: OS::Cinder::Volume
    properties:
      name: ${stackName}-boot
      size: 20
      image: ${data.baseImageId}

  builder_server:
    type: OS::Nova::Server
    depends_on: [builder_subnet, builder_router_iface]
    properties:
      name: ${stackName}-node
      flavor: ${data.flavorId}
      block_device_mapping_v2:
        - boot_index: 0
          delete_on_termination: false
          volume_id: { get_resource: builder_volume }
      networks:
        - subnet: { get_resource: builder_subnet }
      security_groups: [{ get_resource: builder_security_group }]
      config_drive: true
      user_data_format: RAW
      user_data: |
        #cloud-config

        bootcmd:
          - ethtool -K eth0 rx off tx off 2>/dev/null || true
          - sysctl -w net.ipv4.conf.all.rp_filter=0 2>/dev/null || true

        hostname: ${stackName}-node
        manage_etc_hosts: false

        users:
          - default
          - name: ${vmUsername}
            plain_text_passwd: "${vmPassword}"
            lock_passwd: false
            shell: /bin/bash
            sudo: ALL=(ALL) NOPASSWD:ALL
            groups: [sudo]

        ssh_pwauth: true

        chpasswd:
          expire: false

        disable_root: true

        network:
          version: 2
          ethernets:
            eth0:
              dhcp4: true

        write_files:
          - path: /etc/ssh/sshd_config.d/99-laas.conf
            content: |
              PasswordAuthentication yes
              UsePAM yes
            permissions: '0600'
          - path: /etc/systemd/system/ttyd.service
            content: |
              [Unit]
              Description=ttyd web terminal
              After=network.target

              [Service]
              ExecStart=/usr/local/bin/ttyd -p 7681 -W login
              Restart=always

              [Install]
              WantedBy=multi-user.target
            permissions: '0644'
          - path: /usr/local/bin/setup-ttyd.sh
            permissions: '0755'
            content: |
              #!/bin/bash
              if [ -s /usr/local/bin/ttyd ]; then
                chmod +x /usr/local/bin/ttyd
                systemctl daemon-reload
                systemctl enable ttyd --now
                exit 0
              fi
              if command -v ttyd >/dev/null 2>&1; then
                cp $(which ttyd) /usr/local/bin/ttyd 2>/dev/null || true
                chmod +x /usr/local/bin/ttyd 2>/dev/null || true
                systemctl daemon-reload
                systemctl enable ttyd --now
                exit 0
              fi
              PRIMARY="http://192.168.2.250/assets/ttyd.x86_64"
              FALLBACK="https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64"
              curl -fsSL --connect-timeout 5 -o /usr/local/bin/ttyd "$PRIMARY" 2>/dev/null || \
              curl -fsSL --connect-timeout 10 -o /usr/local/bin/ttyd "$FALLBACK" 2>/dev/null || true
              if [ -s /usr/local/bin/ttyd ]; then
                chmod +x /usr/local/bin/ttyd
                systemctl daemon-reload
                systemctl enable ttyd --now
              fi

        runcmd:
          - systemctl disable firewalld --now 2>/dev/null || true
          - setenforce 0 2>/dev/null || true
          - systemctl restart sshd
          - bash -c 'nohup /usr/local/bin/setup-ttyd.sh >/var/log/setup-ttyd.log 2>&1 &'

  builder_floating_ip:
    type: OS::Neutron::FloatingIP
    depends_on: [builder_router_iface]
    properties:
      floating_network: ${providerNet}

  builder_floating_ip_assoc:
    type: OS::Neutron::FloatingIPAssociation
    depends_on: [builder_server, builder_floating_ip]
    properties:
      floatingip_id: { get_resource: builder_floating_ip }
      port_id: { get_attr: [builder_server, addresses, ${stackName}-net, 0, port] }

outputs:
  server_floating_ip:
    description: Floating IP address for SSH access to the image builder VM
    value: { get_attr: [builder_floating_ip, floating_ip_address] }
  ssh_nat_host:
    description: SSH host (same as floating IP, used by orchestration service)
    value: { get_attr: [builder_floating_ip, floating_ip_address] }
  ssh_nat_floating_ip_id:
    description: Floating IP ID used for SSH access (direct association, not port forwarding)
    value: { get_resource: builder_floating_ip }
`;

    try {
      // 3. Gọi Orchestration Service sinh Heat Stack
        const createStackRes = await axios.post(`${this.orchestrationUrl}/v1/openstack/stacks`, {
        stackName,
        template: heatTemplateYaml,
        disableRollback: true
      }, {
        headers: {
          'x-user-id': userId
        },
        timeout: 15000  // Stack creation can be slower
      });

      const stackId = createStackRes.data?.data?.stack?.id ?? createStackRes.data?.stackId;

      // 4. Update Database
      await this.prisma.imageBuildSession.update({
        where: { id: session.id },
        data: {
          openstackStackId: stackId,
          status: 'RUNNING' // Trong thực tế sẽ poll trạng thái OPENSTACK
        }
      });

      return {
        success: true,
        sessionId: session.id,
        stackId
      };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Lỗi khi tạo Temp VM Stack: ' + message);
      await this.prisma.imageBuildSession.update({
        where: { id: session.id },
        data: { status: 'FAILED' }
      });
      throw new InternalServerErrorException('Không thể cấp phát VM cho Image Builder');
    }
  }

  async getSessionStatus(_userId: string, sessionId: string) {
    const session = await this.prisma.imageBuildSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session không tồn tại');

    // If sshHost is already persisted, return it immediately — no need to re-query OpenStack
    if (session.sshHost) {
      return { session, sshHost: session.sshHost };
    }

    const stackName = `temp-vm-img-build-${session.id.substring(session.id.length - 6)}`;

    // When openstackStackId is missing (bug in older sessions), use the stack name as both
    // name and stackId — the orchestration service tries multiple identifier candidates
    // including { stackName: name, stackId: name } so it will find the stack.
    const effectiveStackId = session.openstackStackId || stackName;

    if ((session.status === 'RUNNING' || session.status === 'STARTING')) {
      try {
        this.logger.log(`[ImageBuilder] Polling stack: ${stackName}/${effectiveStackId}`);
        const res = await axios.get(`${this.orchestrationUrl}/v1/openstack/stacks/${stackName}/${effectiveStackId}/resources`, {
          headers: { 'x-user-id': session.userId },
          timeout: 15000,
        });

        if (res.data?.success && res.data?.data) {
          const stack = res.data.data.stack;
          const resources = res.data.data.resources || [];
          const stackStatus = stack?.status || '';
          this.logger.log(`[ImageBuilder] Stack status: ${stackStatus}, resources count: ${resources.length}`);

          if (stackStatus === 'CREATE_FAILED' || stackStatus === 'ROLLBACK_COMPLETE') {
            const updated = await this.prisma.imageBuildSession.update({
              where: { id: sessionId },
              data: { status: 'FAILED' },
            });
            return { session: updated, openstackData: res.data.data };
          }

          // Priority 1: Heat stack outputs — check server_floating_ip then ssh_nat_host
          let sshHost: string | undefined;
          if (Array.isArray(stack?.outputs)) {
            const outputs: Array<{ key?: string; value?: unknown }> = stack.outputs;
            this.logger.log(`[ImageBuilder] Stack outputs: ${JSON.stringify(outputs.map(o => ({ k: o.key, v: o.value })))}`);
            const fipOutput = outputs.find((o) => o.key === 'server_floating_ip' || o.key === 'ssh_nat_host');
            const rawVal = fipOutput?.value;
            const candidate = rawVal != null ? String(rawVal).trim() : '';
            if (candidate && candidate !== 'null' && candidate !== 'undefined') {
              sshHost = candidate;
              this.logger.log(`[ImageBuilder] Got floating IP from stack outputs[${fipOutput?.key}]: ${sshHost}`);
            }
          }

          // Priority 2: Nova server detail — floatingIp then sshHost
          const serverResource = resources.find((r: { resourceType?: string }) => r.resourceType === 'OS::Nova::Server');
          this.logger.log(`[ImageBuilder] Server resource: ${!!serverResource}, server detail: ${!!serverResource?.server}`);
          if (!sshHost && serverResource?.server) {
            const server = serverResource.server;
            const candidate = server.floatingIp || server.sshHost || undefined;
            this.logger.log(`[ImageBuilder] Server IPs — floatingIp: ${server.floatingIp}, sshHost: ${server.sshHost}, primaryIp: ${server.primaryIp}, addresses: ${JSON.stringify(server.addresses)}`);
            if (candidate && candidate !== server.primaryIp) {
              sshHost = candidate;
            } else {
              // Last resort: first address with type 'floating' from raw addresses
              const floatingAddr = Array.isArray(server.addresses)
                ? server.addresses.find((a: { type?: string; ip?: string }) => a.type === 'floating')?.ip
                : undefined;
              if (floatingAddr) sshHost = floatingAddr;
            }
          }

          this.logger.log(`[ImageBuilder] Final sshHost: ${sshHost || 'NONE'}`);

          const updateData: Record<string, string> = {};
          // Recover missing openstackStackId from stack detail (canonical ID returned by orchestration)
          const recoveredStackId: string | undefined =
            typeof res.data.data.stack?.id === 'string' ? res.data.data.stack.id : undefined;
          if (!session.openstackStackId && recoveredStackId) {
            updateData.openstackStackId = recoveredStackId;
          }
          if (!session.tempServerId && serverResource?.server?.id) {
            updateData.tempServerId = serverResource.server.id;
          }
          if (sshHost) {
            updateData.sshHost = sshHost;
            updateData.status = 'RUNNING';
          } else if (session.status === 'STARTING' && stackStatus === 'CREATE_COMPLETE') {
            updateData.status = 'RUNNING';
          }

          let updatedSession = session;
          if (Object.keys(updateData).length > 0) {
            updatedSession = await this.prisma.imageBuildSession.update({
              where: { id: sessionId },
              data: updateData,
            });
          }

          return { session: updatedSession, openstackData: res.data.data, sshHost };
        } else {
          this.logger.warn(`[ImageBuilder] Orchestration response not successful: ${JSON.stringify(res.data).substring(0, 200)}`);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('[ImageBuilder] Failed to poll stack status: ' + message);
      }
    }

    return { session };
  }

  async publishImage(userId: string, sessionId: string, data: { name?: string; description?: string; visibility?: string }) {
    const session = await this.prisma.imageBuildSession.findUnique({ where: { id: sessionId } });

    if (!session || session.userId !== userId) throw new NotFoundException('Session không hợp lệ');
    if (session.status === 'COMPLETED') {
      throw new BadRequestException('Image đã được tạo thành công — không thể yêu cầu lại');
    }
    if (session.status === 'PENDING_APPROVAL' || session.status === 'SNAPSHOTTING') {
      throw new BadRequestException('Yêu cầu đang được xử lý, vui lòng chờ');
    }

    await this.prisma.imageBuildSession.update({
      where: { id: sessionId },
      data: {
        status: 'PENDING_APPROVAL',
        pendingImageName: data.name?.trim() || session.targetImageName,
        pendingImageDesc: data.description?.trim() || session.targetImageDesc || '',
        pendingImageVisibility: data.visibility || 'private',
      },
    });

    // Trigger snapshot immediately in background — stack stays alive so SSH inspection works
    void this.doSnapshotBackground(sessionId);

    this.logger.log(`[ImageBuilder] Session ${sessionId} submitted by ${userId} — snapshot started`);

    return {
      success: true,
      pending: true,
      message: 'Đang tạo snapshot để admin kiểm tra. Vui lòng chờ vài phút trước khi admin chạy kiểm tra.',
      sessionId,
      status: 'PENDING_APPROVAL',
    };
  }

  // Stops the builder VM, uploads its boot volume directly to Glance (golden-image workflow),
  // then polls until the image is active. Stack stays alive for SSH inspection by admin.
  private async doSnapshotBackground(sessionId: string): Promise<void> {
    const session = await this.prisma.imageBuildSession.findUnique({ where: { id: sessionId } });
    if (!session) return;

    const stackName = `temp-vm-img-build-${session.id.substring(session.id.length - 6)}`;
    const effectiveStackId = session.openstackStackId || stackName;

    // Recover server ID and boot volume ID from Heat stack resources if not already stored.
    let tempServerId = session.tempServerId;
    let bootVolumeId: string | undefined;
    try {
      const stackRes = await axios.get(
        `${this.orchestrationUrl}/v1/openstack/stacks/${stackName}/${effectiveStackId}/resources`,
        { headers: { 'x-user-id': session.userId }, timeout: 15000 },
      );
      const resources: Array<{ resourceType?: string; physicalResourceId?: string; server?: { id?: string } }> =
        stackRes.data?.data?.resources || [];
      if (!tempServerId) {
        const serverId = resources.find((r) => r.resourceType === 'OS::Nova::Server')?.server?.id;
        if (serverId) {
          tempServerId = serverId;
          await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { tempServerId: serverId } });
        }
      }
      bootVolumeId = resources.find((r) => r.resourceType === 'OS::Cinder::Volume')?.physicalResourceId;
      this.logger.log(`[ImageBuilder] doSnapshot: tempServerId=${tempServerId || 'none'}, bootVolumeId=${bootVolumeId || 'none'}`);
    } catch (e: unknown) {
      this.logger.warn('[ImageBuilder] doSnapshot: could not get stack resources: ' + (e instanceof Error ? e.message : String(e)));
    }

    try {
      await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'SNAPSHOTTING' } });

      // Phase 0: SSH inspection — collect while VM is still ACTIVE, before cleanup+poweroff.
      // Data saved to DB so admin can view it via inspectSession even after VM is SHUTOFF.
      if (session.sshHost && session.vmUsername && session.vmPassword) {
        const inspectScript = [
          'cat /etc/os-release 2>/dev/null',
          'echo "==>PACKAGES<=="',
          '(rpm -qa 2>/dev/null || dpkg-query -f \'${Package}\\n\' -W 2>/dev/null) | sort',
          'echo "==>RECENT<=="',
          'tail -100 /var/log/dnf.log 2>/dev/null | grep -iE "Installed|Upgraded" | tail -50 || tail -100 /var/log/apt/history.log 2>/dev/null | grep -iE "install|upgrade" | tail -50 || echo "no-log"',
          'echo "==>SERVICES<=="',
          'systemctl list-unit-files --type=service --state=enabled --no-pager --plain 2>/dev/null | grep "\\.service" | awk \'{print $1}\' | head -50 || systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null | grep "\\.service" | awk \'{print $1}\' | head -50',
          'echo "==>FILES<=="',
          'sudo python3 -c \'import os, sys, json, time; root_dev=os.stat("/").st_dev; skip_dirs={"/proc", "/sys", "/dev", "/run", "/tmp", "/var/tmp", "/var/log", "/var/cache", "/var/lib/docker", "/var/lib/containerd", "/lost+found"}; uptime=0;\n' +
          'try:\n' +
          '  with open("/proc/uptime") as f: uptime=float(f.read().split()[0])\n' +
          'except: pass\n' +
          'boot_time = time.time() - uptime if uptime > 0 else 0;\n' +
          'res=[];\n' +
          'for root, dirs, files in os.walk("/"):\n' +
          '  if any(root.startswith(sd) for sd in skip_dirs): dirs.clear(); continue\n' +
          '  try:\n' +
          '    if os.stat(root).st_dev != root_dev: dirs.clear(); continue\n' +
          '  except: continue\n' +
          '  for f in files:\n' +
          '    if len(res) >= 100: break\n' +
          '    path = os.path.join(root, f)\n' +
          '    try:\n' +
          '      st = os.lstat(path)\n' +
          '      if not os.path.isfile(path) or os.path.islink(path): continue\n' +
          '      if boot_time > 0 and st.st_mtime < (boot_time - 60): continue\n' +
          '      size = st.st_size\n' +
          '      mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))\n' +
          '      is_bin = False; content = ""\n' +
          '      if size <= 50000:\n' +
          '        try:\n' +
          '          with open(path, "rb") as fp: raw = fp.read()\n' +
          '          if b"\\x00" in raw:\n' +
          '            is_bin = True; content = "[File Binary - Không thể xem trước dạng text]"\n' +
          '          else:\n' +
          '            content = raw.decode("utf-8", errors="replace")\n' +
          '        except Exception as e: content = f"[Lỗi đọc file: {str(e)}]"\n' +
          '      else: content = f"[Dung lượng file ({size} bytes) vượt quá giới hạn xem trước 50KB]"\n' +
          '      res.append({"path": path, "size": size, "mtime": mtime_str, "content": content, "isBinary": is_bin})\n' +
          '    except: pass\n' +
          'print(json.dumps(res))\n' +
          '\' 2>/dev/null || python3 -c \'import os, sys, json, time; root_dev=os.stat("/").st_dev; skip_dirs={"/proc", "/sys", "/dev", "/run", "/tmp", "/var/tmp", "/var/log", "/var/cache", "/var/lib/docker", "/var/lib/containerd", "/lost+found"}; uptime=0;\n' +
          'try:\n' +
          '  with open("/proc/uptime") as f: uptime=float(f.read().split()[0])\n' +
          'except: pass\n' +
          'boot_time = time.time() - uptime if uptime > 0 else 0;\n' +
          'res=[];\n' +
          'for root, dirs, files in os.walk("/"):\n' +
          '  if any(root.startswith(sd) for sd in skip_dirs): dirs.clear(); continue\n' +
          '  try:\n' +
          '    if os.stat(root).st_dev != root_dev: dirs.clear(); continue\n' +
          '  except: continue\n' +
          '  for f in files:\n' +
          '    if len(res) >= 100: break\n' +
          '    path = os.path.join(root, f)\n' +
          '    try:\n' +
          '      st = os.lstat(path)\n' +
          '      if not os.path.isfile(path) or os.path.islink(path): continue\n' +
          '      if boot_time > 0 and st.st_mtime < (boot_time - 60): continue\n' +
          '      size = st.st_size\n' +
          '      mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))\n' +
          '      is_bin = False; content = ""\n' +
          '      if size <= 50000:\n' +
          '        try:\n' +
          '          with open(path, "rb") as fp: raw = fp.read()\n' +
          '          if b"\\x00" in raw:\n' +
          '            is_bin = True; content = "[File Binary - Không thể xem trước dạng text]"\n' +
          '          else:\n' +
          '            content = raw.decode("utf-8", errors="replace")\n' +
          '        except Exception as e: content = f"[Lỗi đọc file: {str(e)}]"\n' +
          '      else: content = f"[Dung lượng file ({size} bytes) vượt quá giới hạn xem trước 50KB]"\n' +
          '      res.append({"path": path, "size": size, "mtime": mtime_str, "content": content, "isBinary": is_bin})\n' +
          '    except: pass\n' +
          'print(json.dumps(res))\n' +
          '\' 2>/dev/null || echo "[]"',
          'echo "==>USERS<=="',
          'grep -E "/bin/(bash|sh|zsh)$" /etc/passwd 2>/dev/null',
        ].join('\n');
        const ib64 = Buffer.from(inspectScript).toString('base64');
        const ir = await this.runCommand(
          'sshpass',
          ['-p', session.vmPassword, 'ssh', '-o', 'StrictHostKeyChecking=no',
           '-o', 'UserKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=10',
           '-o', 'BatchMode=no', `${session.vmUsername}@${session.sshHost}`,
           `echo '${ib64}' | base64 -d | bash`],
          45_000,
        );
        if (!ir.spawnError && ir.exitCode === 0 && ir.stdout.trim()) {
          const out = ir.stdout;
          const MARKERS = ['==>PACKAGES<==', '==>RECENT<==', '==>SERVICES<==', '==>FILES<==', '==>USERS<=='];
          const pos = MARKERS.map((m) => out.indexOf(m));
          const sl = (fi: number, ti: number, mLen: number) =>
            fi >= 0 ? out.slice(fi + mLen, ti >= 0 ? ti : undefined).trim() : '';

          const filesRaw = sl(pos[3], pos[4], MARKERS[3].length);
          let parsedFiles: Array<{ path: string; size: number; mtime?: string; content: string; isBinary?: boolean }> = [];
          if (filesRaw) {
            try {
              parsedFiles = JSON.parse(filesRaw);
            } catch {
              parsedFiles = [];
            }
          }

          await this.prisma.imageBuildSession.update({
            where: { id: sessionId },
            data: {
              sshInspectionData: {
                status: 'success',
                collectedAt: new Date().toISOString(),
                os: pos[0] >= 0 ? out.slice(0, pos[0]).trim() : out.trim(),
                packages: sl(pos[0], pos[1], MARKERS[0].length),
                recentPackages: sl(pos[1], pos[2], MARKERS[1].length),
                services: sl(pos[2], pos[3], MARKERS[2].length),
                files: parsedFiles,
                users: sl(pos[4], -1, MARKERS[4].length),
              },
            },
          });
          this.logger.log(`[ImageBuilder] Phase 0: SSH inspection saved for session ${sessionId} (${parsedFiles.length} files modified)`);
        } else {
          this.logger.warn(`[ImageBuilder] Phase 0: SSH inspection failed — ${ir.spawnError ?? ir.stderr.slice(0, 200)}`);
        }
      }

      // Phase 1a: SSH into VM and run golden-image cleanup, then poweroff
      // poweroff closes the SSH connection abruptly — non-zero exit is expected and safe.
      if (session.sshHost && session.vmUsername && session.vmPassword) {
        const cleanupScript = [
          'sudo cloud-init clean --logs --seed',
          'sudo rm -rf /var/lib/cloud/*',
          'sudo truncate -s 0 /etc/machine-id',
          'sudo rm -f /var/lib/dbus/machine-id',
          'sudo ln -s /etc/machine-id /var/lib/dbus/machine-id',
          'sudo rm -f /etc/udev/rules.d/70-persistent-net.rules',
          'cat /dev/null > ~/.bash_history && history -c',
          'sudo poweroff',
        ].join('\n');

        const b64 = Buffer.from(cleanupScript).toString('base64');
        const r = await this.runCommand(
          'sshpass',
          [
            '-p', session.vmPassword,
            'ssh',
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=no',
            `${session.vmUsername}@${session.sshHost}`,
            `echo '${b64}' | base64 -d | bash`,
          ],
          60_000,
        );

        if (r.spawnError) {
          this.logger.warn(`[ImageBuilder] doSnapshot: sshpass unavailable — ${r.spawnError}. Will fall back to os-stop.`);
        } else {
          // poweroff terminates the connection immediately — exitCode != 0 is normal
          this.logger.log(`[ImageBuilder] doSnapshot: cleanup script sent, SSH exit=${String(r.exitCode)} (non-zero expected due to poweroff)`);
        }
      } else {
        this.logger.warn('[ImageBuilder] doSnapshot: no SSH credentials — skipping cleanup script, falling back to os-stop');
      }

      // Phase 1b: ensure VM is stopped (safety net if SSH unavailable or poweroff raced)
      if (tempServerId) {
        await axios
          .post(`${this.orchestrationUrl}/v1/openstack/servers/${tempServerId}/stop`, {},
            { headers: { 'x-user-id': session.userId }, timeout: 30000 })
          .catch((e: Error) => this.logger.warn('[ImageBuilder] os-stop: ' + e.message));

        // Poll until SHUTOFF (up to 3 min)
        for (let i = 0; i < 18; i++) {
          await new Promise<void>((r) => setTimeout(r, 10_000));
          try {
            const st = await axios.get(
              `${this.orchestrationUrl}/v1/openstack/servers/${tempServerId}/status`,
              { headers: { 'x-user-id': session.userId }, timeout: 10_000 },
            );
            if (st.data?.status === 'SHUTOFF') break;
          } catch { /* continue */ }
        }
      }

      // VM is now SHUTOFF. Stack stays alive so admin can trigger Nova snapshot on approval.
      // Glance image is NOT created here — creating it before admin review would make it
      // visible/usable in OpenStack before it has been approved.
      await this.prisma.imageBuildSession.update({
        where: { id: sessionId },
        data: { status: 'PENDING_APPROVAL' },
      });
      this.logger.log(`[ImageBuilder] Session ${sessionId}: VM stopped and ready for admin review (tempServerId=${tempServerId || 'none'})`);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[ImageBuilder] doSnapshot failed for ${sessionId}: ${msg}`);
      await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
    }
  }

  // ─── Admin methods ─────────────────────────────────────────────────────────

  async getPendingApprovals() {
    const sessions = await this.prisma.imageBuildSession.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, data: sessions };
  }

  async approveSession(adminId: string, sessionId: string) {
    const session = await this.prisma.imageBuildSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'PENDING_APPROVAL') {
      throw new NotFoundException('Session không ở trạng thái chờ duyệt');
    }
    if (!session.tempServerId) {
      throw new BadRequestException('Không tìm thấy server ID — VM đã bị xóa hoặc chưa khởi tạo');
    }

    // Mark SNAPSHOTTING immediately so the session leaves the pending list
    await this.prisma.imageBuildSession.update({
      where: { id: sessionId },
      data: { status: 'SNAPSHOTTING', approvedBy: adminId },
    });

    // Fire-and-forget: create Glance image → publish catalog → cleanup stack
    void this.doApproveSnapshot(sessionId, adminId);

    this.logger.log(`[ImageBuilder] Session ${sessionId} approved by ${adminId} — snapshot starting in background`);
    return {
      success: true,
      pending: true,
      message: 'Image đang được tạo trên OpenStack. Quá trình có thể mất 5–15 phút, sau đó image sẽ tự động xuất hiện trong catalog.',
    };
  }

  private async doApproveSnapshot(sessionId: string, adminId: string): Promise<void> {
    const session = await this.prisma.imageBuildSession.findUnique({ where: { id: sessionId } });
    if (!session?.tempServerId) return;

    const finalName = session.pendingImageName || session.targetImageName;
    const finalDesc = session.pendingImageDesc || session.targetImageDesc || '';
    const finalVisibility = session.pendingImageVisibility || 'private';

    try {
      // Phase 2: Cinder upload-to-image — uploads actual boot volume data to Glance as a raw
      // image. This produces a proper, downloadable image, unlike Nova createImage which on
      // boot-from-volume VMs only creates a size:0 Glance record backed by a Cinder snapshot
      // pointer (causing "ImageUnacceptable: format claimed qcow2 but data is different" when
      // Cinder later tries to create a new volume from that image).
      const stackName = `temp-vm-img-build-${session.id.substring(session.id.length - 6)}`;
      const effectiveStackId = session.openstackStackId || stackName;
      let bootVolumeId: string | undefined;
      try {
        const stackRes = await axios.get(
          `${this.orchestrationUrl}/v1/openstack/stacks/${stackName}/${effectiveStackId}/resources`,
          { headers: { 'x-user-id': session.userId }, timeout: 15000 },
        );
        const resources: Array<{ resourceType?: string; physicalResourceId?: string }> = stackRes.data?.data?.resources || [];
        bootVolumeId = resources.find((r) => r.resourceType === 'OS::Cinder::Volume')?.physicalResourceId;
        this.logger.log(`[ImageBuilder] doApproveSnapshot: bootVolumeId=${bootVolumeId || 'NOT FOUND'} from stack ${stackName}`);
      } catch (e) {
        this.logger.warn(`[ImageBuilder] doApproveSnapshot: stack resources fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (!bootVolumeId) {
        this.logger.error(`[ImageBuilder] doApproveSnapshot: cannot find boot volume for session ${sessionId} — Heat stack resources unavailable`);
        await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
        return;
      }

      // Clone the builder VM's boot volume instead of deleting the server/detaching the volume.
      const tempVolumeName = `voltmp-${session.id.substring(session.id.length - 6)}`;
      this.logger.log(`[ImageBuilder] doApproveSnapshot: cloning boot volume ${bootVolumeId} to ${tempVolumeName}`);
      
      const cloneRes = await axios.post(
        `${this.orchestrationUrl}/v1/openstack/volumes/${bootVolumeId}/clone`,
        { cloneName: tempVolumeName },
        { headers: { 'x-user-id': session.userId }, timeout: 30000 },
      );
      
      const tempVolumeId = cloneRes.data?.volumeId;
      if (!tempVolumeId) {
        this.logger.error(`[ImageBuilder] doApproveSnapshot: failed to clone boot volume ${bootVolumeId}`);
        await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
        return;
      }
      this.logger.log(`[ImageBuilder] doApproveSnapshot: created temp clone volume ${tempVolumeId}`);

      // Poll until temp clone volume is 'available' (up to 3 min)
      let volumeAvailable = false;
      for (let i = 0; i < 36; i++) {
        await new Promise<void>((r) => setTimeout(r, 5000));
        try {
          const volSt = await axios.get(
            `${this.orchestrationUrl}/v1/openstack/volumes/${tempVolumeId}/status`,
            { headers: { 'x-user-id': session.userId }, timeout: 10000 },
          );
          const vs = volSt.data?.status as string | undefined;
          this.logger.log(`[ImageBuilder] doApproveSnapshot: temp volume ${tempVolumeId} status=${vs ?? '?'} (poll ${i + 1}/36)`);
          if (vs === 'available') { volumeAvailable = true; break; }
          if (vs === 'error') {
            this.logger.error(`[ImageBuilder] doApproveSnapshot: temp volume ${tempVolumeId} in error state`);
            await axios.delete(`${this.orchestrationUrl}/v1/openstack/volumes/${tempVolumeId}`, { headers: { 'x-user-id': session.userId } }).catch(() => {});
            await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
            return;
          }
        } catch { /* continue polling */ }
      }

      if (!volumeAvailable) {
        this.logger.error(`[ImageBuilder] doApproveSnapshot: temp volume ${tempVolumeId} never became available after 3 min`);
        await axios.delete(`${this.orchestrationUrl}/v1/openstack/volumes/${tempVolumeId}`, { headers: { 'x-user-id': session.userId } }).catch(() => {});
        await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
        return;
      }

      this.logger.log(`[ImageBuilder] doApproveSnapshot: Cinder upload-to-image temp volume=${tempVolumeId} name="${finalName}"`);
      const uploadRes = await axios.post(
        `${this.orchestrationUrl}/v1/openstack/volumes/${tempVolumeId}/upload-image`,
        {
          imageName: finalName,
          diskFormat: 'raw',
          metadata: {
            description: finalDesc,
            sourceBaseImage: session.baseImageId,
            laas_image_type: 'custom',
            vmUsername: session.vmUsername || '',
            vmPassword: session.vmPassword || '',
            networkType: session.networkType || 'dhcp',
            networkCidr: session.cidr || '',
            staticIp: session.staticIp || '',
          },
        },
        { headers: { 'x-user-id': session.userId }, timeout: 60000 },
      );

      const glanceImageId: string | undefined = uploadRes.data?.imageId;
      if (!glanceImageId) {
        this.logger.error(`[ImageBuilder] doApproveSnapshot: no glanceImageId returned for session ${sessionId}`);
        await axios.delete(`${this.orchestrationUrl}/v1/openstack/volumes/${tempVolumeId}`, { headers: { 'x-user-id': session.userId } }).catch(() => {});
        await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
        return;
      }

      // Phase 3: poll Glance until active
      for (let polls = 0; polls < 90; polls++) {
        await new Promise<void>((r) => setTimeout(r, 10_000));
        try {
          const statusRes = await axios.get(
            `${this.orchestrationUrl}/v1/openstack/images/${glanceImageId}/status`,
            { headers: { 'x-user-id': session.userId }, timeout: 10_000 },
          );
          const imageStatus: string | undefined = statusRes.data?.status;
          if (imageStatus === 'active') break;
          if (imageStatus === 'killed' || imageStatus === 'deleted') {
            await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
            return;
          }
        } catch (e) {
          this.logger.warn(`[ImageBuilder] doApproveSnapshot poll: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Update Glance image visibility (public or private)
      await axios.patch(
        `${this.orchestrationUrl}/v1/openstack/images/${glanceImageId}/visibility`,
        { visibility: finalVisibility },
        { headers: { 'x-user-id': session.userId }, timeout: 15000 },
      ).catch((e: Error) => this.logger.warn(`[ImageBuilder] doApproveSnapshot: visibility update failed: ${e.message}`));

      // Publish to catalog
      const imageName = session.pendingImageName || session.targetImageName;
      const baseSlug = imageName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const uniqueSlug = `${baseSlug}-${session.id.slice(-8)}`;
      try {
        const catalogImage = await this.prisma.image.create({
          data: {
            name: imageName,
            slug: uniqueSlug,
            description: session.pendingImageDesc ?? undefined,
            status: 'PUBLISHED',
            createdById: session.userId,
            versions: {
              create: {
                versionNumber: 1,
                glanceImageId,
                status: 'PUBLISHED',
                createdById: session.userId,
                metadata: {
                  buildSessionId: session.id,
                  approvedBy: adminId,
                  visibility: finalVisibility,
                  baseImageId: session.baseImageId,
                  flavorId: session.flavorId,
                },
              },
            },
          },
          include: { versions: true },
        });
        this.logger.log(`[ImageBuilder] Published to catalog: imageId=${catalogImage.id}`);
      } catch (e: unknown) {
        this.logger.warn(`[ImageBuilder] doApproveSnapshot: catalog publish failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Mark COMPLETED
      await this.prisma.imageBuildSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', glanceImageId },
      });
      this.logger.log(`[ImageBuilder] Session ${sessionId}: COMPLETED, glanceImageId=${glanceImageId}`);

      // Delete the temporary clone volume (since we already uploaded the image from it)
      void axios.delete(
        `${this.orchestrationUrl}/v1/openstack/volumes/${tempVolumeId}`,
        { headers: { 'x-user-id': session.userId } },
      ).catch((e: Error) => this.logger.warn(`[ImageBuilder] temp clone volume cleanup failed: ${e.message}`));

      // Cleanup Heat stack — server already deleted above; Heat handles 404s gracefully
      // (stackName already declared above for boot-volume lookup)
      if (session.openstackStackId) {
        void axios.post(
          `${this.orchestrationUrl}/v1/openstack/stacks/${stackName}/${session.openstackStackId}/delete`,
          {},
          { headers: { 'x-user-id': session.userId } },
        ).catch((err: Error) => this.logger.warn('Lỗi cleanup temp stack: ' + err.message));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[ImageBuilder] doApproveSnapshot failed for ${sessionId}: ${msg}`);
      await this.prisma.imageBuildSession.update({ where: { id: sessionId }, data: { status: 'FAILED' } });
    }
  }

  async rejectSession(adminId: string, sessionId: string, note?: string) {
    const session = await this.prisma.imageBuildSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'PENDING_APPROVAL') {
      throw new NotFoundException('Session không ở trạng thái chờ duyệt');
    }

    await this.prisma.imageBuildSession.update({
      where: { id: sessionId },
      data: { status: 'REJECTED', rejectedBy: adminId, approvalNote: note || null },
    });

    // Cleanup the Heat stack (VM is SHUTOFF but stack + volume still exist)
    const stackName = `temp-vm-img-build-${session.id.substring(session.id.length - 6)}`;
    if (session.openstackStackId) {
      void axios.post(
        `${this.orchestrationUrl}/v1/openstack/stacks/${stackName}/${session.openstackStackId}/delete`,
        {},
        { headers: { 'x-user-id': session.userId } },
      ).catch((err: Error) => this.logger.warn(`[ImageBuilder] rejectSession: stack cleanup failed: ${err.message}`));
    }

    this.logger.log(`[ImageBuilder] Session ${sessionId} rejected by ${adminId}`);
    return { success: true, message: 'Yêu cầu đã bị từ chối' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private runCommand(
    cmd: string,
    args: string[],
    timeoutMs: number,
    extraEnv?: Record<string, string>,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; spawnError?: string }> {
    return new Promise((resolve) => {
      const env = extraEnv ? { ...process.env, ...extraEnv } : undefined;
      const proc = spawn(cmd, args, { windowsHide: true, env });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.kill('SIGKILL');
          resolve({ stdout, stderr, exitCode: null, timedOut: true });
        }
      }, timeoutMs);

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code, timedOut: false });
        }
      });

      proc.on('error', (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: null, timedOut: false, spawnError: err.message });
        }
      });
    });
  }

  // ─── Inspect endpoint ──────────────────────────────────────────────────────

  async inspectSession(sessionId: string) {
    const session = await this.prisma.imageBuildSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session không tồn tại');

    // ── 1. SSH inspection — read pre-collected data from DB ────────────────────
    // Data was collected during doSnapshotBackground Phase 0 while VM was still ACTIVE.
    // Never attempt live SSH here — VM is SHUTOFF after snapshotting.
    type InspectFileItem = {
      path: string;
      size: number;
      mtime?: string;
      content: string;
      isBinary?: boolean;
    };

    type SshInspection = {
      status: 'success' | 'error' | 'unavailable';
      error?: string;
      collectedAt?: string;
      os?: string;
      packages?: string;
      recentPackages?: string;
      services?: string;
      disk?: string;
      files?: InspectFileItem[];
      users?: string;
    };

    let sshInspection: SshInspection;
    if (session.sshInspectionData) {
      const d = session.sshInspectionData as Record<string, unknown>;
      let parsedFiles: InspectFileItem[] | undefined;
      if (d['files']) {
        let rawList: unknown[] = [];
        if (Array.isArray(d['files'])) {
          rawList = d['files'];
        } else if (typeof d['files'] === 'string') {
          try {
            const parsed = JSON.parse(d['files']);
            if (Array.isArray(parsed)) rawList = parsed;
          } catch {
            rawList = [];
          }
        }
        parsedFiles = rawList
          .map((item: any) => {
            if (typeof item === 'string') {
              return { path: item, size: 0, content: '' };
            }
            return {
              path: String(item?.path || item?.name || item?.filename || ''),
              size: typeof item?.size === 'number' ? item.size : (Number(item?.size) || 0),
              mtime: item?.mtime ? String(item.mtime) : undefined,
              content: String(item?.content || ''),
              isBinary: Boolean(item?.isBinary),
            };
          })
          .filter((f) => Boolean(f.path));
      }

      sshInspection = {
        status: 'success',
        collectedAt: d['collectedAt'] as string | undefined,
        os: d['os'] as string | undefined,
        packages: d['packages'] as string | undefined,
        recentPackages: d['recentPackages'] as string | undefined,
        services: d['services'] as string | undefined,
        disk: d['disk'] as string | undefined,
        files: parsedFiles,
        users: d['users'] as string | undefined,
      };
    } else {
      sshInspection = {
        status: 'unavailable',
        error: 'Chưa có dữ liệu SSH — session cũ hoặc VM không SSH được lúc bắt đầu snapshot',
      };
    }

    // ── 2. virt-inspector on base image — runs locally on this server, result cached by imageId ──
    let virtInspector: { status: string; xml?: string; error?: string };
    try {
      const viRes = await axios.get<{ success: boolean; xml?: string; message?: string }>(
        `${this.orchestrationUrl}/v1/openstack/images/${session.baseImageId}/virt-inspect`,
        { timeout: 700_000 }, // ensureImageLocal up to 660s + virt-inspector 90s
      );
      virtInspector = viRes.data.success
        ? { status: 'success', xml: viRes.data.xml }
        : { status: 'failed', error: viRes.data.message };
    } catch (e) {
      virtInspector = { status: 'unavailable', error: e instanceof Error ? e.message : String(e) };
    }

    // ── 3. Package diff: VM packages (from SSH data) vs base packages (from virt-inspector XML)
    // No image download, no virt-diff — just compare two package name lists.
    type PackageDiff = { status: string; added?: string[]; removed?: string[]; unchanged?: number; error?: string };
    let packageDiff: PackageDiff;

    const vmPackageStr = (session.sshInspectionData as Record<string, string> | null)?.['packages'] ?? '';
    const baseXml = virtInspector.status === 'success' ? (virtInspector.xml ?? '') : '';

    // Parse VM packages from rpm -qa output (one "name-version-release.arch" per line).
    // Extract package NAME by stripping from the first "-digit" onward.
    const parseRpmNames = (raw: string): Set<string> => {
      const s = new Set<string>();
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        const m = t.match(/^(.+?)-(?:\d+:)?\d/);
        if (m) s.add(m[1]);
      }
      return s;
    };

    // Parse base packages from virt-inspector XML <application><name>…</name></application>.
    const parseXmlNames = (xml: string): Set<string> => {
      const s = new Set<string>();
      for (const m of xml.matchAll(/<application>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/application>/g)) {
        s.add(m[1].trim());
      }
      return s;
    };

    if (!vmPackageStr) {
      // VM package data was never collected (old session or SSH failed during Phase 0).
      // Cannot diff without VM packages — showing base-only removed list would be misleading.
      packageDiff = {
        status: 'unavailable',
        error: 'Chưa có dữ liệu package từ VM — SSH inspection chưa được thu thập lúc snapshot',
      };
    } else {
      const vmPkgs = parseRpmNames(vmPackageStr);
      const basePkgs = baseXml ? parseXmlNames(baseXml) : new Set<string>();

      const added = [...vmPkgs].filter((p) => !basePkgs.has(p)).sort();
      const removed = [...basePkgs].filter((p) => !vmPkgs.has(p)).sort();
      const unchanged = [...vmPkgs].filter((p) => basePkgs.has(p)).length;

      packageDiff = {
        status: baseXml ? 'success' : 'partial',
        added,
        removed: baseXml ? removed : undefined,
        unchanged: baseXml ? unchanged : undefined,
        error: baseXml ? undefined : 'Base image chưa được phân tích (virt-inspector chưa chạy hoặc thất bại)',
      };
    }

    return {
      success: true,
      data: {
        session: {
          id: session.id,
          userId: session.userId,
          baseImageId: session.baseImageId,
          flavorId: session.flavorId,
          targetImageName: session.targetImageName,
          pendingImageName: session.pendingImageName,
          pendingImageDesc: session.pendingImageDesc,
          pendingImageVisibility: session.pendingImageVisibility,
          status: session.status,
          sshHost: session.sshHost,
          vmUsername: session.vmUsername,
          glanceImageId: session.glanceImageId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        sshInspection,
        virtInspector,
        packageDiff,
      },
    };
  }
}