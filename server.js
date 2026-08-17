const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// In-memory storage (use database in production)
const agents = new Map();
const customers = new Map();
const chatSessions = new Map();
const messages = [];

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/faq', (req, res) => {
  try {
    const faqData = require('./data/faq.json');
    res.json(faqData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load FAQ' });
  }
});

app.get('/api/agents/status', (req, res) => {
  const agentStatus = Array.from(agents.values()).map(agent => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    activeChats: agent.activeSessions.length,
    lastSeen: agent.lastSeen
  }));
  res.json(agentStatus);
});

app.post('/api/chat/initiate', (req, res) => {
  const { customerName, email } = req.body;
  const sessionId = uuidv4();
  const customerId = uuidv4();

  const chatSession = {
    sessionId,
    customerId,
    customerName,
    email,
    createdAt: new Date(),
    status: 'waiting',
    messages: []
  };

  chatSessions.set(sessionId, chatSession);
  customers.set(customerId, {
    id: customerId,
    name: customerName,
    email,
    sessionId
  });

  res.json({
    success: true,
    sessionId,
    customerId,
    message: 'Chat session initiated'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    agents: agents.size,
    activeChats: chatSessions.size
  });
});

// Socket.IO Real-time Communication
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Agent connections
  socket.on('agent:login', (data) => {
    const { agentId, name } = data;
    agents.set(socket.id, {
      id: agentId,
      socketId: socket.id,
      name,
      status: 'online',
      activeSessions: [],
      lastSeen: new Date()
    });

    socket.join('agents');
    io.emit('agents:status-updated', {
      agentId,
      status: 'online',
      timestamp: new Date()
    });

    console.log(`Agent ${name} (${agentId}) connected`);
  });

  // Customer connections
  socket.on('customer:connect', (data) => {
    const { sessionId, customerId, name } = data;
    const chatSession = chatSessions.get(sessionId);

    if (chatSession) {
      chatSession.customerId = customerId;
      socket.join(sessionId);

      // Find available agent
      const availableAgent = Array.from(agents.values()).find(
        agent => agent.status === 'online' && agent.activeSessions.length < 5
      );

      if (availableAgent) {
        chatSession.agentId = availableAgent.id;
        chatSession.status = 'connected';
        availableAgent.activeSessions.push(sessionId);

        io.to(availableAgent.socketId).emit('chat:new-customer', {
          sessionId,
          customerId,
          customerName: chatSession.customerName,
          email: chatSession.email
        });

        socket.emit('chat:agent-assigned', {
          agentId: availableAgent.id,
          agentName: availableAgent.name
        });
      } else {
        chatSession.status = 'queued';
        socket.emit('chat:queued', {
          message: 'All agents are busy. You are in the queue.',
          position: chatSessions.size
        });
      }
    }
  });

  // Handle chat messages
  socket.on('message:send', (data) => {
    const { sessionId, sender, message, senderType } = data;
    const chatSession = chatSessions.get(sessionId);

    if (chatSession) {
      const messageData = {
        id: uuidv4(),
        sessionId,
        sender,
        senderType, // 'customer' or 'agent'
        message,
        timestamp: new Date(),
        read: false
      };

      chatSession.messages.push(messageData);
      messages.push(messageData);

      // Broadcast to both customer and agent
      io.to(sessionId).emit('message:receive', messageData);

      console.log(`Message in session ${sessionId}: ${sender} - ${message}`);
    }
  });

  // Agent status change
  socket.on('agent:status-change', (data) => {
    const { newStatus } = data;
    const agent = agents.get(socket.id);

    if (agent) {
      agent.status = newStatus;
      agent.lastSeen = new Date();

      io.emit('agents:status-updated', {
        agentId: agent.id,
        status: newStatus,
        timestamp: new Date()
      });
    }
  });

  // Close chat session
  socket.on('chat:close', (data) => {
    const { sessionId } = data;
    const chatSession = chatSessions.get(sessionId);

    if (chatSession) {
      chatSession.status = 'closed';
      chatSession.closedAt = new Date();

      // Remove from agent's active sessions
      if (chatSession.agentId) {
        const agent = Array.from(agents.values()).find(
          a => a.id === chatSession.agentId
        );
        if (agent) {
          agent.activeSessions = agent.activeSessions.filter(s => s !== sessionId);
        }
      }

      io.to(sessionId).emit('chat:closed', {
        reason: 'Session ended',
        timestamp: new Date()
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const agent = agents.get(socket.id);
    if (agent) {
      agent.status = 'offline';
      agents.delete(socket.id);

      io.emit('agents:status-updated', {
        agentId: agent.id,
        status: 'offline',
        timestamp: new Date()
      });

      console.log(`Agent ${agent.name} disconnected`);
    }
  });
});

// Static routes
app.get('/agent', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent', 'index.html'));
});

app.get('/agent/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'agent', 'login.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, () => {
  console.log(`🚀 TrustWallet Support Server running on http://localhost:${PORT}`);
  console.log(`📡 Real-time communication ready`);
});
