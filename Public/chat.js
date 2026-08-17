// TrustWallet Support - Real-time Chat System
// Socket.IO client configuration

const socket = io();
let currentSessionId = null;
let currentCustomerId = null;
let currentAgentId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadFAQ();
    setupEventListeners();
    checkAgentStatus();
    setInterval(checkAgentStatus, 30000); // Check every 30 seconds
});

// ===================================
// FAQ Functionality
// ===================================

async function loadFAQ() {
    try {
        const response = await fetch('/api/faq');
        const data = await response.json();
        displayFAQ(data.faqs || []);
    } catch (error) {
        console.error('Error loading FAQ:', error);
        const container = document.getElementById('faqContainer');
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #dc3545;">Error loading FAQ. Please try again.</div>';
    }
}

function displayFAQ(faqs) {
    const container = document.getElementById('faqContainer');
    
    if (!faqs || faqs.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center;">No FAQ items available.</div>';
        return;
    }

    container.innerHTML = '';

    faqs.forEach(faq => {
        const faqItem = document.createElement('div');
        faqItem.className = 'faq-item';
        faqItem.innerHTML = `
            <div class="faq-category">${escapeHtml(faq.category || 'General')}</div>
            <div class="faq-question">
                <span>${escapeHtml(faq.question)}</span>
                <span class="faq-toggle">▼</span>
            </div>
            <div class="faq-answer">${escapeHtml(faq.answer)}</div>
        `;
        
        faqItem.addEventListener('click', function() {
            // Close other items
            document.querySelectorAll('.faq-item.active').forEach(item => {
                if (item !== this) item.classList.remove('active');
            });
            this.classList.toggle('active');
        });
        
        container.appendChild(faqItem);
    });
}

function searchFAQ() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

    if (!searchTerm) {
        loadFAQ();
        return;
    }

    const faqItems = document.querySelectorAll('.faq-item');
    let visibleCount = 0;

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question span').textContent.toLowerCase();
        const answer = item.querySelector('.faq-answer').textContent.toLowerCase();
        
        if (question.includes(searchTerm) || answer.includes(searchTerm)) {
            item.style.display = 'block';
            item.classList.add('active');
            visibleCount++;
        } else {
            item.style.display = 'none';
            item.classList.remove('active');
        }
    });

    if (visibleCount === 0) {
        const container = document.getElementById('faqContainer');
        const noResults = document.createElement('div');
        noResults.className = 'faq-item';
        noResults.innerHTML = `<p style="text-align: center; color: #6b7280;">No results found for "${escapeHtml(searchTerm)}". Contact support for assistance.</p>`;
        container.appendChild(noResults);
    }
}

// ===================================
// Chat Functionality with Socket.IO
// ===================================

async function initializeChat(event) {
    event.preventDefault();

    const customerName = document.getElementById('customerName').value.trim();
    const customerEmail = document.getElementById('customerEmail').value.trim();
    const issueCategory = document.getElementById('issueCategory').value;

    if (!customerName || !customerEmail || !issueCategory) {
        alert('Please fill in all fields');
        return;
    }

    try {
        const response = await fetch('/api/chat/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerName,
                email: customerEmail,
                category: issueCategory
            })
        });

        const data = await response.json();

        if (data.success) {
            currentSessionId = data.sessionId;
            currentCustomerId = data.customerId;

            // Hide form, show chat box
            document.getElementById('chatForm').style.display = 'none';
            document.getElementById('chatBox').style.display = 'flex';

            // Connect to socket
            socket.emit('customer:connect', {
                sessionId: currentSessionId,
                customerId: currentCustomerId,
                name: customerName
            });

            addSystemMessage('Connecting to support team...');
        }
    } catch (error) {
        console.error('Error initiating chat:', error);
        alert('Failed to start chat. Please try again.');
    }
}

function endChat() {
    if (!currentSessionId) return;

    socket.emit('chat:close', { sessionId: currentSessionId });
    
    // Reset UI
    document.getElementById('chatForm').style.display = 'block';
    document.getElementById('chatBox').style.display = 'none';
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('initiateChatForm').reset();
    document.getElementById('messageInput').value = '';

    currentSessionId = null;
    currentCustomerId = null;
    currentAgentId = null;

    addSystemMessage('Chat session ended');
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message || !currentSessionId) return;

    // Add to UI
    addMessage(message, 'customer');
    messageInput.value = '';

    // Send via socket
    socket.emit('message:send', {
        sessionId: currentSessionId,
        sender: 'Customer',
        message: message,
        senderType: 'customer'
    });
}

function addMessage(message, sender) {
    const chatMessages = document.getElementById('chatMessages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${sender}`;
    
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageEl.innerHTML = `
        <div class="message-content">${escapeHtml(message)}</div>
        <div class="message-time">${now}</div>
    `;

    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message-system';
    messageEl.innerHTML = `<p>${escapeHtml(message)}</p>`;
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function checkAgentStatus() {
    try {
        const response = await fetch('/api/agents/status');
        const agents = await response.json();
        const onlineCount = agents.filter(a => a.status === 'online').length;
        
        const statusEl = document.getElementById('agentStatusText');
        const indicator = document.querySelector('.status-indicator');

        if (onlineCount > 0) {
            statusEl.textContent = `${onlineCount} Agent${onlineCount !== 1 ? 's' : ''} Online`;
            indicator.className = 'status-indicator online';
        } else {
            statusEl.textContent = 'No Agents Online';
            indicator.className = 'status-indicator offline';
        }
    } catch (error) {
        console.error('Error checking agent status:', error);
    }
}

// ===================================
// Socket.IO Event Listeners
// ===================================

socket.on('connect', () => {
    console.log('Connected to support server');
});

socket.on('chat:agent-assigned', (data) => {
    currentAgentId = data.agentId;
    addSystemMessage(`Connected with ${data.agentName}! How can we help?`);
    document.getElementById('agentInfo').textContent = `Connected with ${data.agentName}`;
});

socket.on('chat:queued', (data) => {
    addSystemMessage(`${data.message} Position: ${data.position}`);
    document.getElementById('agentInfo').textContent = 'Waiting for next available agent...';
});

socket.on('message:receive', (data) => {
    if (data.senderType === 'agent') {
        addMessage(data.message, 'agent');
    }
});

socket.on('chat:closed', (data) => {
    addSystemMessage('Chat session has been closed.');
    setTimeout(() => {
        endChat();
    }, 2000);
});

socket.on('disconnect', () => {
    console.log('Disconnected from support server');
});

// ===================================
// Event Listeners Setup
// ===================================

function setupEventListeners() {
    // Search FAQ
    document.getElementById('searchBtn').addEventListener('click', searchFAQ);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchFAQ();
    });

    // Send message
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Chat form
    document.getElementById('initiateChatForm').addEventListener('submit', initializeChat);
}

// ===================================
// Utility Functions
// ===================================

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
