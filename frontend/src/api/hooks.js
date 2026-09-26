import { useQuery } from '@tanstack/react-query';
import { api, useAreaParams } from './client';

/** useQuery gắn sẵn bộ lọc địa phương vào khoá & tham số. */
export function useAreaQuery(key, path, extra = {}, options = {}) {
  const area = useAreaParams();
  return useQuery({
    queryKey: [key, area.admin_codes || 'CB', extra],
    queryFn: () => api(path, { params: { ...area, ...extra } }),
    ...options,
  });
}

export const useUnits = () => useQuery({ queryKey: ['units'], queryFn: () => api('/admin-units', { params: { level: 'xa' } }), staleTime: Infinity });
export const usePresets = () => useQuery({ queryKey: ['presets'], queryFn: () => api('/admin-units/presets'), staleTime: Infinity });
export const useUnitsGeo = () => useQuery({ queryKey: ['units-geo'], queryFn: () => api('/admin-units/geojson'), staleTime: Infinity });
