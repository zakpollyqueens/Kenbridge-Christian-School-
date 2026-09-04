/**
 * Form Handlers
 * Handles form submissions across all pages
 */

/**
 * Contact Form Handler
 * Submits contact form data to backend
 */
function initContactFormHandler() {
  const contactForm = document.getElementById('contactForm');
  const contactStatus = document.getElementById('contactStatus');
  
  if (!contactForm) return;
  
  contactForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    // Get form data
    const formData = {
      name: document.getElementById('contactName')?.value || '',
      email: document.getElementById('contactEmail')?.value || '',
      phone: document.getElementById('contactPhone')?.value || '',
      subject: document.getElementById('contactSubject')?.value || '',
      message: document.getElementById('contactMessage')?.value || '',
      submittedAt: new Date().toISOString(),
    };
    
    // Validate required fields
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      if (contactStatus) {
        contactStatus.textContent = 'Please fill in all required fields.';
        contactStatus.classList.add('error');
        contactStatus.classList.remove('success');
      }
      return;
    }
    
    try {
      // Update UI to show loading state
      const submitButton = contactForm.querySelector('button[type="submit"]');
      const originalText = submitButton?.textContent;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }
      
      // Send to backend
      const response = await apiPost(API_ENDPOINTS.submissions.contactForm, formData);
      
      if (response.success) {
        if (contactStatus) {
          contactStatus.textContent = 'Thank you! Your message has been received. We will get back to you soon.';
          contactStatus.classList.add('success');
          contactStatus.classList.remove('error');
        }
        contactForm.reset();
      } else {
        throw new Error(response.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Contact form submission error:', error);
      if (contactStatus) {
        contactStatus.textContent = 'Error sending message. Please try again or call us directly.';
        contactStatus.classList.add('error');
        contactStatus.classList.remove('success');
      }
    } finally {
      const submitButton = contactForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

/**
 * Feedback Form Handler
 * Submits feedback form data to backend
 */
function initFeedbackFormHandler() {
  const feedbackForm = document.getElementById('feedbackForm');
  const feedbackStatus = document.getElementById('feedbackStatus');
  
  if (!feedbackForm) return;
  
  feedbackForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const formData = {
      name: document.getElementById('feedbackName')?.value || '',
      email: document.getElementById('feedbackEmail')?.value || '',
      category: document.getElementById('feedbackCategory')?.value || 'general',
      message: document.getElementById('feedbackMessage')?.value || '',
      submittedAt: new Date().toISOString(),
    };
    
    if (!formData.name || !formData.email || !formData.message) {
      if (feedbackStatus) {
        feedbackStatus.textContent = 'Please fill in all required fields.';
        feedbackStatus.classList.add('error');
        feedbackStatus.classList.remove('success');
      }
      return;
    }
    
    try {
      const submitButton = feedbackForm.querySelector('button[type="submit"]');
      const originalText = submitButton?.textContent;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }
      
      const response = await apiPost(API_ENDPOINTS.submissions.feedback, formData);
      
      if (response.success) {
        if (feedbackStatus) {
          feedbackStatus.textContent = 'Thank you for your feedback! We appreciate your input.';
          feedbackStatus.classList.add('success');
          feedbackStatus.classList.remove('error');
        }
        feedbackForm.reset();
      } else {
        throw new Error(response.message || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Feedback form submission error:', error);
      if (feedbackStatus) {
        feedbackStatus.textContent = 'Error submitting feedback. Please try again.';
        feedbackStatus.classList.add('error');
        feedbackStatus.classList.remove('success');
      }
    } finally {
      const submitButton = feedbackForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

/**
 * Admissions Form Handler
 * Submits admissions form data to backend
 */
function initAdmissionsFormHandler() {
  const admissionsForm = document.getElementById('admissionsForm');
  const admissionsStatus = document.getElementById('admissionsStatus');
  
  if (!admissionsForm) return;
  
  admissionsForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const formData = {
      studentName: document.getElementById('studentName')?.value || '',
      parentName: document.getElementById('parentName')?.value || '',
      email: document.getElementById('admissionsEmail')?.value || '',
      phone: document.getElementById('admissionsPhone')?.value || '',
      gradeLevel: document.getElementById('gradeLevel')?.value || '',
      message: document.getElementById('admissionsMessage')?.value || '',
      submittedAt: new Date().toISOString(),
    };
    
    if (!formData.studentName || !formData.parentName || !formData.email || !formData.gradeLevel) {
      if (admissionsStatus) {
        admissionsStatus.textContent = 'Please fill in all required fields.';
        admissionsStatus.classList.add('error');
        admissionsStatus.classList.remove('success');
      }
      return;
    }
    
    try {
      const submitButton = admissionsForm.querySelector('button[type="submit"]');
      const originalText = submitButton?.textContent;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
      }
      
      const response = await apiPost(API_ENDPOINTS.submissions.admissions, formData);
      
      if (response.success) {
        if (admissionsStatus) {
          admissionsStatus.textContent = 'Thank you for your application! We will review it and contact you soon.';
          admissionsStatus.classList.add('success');
          admissionsStatus.classList.remove('error');
        }
        admissionsForm.reset();
      } else {
        throw new Error(response.message || 'Failed to submit application');
      }
    } catch (error) {
      console.error('Admissions form submission error:', error);
      if (admissionsStatus) {
        admissionsStatus.textContent = 'Error submitting application. Please try again or contact us.';
        admissionsStatus.classList.add('error');
        admissionsStatus.classList.remove('success');
      }
    } finally {
      const submitButton = admissionsForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

/**
 * Initialize all form handlers when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  initContactFormHandler();
  initFeedbackFormHandler();
  initAdmissionsFormHandler();
});
