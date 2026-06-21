
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const getApiUrl = (path: string) => {
  // If it's already an absolute URL, return it
  if (path.startsWith('http')) return path;
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Combine base and path
  return `${API_BASE_URL}${normalizedPath}`;
};

export default API_BASE_URL;
