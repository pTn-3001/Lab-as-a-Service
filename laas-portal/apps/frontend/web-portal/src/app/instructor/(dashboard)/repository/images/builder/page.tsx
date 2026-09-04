'use client';

import { ArrowLeft, Cpu, HardDrive, MonitorPlay, Network, Key } from 'lucide-react';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button, Input, Label } from '@laas-portal/ui';

type DynamicImage = {
  id: string;
  name: string;
  os: string;
  icon: string;
};

type DynamicFlavor = {
  id: string;
  name: string;
  vcpus: number;
  ram: number;
  disk: number;
};

type OpenStackImageItem = {
  id?: string;
  name?: string;
};

type OpenStackFlavorItem = {
  id?: string;
  name?: string;
  vcpus?: number | string;
  ram?: number | string;
  disk?: number | string;
};

function getOSFromImageName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('win')) return { os: 'Windows', icon: '🪟' };
  if (
    lower.includes('ubuntu') ||
    lower.includes('centos') ||
    lower.includes('debian') ||
    lower.includes('linux')
  )
    return { os: 'Linux', icon: '🐧' };
  return { os: 'Linux/Other', icon: '💿' };
}

function getBootVolumeSizeForFlavor(flavorName: string): number {
  const normalizedName = flavorName.trim().toLowerCase();
  const bootVolumeSizeByFlavor: Record<string, number> = {
    'lab.nano': 5,
    'lab.micro': 10,
    'lab.small': 15,
    'lab.medium': 20,
    'lab.large': 40,
    'lab.xlarge': 80,
    'lab.2xlarge': 160,
    'lab.db-small': 30,
    'lab.db-medium': 60,
    'lab.db-large': 120,
    'lab.compute': 20,
    'lab.memory': 20,
    'lab.win-small': 60,
    'lab.win-med': 100,
  };

  return bootVolumeSizeByFlavor[normalizedName] ?? 20;
}

function formatFlavorSummary(flavor: DynamicFlavor) {
  const ramGb = Math.max(1, Math.round(flavor.ram / 1024));
  const diskGb = getBootVolumeSizeForFlavor(flavor.name);

  return `${flavor.vcpus} vCPU / ${ramGb}GB RAM / ${diskGb}GB Disk`;
}




