// TrustWallet Support - Agent Dashboard with Real-time Communication
// Socket.IO client

const socket = io();
let currentAgentId = null;
let currentAgentName = null;
let activeSessions = new Map();
let currentSelectedSession = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeAgent();
    setupEventListeners();
});

// ===================================
// Initialization
// ===================================

function initializeAgent() {
    // Get agent info from localStorage
    const agentId = localStorage.getItem('agentId');
    const agentName = localStorage.getItem('agentName');

    if (!agentId || !agentName) {
        window.location.href = '/agent/login';
        return;
    }

    currentAgentId = agentId;
    currentAgentName = agentName;

    // Display agent name
    document.getElementById('agentName').textContent = agentName;

    // Connect to socket with agent identity
    socket.emit('agent:login', {
        agentId: agentId,
        name: agentName
    });

    console.log(`Agent ${agentName} (${agentId}) logged in`);
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Chat input
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendAgentMessage();
        }
    });
}

// ===================================
// Tab Switching
// ===================================

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(tab + 'Tab').style.display = 'block';

    const pageTitle = document.getElementById('pageTitle');
    switch(tab) {
        case 'dashboard':
            pageTitle.textContent = 'Dashboard';
            break;
        case 'chats':
            pageTitle.textContent = 'Active Chats';
            break;
        case 'knowledge':
            pageTitle.textContent = 'Knowledge Base';
            break;
        case 'reports':
            pageTitle.textContent = 'Reports';
            break;
        case 'settings':
            pageTitle.textContent = 'Settings';
            break;
    }
}

// ===================================
// Socket.IO Event Listeners
// ===================================

socket.on('connect', () => {
    console.log('Connected to support server');
});

socket.on('chat:new-customer', (data) => {
    const { sessionId, customerId, customerName, email } = data;

    // Store session info
    activeSessions.set(sessionId, {
        sessionId,
        customerId,
        customerName,
        email,
        messages: [],
        createdAt: new Date()
    });

    // Update UI
    updateSessionsList();
    updateStats();

    console.log(`New customer: ${customerName} (${sessionId})`);
});

socket.on('message:receive', (data) => {
    const { sessionId, sender, message, senderType } = data;

    // Update session messages
    if (activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId);
        session.messages.push({
            sender,
            message,
            senderType,
            timestamp: new Date(data.timestamp)
        });

        // If this is the current selected session, update chat display
        if (currentSelectedSession === sessionId) {
            displaySessionMessages(sessionId);
        }
    }
});

socket.on('chat:closed', (data) => {
    console.log('Chat session closed:', data);
    updateSessionsList();
    updateStats();
});

socket.on('agents:status-updated', (data) => {
    console.log('Agent status updated:', data);
});

socket.on('disconnect', () => {
    console.log('Disconnected from support server');
});

// ===================================
// Session Management
// ===================================

function selectSession(sessionId) {
    currentSelectedSession = sessionId;

    // Update UI
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-session-id="${sessionId}"]`)?.classList.add('active');

    const session = activeSessions.get(sessionId);
    if (session) {
        document.getElementById('chatCustomerName').textContent = session.customerName;
        document.getElementById('chatCustomerEmail').textContent = session.email;
        
        // Enable chat input
        document.getElementById('chatInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('chatInput').focus();

        displaySessionMessages(sessionId);
    }
}

function displaySessionMessages(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    const container = document.getElementById('chatMessagesContainer');
    container.innerHTML = '';

    session.messages.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${msg.senderType}`;
        
        const time = new Date(msg.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        messageEl.innerHTML = `
            <div>
                <div class="message-bubble">${escapeHtml(msg.message)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;

        container.appendChild(messageEl);
    });

    container.scrollTop = container.scrollHeight;
}

function updateSessionsList() {
    const list = document.getElementById('sessionsList');

    if (activeSessions.size === 0) {
        list.innerHTML = '<li class="session-item" style="text-align: center; color: var(--gray); padding: 2rem;">No active sessions</li>';
        return;
    }

    list.innerHTML = '';

    activeSessions.forEach((session, sessionId) => {
        const lastMessage = session.messages[session.messages.length - 1];
        const preview = lastMessage 
            ? lastMessage.message.substring(0, 50) 
            : 'No messages yet';

        const li = document.createElement('li');
        li.className = 'session-item';
        li.setAttribute('data-session-id', sessionId);
        li.onclick = () => selectSession(sessionId);

        const createdTime = new Date(session.createdAt).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        li.innerHTML = `
            <div class="session-header">
                <span class="customer-name">${escapeHtml(session.customerName)}</span>
                <span class="session-status status-connected">Connected</span>
            </div>
            <div class="session-email">${escapeHtml(session.email)}</div>
            <div class="session-info">
                <span>${createdTime}</span>
                <span>•</span>
                <span>${session.messages.length} messages</span>
            </div>
            <div class="session-preview">${escapeHtml(preview)}</div>
        `;

        list.appendChild(li);
    });

    // Update active chat count
    document.getElementById('activeChatCount').textContent = activeSessions.size;
}

function updateStats() {
    // Update stats based on active sessions
    const stats = {
        activeChats: activeSessions.size,
        totalMessages: 0,
        avgResponseTime: '--'
    };

    activeSessions.forEach(session => {
        stats.totalMessages += session.messages.length;
    });

    document.getElementById('activeChatCount').textContent = stats.activeChats;
    document.getElementById('queueLength').textContent = Math.max(0, activeSessions.size - 5);
}

// ===================================
// Chat Functions
// ===================================

function sendAgentMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || !currentSelectedSession) return;

    const session = activeSessions.get(currentSelectedSession);
    if (!session) return;

    // Send via socket
    socket.emit('message:send', {
        sessionId: currentSelectedSession,
        sender: currentAgentName,
        message: message,
        senderType: 'agent'
    });

    // Clear input
    input.value = '';
    input.focus();
}

// ===================================
// Status Management
// ===================================

function changeStatus(status) {
    socket.emit('agent:status-change', { newStatus: status });
    
    const statusEl = document.getElementById('statusText');
    const indicator = document.querySelector('.status-indicator');

    statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    indicator.className = `status-indicator ${status}`;
}

// ===================================
// Logout
// ===================================

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('agentId');
        localStorage.removeItem('agentName');
        socket.disconnect();
        window.location.href = '/agent/login';
    }
}

// ===================================
// Utility Functions
// ===================================

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
