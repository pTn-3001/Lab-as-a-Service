'use client';

import {
  Copy,
  Cpu,
  Edit,
  Eye,
  Globe,
  HardDrive,
  Lock,
  MemoryStick,
  MoreVertical,
  Server,
  Trash,
  Users,
} from 'lucide-react';

import { useEffect, useState } from 'react';

import { Badge, SearchBar } from '@laas-portal/ui';
import { ensureValidToken, getStoredUser } from '../../../../../lib/auth';

type FlavorVisibility = 'public' | 'private' | 'group';

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

function getBootVolumeSizeForFlavor(flavorName: string, fallbackDisk: number): number {
  const normalizedName = flavorName.trim().toLowerCase();
  const mappedSize = bootVolumeSizeByFlavor[normalizedName];

  if (typeof mappedSize === 'number') {
    return mappedSize;
  }

  if (Number.isFinite(fallbackDisk) && fallbackDisk > 0) {
    return Math.floor(fallbackDisk);
  }

  return 20;
}

type FlavorRow = {
  id: string;
  name: string;
  description: string;
  vcpus: number;
  ram: number;
  disk: number;
  swap: number;
  visibility: FlavorVisibility;
  isPublic: boolean;
  group?: string;
  createdBy: string;
  createdAt: string;
  usageCount: number;
};

export default function InstructorFlavorsPage() {
  const [apiFlavors, setApiFlavors] = useState<FlavorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisibility, setFilterVisibility] = useState<string>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadFlavors() {
      setIsLoading(true);
      setLoadError('');

      try {
        const token = await ensureValidToken();
        const storedUser = getStoredUser();
        const userId = storedUser?.id || 'admin-portal-user';

        const response = await fetch(`/api/flavors?userId=${encodeURIComponent(userId)}`, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        });

        const payload = (await response.json()) as {
          success?: boolean;
          message?: string;
          data?: {
            flavors?: Array<Record<string, unknown>>;
          };
        };

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || 'Không thể tải danh sách flavor');
        }

        const normalized = (payload.data?.flavors ?? []).map((item) => {
          const isPublic = Boolean(item.isPublic ?? true);
          return {
            id: String(item.id ?? ''),
            name: String(item.name ?? 'unknown'),
            description: String(item.description ?? ''),
            vcpus: Number(item.vcpus ?? 0),
            ram: Number(item.ram ?? 0),
            disk: Number(item.disk ?? 0),
            swap: Number(item.swap ?? 0),
            visibility: (String(item.visibility ?? (isPublic ? 'public' : 'private')) === 'private'
              ? 'private'
              : 'public') as FlavorVisibility,
            isPublic,
            createdBy: 'openstack',
            createdAt: new Date().toISOString().slice(0, 10),
            usageCount: 0,
          } satisfies FlavorRow;
        });

        if (isActive) {
          setApiFlavors(normalized);
        }
      } catch (error) {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách flavor');
          setApiFlavors([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadFlavors();

    return () => {
      isActive = false;
    };
  }, []);

  const flavors = apiFlavors;

  const filteredFlavors = flavors.filter((flavor) => {
    const matchesSearch =
      flavor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flavor.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVisibility = filterVisibility === 'all' || flavor.visibility === filterVisibility;
    return matchesSearch && matchesVisibility;
  });

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Globe className="h-4 w-4" />;
      case 'private':
        return <Lock className="h-4 w-4" />;
      case 'group':
        return <Users className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const formatSize = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(0)} GB`;
    }
    return `${mb} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Quản lý Flavors</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý VM flavors - cấu hình phần cứng cho OpenStack instances
          </p>
          {isLoading && (
            <p className="mt-2 text-xs text-blue-600">Đang đồng bộ flavors từ OpenStack...</p>
          )}
          {loadError && (
            <p className="mt-2 text-xs text-red-600">
              Không tải được danh sách flavor từ OpenStack: {loadError}
            </p>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng Flavors</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{flavors.length}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Public Flavors</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {flavors.filter((f) => f.visibility === 'public').length}
              </p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <Globe className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Private Flavors</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {flavors.filter((f) => f.visibility === 'private').length}
              </p>
            </div>
            <div className="rounded-full bg-orange-100 p-3">
              <Lock className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Group Flavors</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {flavors.filter((f) => f.visibility === 'group').length}
              </p>
            </div>
            <div className="rounded-full bg-purple-100 p-3">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchBar
            placeholder="Tìm kiếm flavor theo tên, mô tả..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">Tất cả Visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="group">Group</option>
          </select>
        </div>
      </div>

      {/* Flavors Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-600">
              <tr>
                <th className="whitespace-nowrap px-6 py-4">Flavor Name</th>
                <th className="whitespace-nowrap px-6 py-4">vCPUs</th>
                <th className="whitespace-nowrap px-6 py-4">RAM</th>
                <th className="whitespace-nowrap px-6 py-4">Boot Volume</th>
                <th className="whitespace-nowrap px-6 py-4">Swap</th>
                <th className="whitespace-nowrap px-6 py-4">Visibility</th>
                <th className="whitespace-nowrap px-6 py-4">Created by</th>
                <th className="whitespace-nowrap px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredFlavors.map((flavor) => (
                <tr key={flavor.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{flavor.name}</div>
                      <div className="text-xs text-gray-500">{flavor.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-gray-900">{flavor.vcpus}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <MemoryStick className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-gray-900">{formatSize(flavor.ram)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-gray-900">
                        {getBootVolumeSizeForFlavor(flavor.name, flavor.disk)} GB
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {flavor.swap > 0 ? formatSize(flavor.swap) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getVisibilityIcon(flavor.visibility)}
                      <span className="text-sm capitalize text-gray-700">{flavor.visibility}</span>
                      {flavor.visibility === 'group' && flavor.group && (
                        <Badge variant="outline" className="ml-1 text-xs">
                          {flavor.group}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-gray-600">
                      <div>{flavor.createdBy}</div>
                      <div>{flavor.createdAt}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === flavor.id ? null : flavor.id)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openMenuId === flavor.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute bottom-full right-0 z-20 mb-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Eye className="h-4 w-4" />
                              View Details
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Copy className="h-4 w-4" />
                              Clone Flavor
                            </button>
                            <div className="my-1 border-t border-gray-100" />
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Edit className="h-4 w-4" />
                              Edit Flavor
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              onClick={() => setOpenMenuId(null)}
                              title={
                                flavor.usageCount > 0 ? 'Cannot delete flavor in use' : undefined
                              }
                              disabled={flavor.usageCount > 0}
                            >
                              <Trash className="h-4 w-4" />
                              Delete Flavor
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
          <span className="text-xs text-gray-500">
            Hiển thị {filteredFlavors.length} trên tổng số {flavors.length} flavors
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
              disabled
            >
              Trước
            </button>
            <button className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50">
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
