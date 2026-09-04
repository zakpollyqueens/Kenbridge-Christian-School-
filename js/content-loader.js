/**
 * Content Loader
 * Dynamically loads and displays content from backend APIs
 */

/**
 * Load announcements from backend
 * @param {string} containerId - ID of container to render announcements
 * @param {number} limit - Number of announcements to load (default: 6)
 */
async function loadAnnouncements(containerId = 'announcementsContainer', limit = 6) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.warn(`Container with ID "${containerId}" not found`);
    return;
  }
  
  try {
    // Show loading state
    container.innerHTML = '<p class="loading">Loading announcements...</p>';
    
    // Fetch announcements from backend
    const response = await apiGet(`${API_ENDPOINTS.public.announcements}?limit=${limit}`);
    
    if (response.success && response.data && response.data.length > 0) {
      // Clear loading state
      container.innerHTML = '';
      
      // Render each announcement
      response.data.forEach(announcement => {
        const announcementCard = createAnnouncementCard(announcement);
        container.appendChild(announcementCard);
      });
    } else {
      container.innerHTML = '<p class="no-content">No announcements at this time.</p>';
    }
  } catch (error) {
    console.error('Error loading announcements:', error);
    container.innerHTML = '<p class="error">Unable to load announcements. Please try again later.</p>';
  }
}

/**
 * Create announcement card element
 */
function createAnnouncementCard(announcement) {
  const card = document.createElement('article');
  card.className = 'feature-card announcement-card';
  
  const date = new Date(announcement.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  card.innerHTML = `
    <div class="announcement-header">
      <h3>${escapeHtml(announcement.title)}</h3>
      <span class="announcement-date">${date}</span>
    </div>
    <p class="announcement-content">${escapeHtml(announcement.content.substring(0, 150))}...</p>
    <a href="announcements.html#${announcement.id}" class="btn btn-primary">Read More</a>
  `;
  
  return card;
}

/**
 * Load articles from backend
 * @param {string} containerId - ID of container to render articles
 * @param {number} limit - Number of articles to load (default: 6)
 */
async function loadArticles(containerId = 'articlesContainer', limit = 6) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.warn(`Container with ID "${containerId}" not found`);
    return;
  }
  
  try {
    container.innerHTML = '<p class="loading">Loading articles...</p>';
    
    const response = await apiGet(`${API_ENDPOINTS.public.articles}?limit=${limit}`);
    
    if (response.success && response.data && response.data.length > 0) {
      container.innerHTML = '';
      
      response.data.forEach(article => {
        const articleCard = createArticleCard(article);
        container.appendChild(articleCard);
      });
    } else {
      container.innerHTML = '<p class="no-content">No articles at this time.</p>';
    }
  } catch (error) {
    console.error('Error loading articles:', error);
    container.innerHTML = '<p class="error">Unable to load articles. Please try again later.</p>';
  }
}

/**
 * Create article card element
 */
function createArticleCard(article) {
  const card = document.createElement('article');
  card.className = 'feature-card article-card';
  
  const date = new Date(article.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  card.innerHTML = `
    <div class="article-image">
      <img src="${escapeHtml(article.imageUrl || '/images/placeholder.png')}" 
           alt="${escapeHtml(article.title)}"
           loading="lazy">
    </div>
    <h3>${escapeHtml(article.title)}</h3>
    <p class="article-meta">By ${escapeHtml(article.author || 'Kenbridge')} • ${date}</p>
    <p class="article-excerpt">${escapeHtml(article.excerpt || article.content.substring(0, 150))}</p>
    <a href="articles.html#${article.id}" class="btn btn-primary">Read Article</a>
  `;
  
  return card;
}

/**
 * Load gallery images from backend
 * @param {string} containerId - ID of container to render gallery
 * @param {number} limit - Number of images to load (default: 9)
 */
async function loadGallery(containerId = 'galleryContainer', limit = 9) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.warn(`Container with ID "${containerId}" not found`);
    return;
  }
  
  try {
    container.innerHTML = '<p class="loading">Loading gallery...</p>';
    
    const response = await apiGet(`${API_ENDPOINTS.public.gallery}?limit=${limit}`);
    
    if (response.success && response.data && response.data.length > 0) {
      container.innerHTML = '';
      
      response.data.forEach((image, index) => {
        const imageElement = createGalleryImage(image, index);
        container.appendChild(imageElement);
      });
      
      // Initialize lightbox if available
      if (typeof initLightbox === 'function') {
        initLightbox();
      }
    } else {
      container.innerHTML = '<p class="no-content">No gallery images at this time.</p>';
    }
  } catch (error) {
    console.error('Error loading gallery:', error);
    container.innerHTML = '<p class="error">Unable to load gallery. Please try again later.</p>';
  }
}

/**
 * Create gallery image element
 */
function createGalleryImage(image, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'gallery-image-wrapper';
  
  const img = document.createElement('img');
  img.src = escapeHtml(image.imageUrl);
  img.alt = escapeHtml(image.title || `Gallery Image ${index + 1}`);
  img.loading = 'lazy';
  img.className = 'gallery-image';
  
  img.addEventListener('click', function() {
    openLightbox(image.imageUrl, image.title);
  });
  
  wrapper.appendChild(img);
  
  if (image.title) {
    const title = document.createElement('p');
    title.className = 'gallery-title';
    title.textContent = escapeHtml(image.title);
    wrapper.appendChild(title);
  }
  
  return wrapper;
}

/**
 * Simple lightbox modal for gallery
 */
function openLightbox(imageUrl, title = '') {
  const modal = document.createElement('div');
  modal.className = 'lightbox-modal';
  modal.id = 'lightboxModal';
  
  modal.innerHTML = `
    <div class="lightbox-content">
      <button class="lightbox-close" type="button" aria-label="Close">×</button>
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" class="lightbox-image">
      ${title ? `<p class="lightbox-title">${escapeHtml(title)}</p>` : ''}
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on button click
  modal.querySelector('.lightbox-close').addEventListener('click', function() {
    modal.remove();
  });
  
  // Close on overlay click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', function closeOnEscape(e) {
    if (e.key === 'Escape' && document.getElementById('lightboxModal')) {
      document.getElementById('lightboxModal').remove();
      document.removeEventListener('keydown', closeOnEscape);
    }
  });
}

/**
 * HTML escape helper to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize all content loaders on appropriate pages
 */
document.addEventListener('DOMContentLoaded', function() {
  // Only load on index/home page
  if (document.body.classList.contains('page-home') || document.location.pathname === '/') {
    loadAnnouncements('announcementsContainer', 3);
    loadArticles('articlesContainer', 3);
  }
  
  // Load on announcements page
  if (document.body.classList.contains('page-announcements')) {
    loadAnnouncements('announcementsListContainer', 20);
  }
  
  // Load on articles page
  if (document.body.classList.contains('page-articles')) {
    loadArticles('articlesListContainer', 20);
  }
  
  // Load on gallery page
  if (document.body.classList.contains('page-gallery')) {
    loadGallery('galleryListContainer', 30);
  }
});