export default function CustomImageBuilderStep1() {
  const router = useRouter();
  const [dynamicImages, setDynamicImages] = useState<DynamicImage[]>([]);
  const [dynamicFlavors, setDynamicFlavors] = useState<DynamicFlavor[]>([]);

  const [selectedBase, setSelectedBase] = useState<string>('');
  const [selectedFlavor, setSelectedFlavor] = useState<string>('');
  const [imageName, setImageName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // New configuration states: network & VM credentials
  const [networkType, setNetworkType] = useState<'dhcp' | 'static'>('dhcp');
  const [cidr, setCidr] = useState('10.20.200.0/24');
  const [staticIp, setStaticIp] = useState('');
  const [vmUsername, setVmUsername] = useState('instructor');
  const [vmPassword, setVmPassword] = useState('Laas@2026');

  useEffect(() => {
    let isActive = true;

    async function loadOpenstackOptions() {
      try {
        const imageResponse = await fetch('/api/images?userId=admin-portal-user');
        const imagePayload = await imageResponse.json();
        if (imageResponse.ok && imagePayload?.success) {
          const fetchedImages = (imagePayload.data?.images || []).map(
            (item: OpenStackImageItem) => {
              const name = item.name || '';
              const { os, icon } = getOSFromImageName(name);
              return { id: item.id || name, name, os, icon };
            }
          );
          if (isActive && fetchedImages.length > 0) {
            setDynamicImages(fetchedImages);
            setSelectedBase(fetchedImages[0].id);
          }
        }

        const flavorResponse = await fetch('/api/flavors?userId=admin-portal-user');
        const flavorPayload = await flavorResponse.json();
        if (flavorResponse.ok && flavorPayload?.success) {
          const fetchedFlavors = (flavorPayload.data?.flavors || [])
            .map((item: OpenStackFlavorItem) => ({
              id: item.id || item.name || '',
              name: item.name || '',
              vcpus: Number(item.vcpus || 0),
              ram: Number(item.ram || 0),
              disk: Number(item.disk || 0),
            }))
            .filter((f: DynamicFlavor) => f.name);
          if (isActive && fetchedFlavors.length > 0) {
            setDynamicFlavors(fetchedFlavors);
            setSelectedFlavor(fetchedFlavors[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load OpenStack options', err);
      }
    }

    loadOpenstackOptions();

    return () => {
      isActive = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageName.trim() || !selectedBase || !selectedFlavor) return;
    if (networkType === 'static' && !staticIp.trim()) {
      setSubmitError('Vui lòng nhập IP tĩnh cho cấu hình mạng static.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const requestBody = {
        baseImageId: selectedBase,
        flavorId: selectedFlavor,
        targetImageName: imageName,
        targetImageDesc: `Image tùy biến từ base ${selectedBase} với cấu hình ${selectedFlavor}`,
        networkType,
        cidr,
        staticIp: networkType === 'static' ? staticIp.trim() : '',
        vmUsername: vmUsername.trim() || 'instructor',
        vmPassword: vmPassword.trim() || 'Laas@2026',
      };

      // Gọi BFF route (Next.js API) thay vì lab-service trực tiếp
      // Browser không thể kết nối 127.0.0.1:3003 — phải đi qua proxy
      const response = await fetch('/api/image-builder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'instructor@robusta.vn',
        },
        body: JSON.stringify(requestBody),
        cache: 'no-store',
      });

      const payload = await response.json();
      if (response.ok && payload.success && payload.sessionId) {
        router.push(
          `/instructor/custom-image/console/${payload.sessionId}?name=${encodeURIComponent(imageName)}`
        );
      } else {
        setSubmitError(
          payload.message ||
            'Không thể khởi tạo phiên làm việc của VM mẫu. Vui lòng kiểm tra lại cấu hình.'
        );
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Failed to create custom image session', err);
      const detail = err instanceof Error ? err.message : '';
      setSubmitError(
        `Đã xảy ra lỗi hệ thống khi kết nối tới dịch vụ khởi tạo VM.${detail ? ` (${detail})` : ''}`
      );
      setIsSubmitting(false);
    }
  };


  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/instructor/repository/images" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tạo Custom Image mới</h1>
          <p className="text-sm text-gray-500">
            Khởi tạo môi trường mẫu (Temp VM) để tùy biến Image mới.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        {/* Step 1: Base Image */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <HardDrive className="h-5 w-5 text-orange-600" />
            1. Chọn Hệ điều hành gốc (Base Image)
          </h2>
          <div className="max-w-2xl space-y-2">
            <Label htmlFor="baseImage">Image gốc</Label>
            <div className="relative">
              <select
                id="baseImage"
                value={selectedBase}
                onChange={(event) => setSelectedBase(event.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm text-gray-900 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              >
                <option value="" disabled>
                  {dynamicImages.length === 0
                    ? 'Đang tải danh sách Images từ OpenStack...'
                    : 'Chọn image gốc'}
                </option>
                {dynamicImages.map((img) => (
                  <option key={img.id} value={img.id}>
                    {img.name} - {img.os}
                  </option>
                ))}
              </select>
            </div>
            {selectedBase && (
              <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-gray-700">
                {dynamicImages.find((img) => img.id === selectedBase)?.icon || '💿'}{' '}
                {dynamicImages.find((img) => img.id === selectedBase)?.name || selectedBase}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Flavor */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <Cpu className="h-5 w-5 text-orange-600" />
            2. Chọn Cấu hình (Flavor)
          </h2>
          <div className="max-w-2xl space-y-2">
            <Label htmlFor="flavor">Flavor</Label>
            <div className="relative">
              <select
                id="flavor"
                value={selectedFlavor}
                onChange={(event) => setSelectedFlavor(event.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm text-gray-900 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              >
                <option value="" disabled>
                  {dynamicFlavors.length === 0
                    ? 'Đang tải danh sách Flavors từ OpenStack...'
                    : 'Chọn flavor'}
                </option>
                {dynamicFlavors.map((flavor) => (
                  <option key={flavor.id} value={flavor.id}>
                    {flavor.name} - {formatFlavorSummary(flavor)}
                  </option>
                ))}
              </select>
            </div>
            {selectedFlavor && (
              <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-gray-700">
                {dynamicFlavors.find((flavor) => flavor.id === selectedFlavor)?.name ||
                  selectedFlavor}{' '}
                -{' '}
                {dynamicFlavors.find((flavor) => flavor.id === selectedFlavor)
                  ? formatFlavorSummary(
                      dynamicFlavors.find((flavor) => flavor.id === selectedFlavor) as DynamicFlavor
                    )
                  : ''}
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Cấu hình Mạng */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <Network className="h-5 w-5 text-orange-600" />
            3. Cấu hình Mạng
          </h2>
          <div className="max-w-2xl space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cidr">Dải mạng (CIDR Subnet)</Label>
              <Input
                id="cidr"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                placeholder="VD: 10.20.200.0/24"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="networkType">Kiểu cấp phát IP</Label>
                <select
                  id="networkType"
                  value={networkType}
                  onChange={(e) => setNetworkType(e.target.value as 'dhcp' | 'static')}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="dhcp">DHCP (Tự động)</option>
                  <option value="static">Static IP (Tĩnh)</option>
                </select>
              </div>

              {networkType === 'static' && (
                <div className="space-y-2">
                  <Label htmlFor="staticIp">Địa chỉ IP Tĩnh</Label>
                  <Input
                    id="staticIp"
                    value={staticIp}
                    onChange={(e) => setStaticIp(e.target.value)}
                    placeholder="VD: 10.20.200.253"
                    required
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 4: Thông tin Tài khoản SSH */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <Key className="h-5 w-5 text-orange-600" />
            4. Thông tin Tài khoản SSH
          </h2>
          <div className="max-w-2xl grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vmUsername">Tên đăng nhập</Label>
              <Input
                id="vmUsername"
                value={vmUsername}
                onChange={(e) => setVmUsername(e.target.value)}
                placeholder="instructor"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vmPassword">Mật khẩu</Label>
              <Input
                id="vmPassword"
                type="text"
                value={vmPassword}
                onChange={(e) => setVmPassword(e.target.value)}
                placeholder="Laas@2026"
                required
              />
            </div>
          </div>
        </div>

        {/* Step 5: Metadata */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <MonitorPlay className="h-5 w-5 text-orange-600" />
            5. Thông tin Image thành phẩm
          </h2>
          <div className="max-w-lg space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="imageName">
                Tên Image đích <span className="text-red-500">*</span>
              </Label>
              <Input
                id="imageName"
                placeholder="VD: Bài thực hành Docker nâng cao..."
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {submitError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span className="mt-0.5 text-red-500">⚠</span>
            <div>
              <p className="font-medium">Lỗi khởi tạo VM</p>
              <p className="mt-1 text-red-700">{submitError}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-gray-100 pt-4">
          <Button
            type="submit"
            className="min-w-40 bg-orange-600 hover:bg-orange-700"
            disabled={!imageName.trim() || isSubmitting}
          >
            {isSubmitting ? 'Đang khởi tạo VM...' : 'Khởi tạo VM cấu hình'}
          </Button>
        </div>
      </form>
    </div>
  );
}
