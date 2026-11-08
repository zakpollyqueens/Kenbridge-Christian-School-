/**
 * Form Handlers
 * Handles form submissions across all pages
 */

const KENBRIDGE_ZAKITECH_BRIDGE="https://mmozesoarwkimhyloivu.supabase.co/functions/v1/zakitech-product-bridge";
const KENBRIDGE_THREAD_KEY="kenbridge_zakitech_contact_thread_v1";
async function kenbridgeBridgeRequest(payload){
 const response=await fetch(KENBRIDGE_ZAKITECH_BRIDGE,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_slug:"kenbridge-christian-school",...payload})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.success===false)throw new Error(data.error||"The school company support connection is unavailable.");
 return data;
}
function renderKenbridgeCompanyThread(thread){
 let host=document.getElementById("kenbridgeCompanySupportThread");
 if(!host){host=document.createElement("section");host.id="kenbridgeCompanySupportThread";host.className="contact-card";const form=document.getElementById("contactForm");form?.parentElement?.append(host);}
 host.replaceChildren();
 const heading=document.createElement("h3");heading.textContent="Company support conversation";
 const detail=document.createElement("p");detail.textContent=(thread.ticket?.subject||"School enquiry")+" · "+(thread.ticket?.status||"new");
 host.append(heading,detail);
 if(thread.ticket?.message){const first=document.createElement("article");const label=document.createElement("small");label.textContent=(thread.ticket.sender_name||"You")+" · "+new Date(thread.ticket.received_at).toLocaleString();const body=document.createElement("p");body.textContent=thread.ticket.message;first.append(label,body);host.append(first);}
 (thread.replies||[]).forEach(reply=>{const item=document.createElement("article"),meta=document.createElement("small"),body=document.createElement("p");meta.textContent=(reply.sender_name||reply.sender_type)+" · "+new Date(reply.created_at).toLocaleString();body.textContent=reply.body;item.append(meta,body);host.append(item);});
 if(!["closed","resolved"].includes(thread.ticket?.status)){
  const form=document.createElement("form"),area=document.createElement("textarea"),send=document.createElement("button");form.className="kenbridge-company-reply";area.required=true;area.maxLength=10000;area.placeholder="Reply to the school support team…";send.type="submit";send.textContent="Send reply";form.append(area,send);
  form.addEventListener("submit",async e=>{e.preventDefault();send.disabled=true;try{const saved=JSON.parse(localStorage.getItem(KENBRIDGE_THREAD_KEY)||"{}");await kenbridgeBridgeRequest({action:"reply-support-thread",conversation_id:saved.id,conversation_token:saved.token,message:area.value.trim()});const next=await kenbridgeBridgeRequest({action:"get-support-thread",conversation_id:saved.id,conversation_token:saved.token});renderKenbridgeCompanyThread(next);}catch(error){const p=document.createElement("p");p.textContent=error.message||"Could not send reply.";host.append(p);}finally{send.disabled=false;}});
  host.append(form);
 }
}
async function restoreKenbridgeCompanyThread(){
 try{const saved=JSON.parse(localStorage.getItem(KENBRIDGE_THREAD_KEY)||"{}");if(!saved.id||!saved.token)return;const thread=await kenbridgeBridgeRequest({action:"get-support-thread",conversation_id:saved.id,conversation_token:saved.token});renderKenbridgeCompanyThread(thread);}catch(error){console.info("Kenbridge company support thread could not be restored:",error.message);}
}

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
        let companyCopy = false;
        try {
          const central = await kenbridgeBridgeRequest({
            action: 'submit-support',
            sender_name: formData.name,
            sender_email: formData.email,
            subject: formData.subject,
            message: formData.message
          });
          localStorage.setItem(KENBRIDGE_THREAD_KEY, JSON.stringify({id:central.conversation_id,token:central.conversation_token}));
          const thread = await kenbridgeBridgeRequest({action:'get-support-thread',conversation_id:central.conversation_id,conversation_token:central.conversation_token});
          renderKenbridgeCompanyThread(thread);
          companyCopy = true;
        } catch (bridgeError) {
          console.warn('Kenbridge enquiry was received by the school backend, but the ZakiTech copy was not confirmed:', bridgeError);
        }
        if (contactStatus) {
          contactStatus.textContent = companyCopy
            ? 'Thank you! Your message was received by Kenbridge and forwarded to the ZakiTech Kenbridge Control Station. You can follow the company-team reply below.'
            : 'Thank you! Your message was received by the school. Please contact the school directly if you need an urgent response.';
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
  restoreKenbridgeCompanyThread();
  initContactFormHandler();
  initFeedbackFormHandler();
  initAdmissionsFormHandler();
});
