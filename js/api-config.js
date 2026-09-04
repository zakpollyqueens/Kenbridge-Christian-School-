/**
 * API Configuration
 * Centralized backend API configuration for all pages
 */

// Detect environment and set API base URL
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const isDevelopment = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    return isDevelopment 
      ? 'http://localhost:5000/api'
      : `${window.location.origin}/api`;
  }
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

// API endpoints mapping
const API_ENDPOINTS = {
  // Authentication
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    register: '/auth/register',
    verify: '/auth/verify',
  },
  
  // Public content (announcements, articles, gallery)
  public: {
    announcements: '/public/announcements',
    articles: '/public/articles',
    gallery: '/public/gallery',
  },
  
  // Contact & Feedback
  submissions: {
    contactForm: '/submissions/contact',
    feedback: '/submissions/feedback',
    admissions: '/submissions/admissions',
  },
  
  // Admin content management
  content: {
    announcements: '/content/announcements',
    articles: '/content/articles',
    gallery: '/content/gallery',
  },
};

/**
 * Generic API request handler
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };
  
  try {
    const response = await fetch(url, mergedOptions);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API Request Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * GET request
 */
function apiGet(endpoint) {
  return apiRequest(endpoint, { method: 'GET' });
}

/**
 * POST request
 */
function apiPost(endpoint, data) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * PUT request
 */
function apiPut(endpoint, data) {
  return apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * DELETE request
 */
function apiDelete(endpoint) {
  return apiRequest(endpoint, { method: 'DELETE' });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_BASE_URL,
    API_ENDPOINTS,
    apiRequest,
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
  };
}
