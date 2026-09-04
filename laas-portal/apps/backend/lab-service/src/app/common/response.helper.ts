// Small response-shaping helpers used by controllers for consistent API contracts.
export function successResponse(message: string, data?: any) {
  return { success: true, message, data };
}

export function paginatedResponse(items: any[], pagination: PaginationMeta) {
  return { success: true, data: { items, pagination } };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Shared pagination builder for list endpoints.
export function buildPagination(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
